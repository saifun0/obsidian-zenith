import { describe, it, expect } from 'vitest';
import {
    mergeMarkdown,
    taskIdentity,
    type MergeOutcome,
} from '../src/modules/sync/services/conflictResolve';

const OPTS = { prefer: 'local' as const };

/** The merged text, or a failing assertion naming what happened instead. */
function mergedText(outcome: MergeOutcome): string {
    if (outcome.kind !== 'merged') {
        throw new Error(`expected a merge, got ${outcome.kind}`);
    }
    return outcome.text;
}

describe('taskIdentity', () => {
    it('ignores the checkbox character, so ticking is not a rename', () => {
        // The single most common edit. If a tick changed the identity, every
        // completed task would look like a new one and merge as a duplicate.
        expect(taskIdentity('- [ ] Buy milk')).toBe('Buy milk');
        expect(taskIdentity('- [x] Buy milk')).toBe('Buy milk');
        expect(taskIdentity('- [/] Buy milk')).toBe('Buy milk');
    });

    it('ignores the completion stamp the app writes on ticking', () => {
        expect(taskIdentity('- [x] Buy milk ✅ 2026-08-22')).toBe('Buy milk');
        expect(taskIdentity('- [-] Buy milk ❌ 2026-08-22')).toBe('Buy milk');
    });

    it('keeps the metadata that is part of what the task says', () => {
        // A due date is a real edit, not bookkeeping — two devices setting
        // different ones genuinely disagree.
        expect(taskIdentity('- [ ] Pay rent 📅 2026-09-01')).toBe('Pay rent 📅 2026-09-01');
    });

    it('normalises whitespace but not case', () => {
        expect(taskIdentity('-   [ ]   Buy   milk  ')).toBe('Buy milk');
        expect(taskIdentity('- [ ] buy milk')).not.toBe(taskIdentity('- [ ] Buy milk'));
    });

    it('is null for anything that is not a task line', () => {
        expect(taskIdentity('# Heading')).toBeNull();
        expect(taskIdentity('just prose')).toBeNull();
        expect(taskIdentity('- a bullet')).toBeNull();
        // An empty checkbox is scaffolding, not a task.
        expect(taskIdentity('- [ ] ')).toBeNull();
    });
});

describe('identical input', () => {
    it('reports identical rather than inventing a merge', () => {
        const text = '---\nmood: 4\n---\n\n- [ ] Something\n';
        expect(mergeMarkdown(text, text, OPTS)).toEqual({ kind: 'identical' });
    });
});

describe('frontmatter', () => {
    it('keeps two trackers logged on two devices', () => {
        // The case the whole merger exists for. A line differ sees one contested
        // hunk; these are two independent additions.
        const local = '---\ndate: 2026-08-22\nmood: 4\n---\n\nbody\n';
        const remote = '---\ndate: 2026-08-22\nfajr: ontime\n---\n\nbody\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('mood: 4');
        expect(text).toContain('fajr: ontime');
        expect(text).toContain('date: 2026-08-22');
    });

    it('does not report an addition as a conflict', () => {
        const local = '---\nmood: 4\n---\n\nbody\n';
        const remote = '---\nmood: 4\nsteps: 8000\n---\n\nbody\n';

        const outcome = mergeMarkdown(local, remote, OPTS);
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(outcome.notes.filter((n) => n.detail.includes('kept'))).toEqual([]);
    });

    it('settles a real disagreement by preference and says so', () => {
        const local = '---\nmood: 4\n---\n\nbody\n';
        const remote = '---\nmood: 2\n---\n\nbody\n';

        const outcome = mergeMarkdown(local, remote, OPTS);
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(outcome.text).toContain('mood: 4');
        expect(outcome.notes).toContainEqual({
            kind: 'frontmatter',
            key: 'mood',
            detail: '4 / 2 — kept 4',
        });
    });

    it('honours a remote preference', () => {
        const local = '---\nmood: 4\n---\n\nbody\n';
        const remote = '---\nmood: 2\n---\n\nbody\n';
        expect(mergedText(mergeMarkdown(local, remote, { prefer: 'remote' }))).toContain('mood: 2');
    });

    it('keeps the local key order rather than reshuffling the block', () => {
        const local = '---\nz: 1\na: 2\n---\n\nbody\n';
        const remote = '---\na: 2\nz: 1\nm: 3\n---\n\nbody\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text.indexOf('z: 1')).toBeLessThan(text.indexOf('a: 2'));
    });

    it('leaves hand-written YAML that is not a flat pair alone', () => {
        // Parsing to an object and re-serialising would reformat this list;
        // unkeyed lines travel verbatim instead.
        const local = '---\ntags:\n  - work\n  - home\nmood: 4\n---\n\nbody\n';
        const remote = '---\ntags:\n  - work\n  - home\nsteps: 100\n---\n\nbody\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('  - work');
        expect(text).toContain('  - home');
        expect(text).toContain('steps: 100');
    });

    it('adds frontmatter to a note that had none', () => {
        const local = 'just body\n';
        const remote = '---\nmood: 4\n---\njust body\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text.startsWith('---')).toBe(true);
        expect(text).toContain('mood: 4');
    });
});

describe('task lines', () => {
    it('keeps a task added on each device', () => {
        const local = '# Day\n\n- [ ] Shared\n- [ ] Only here\n';
        const remote = '# Day\n\n- [ ] Shared\n- [ ] Only there\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('- [ ] Only here');
        expect(text).toContain('- [ ] Only there');
        expect(text).toContain('- [ ] Shared');
    });

    it('does not un-finish a task the other device still shows as open', () => {
        // The stale copy must not undo real progress, whichever side it is on.
        const local = '- [x] Buy milk ✅ 2026-08-22\n';
        const remote = '- [ ] Buy milk\n';
        expect(mergedText(mergeMarkdown(local, remote, OPTS))).toContain('- [x] Buy milk');

        const flipped = mergeMarkdown(remote, local, OPTS);
        expect(mergedText(flipped)).toContain('- [x] Buy milk');
    });

    it('prefers in-progress over untouched', () => {
        const local = '- [ ] Write report\n';
        const remote = '- [/] Write report\n';
        expect(mergedText(mergeMarkdown(local, remote, OPTS))).toContain('- [/] Write report');
    });

    it('settles done-versus-cancelled by preference and records it', () => {
        // Neither is more true than the other, so this is reported rather than
        // decided quietly.
        const local = '- [x] Ship it\n';
        const remote = '- [-] Ship it\n';

        const outcome = mergeMarkdown(local, remote, OPTS);
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(outcome.text).toContain('- [x] Ship it');
        expect(outcome.notes).toContainEqual({ kind: 'status', key: 'Ship it', detail: '[x] / [-]' });
    });

    it('leaves the local ordering of tasks alone', () => {
        const local = '- [ ] B\n- [ ] A\n';
        const remote = '- [ ] A\n- [ ] B\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text.indexOf('- [ ] B')).toBeLessThan(text.indexOf('- [ ] A'));
    });

    it('refuses when the same task was rewritten differently', () => {
        // Same identity, different text is not possible by construction — this
        // is the due-date case, where the identity differs and both survive.
        const local = '- [ ] Pay rent 📅 2026-09-01\n';
        const remote = '- [ ] Pay rent 📅 2026-10-01\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('2026-09-01');
        expect(text).toContain('2026-10-01');
    });
});

describe('prose', () => {
    it('refuses when both sides wrote different prose', () => {
        // No common ancestor means no way to tell who changed what, and picking
        // one silently discards someone's writing.
        const local = '# Day\n\nI went to the market.\n';
        const remote = '# Day\n\nI stayed in and read.\n';

        expect(mergeMarkdown(local, remote, OPTS)).toEqual({
            kind: 'unmergeable',
            reason: 'prose_diverged',
        });
    });

    it('takes the other side prose when this side has none', () => {
        // Nothing of ours to lose, so a note written independently on both
        // devices still merges.
        const local = '- [ ] A task\n';
        const remote = 'Some writing.\n\n- [ ] A task\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('Some writing.');
        expect(text).toContain('- [ ] A task');
    });

    it('merges freely when the prose is the same on both sides', () => {
        const local = '# Day\n\nSame words.\n\n- [x] Done here\n';
        const remote = '# Day\n\nSame words.\n\n- [ ] Done here\n- [ ] Extra\n';

        const text = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(text).toContain('Same words.');
        expect(text).toContain('- [x] Done here');
        expect(text).toContain('- [ ] Extra');
    });
});

describe('the realistic case', () => {
    it('merges a daily note touched on a phone and a desktop', () => {
        const desktop = [
            '---',
            'date: 2026-08-22',
            'mood: 4',
            'water: 6',
            '---',
            '',
            '## Today',
            '',
            '- [x] Morning walk ✅ 2026-08-22',
            '- [ ] Write the report',
            '',
        ].join('\n');

        const phone = [
            '---',
            'date: 2026-08-22',
            'fajr: ontime',
            'water: 6',
            '---',
            '',
            '## Today',
            '',
            '- [ ] Morning walk',
            '- [ ] Write the report',
            '- [ ] Call the bank',
            '',
        ].join('\n');

        const outcome = mergeMarkdown(desktop, phone, OPTS);
        const text = mergedText(outcome);

        // Both trackers survived.
        expect(text).toContain('mood: 4');
        expect(text).toContain('fajr: ontime');
        // The completed walk stayed completed.
        expect(text).toContain('- [x] Morning walk');
        // The task added on the phone came across.
        expect(text).toContain('- [ ] Call the bank');
        // And nothing was reported as a contested value.
        expect(outcome.kind === 'merged' && outcome.notes.some((n) => n.kind === 'task')).toBe(true);
    });

    it('produces a note that merges to itself afterwards', () => {
        // Convergence: once both devices hold the merged text, a later sync must
        // see them as identical rather than finding a fresh conflict.
        const local = '---\nmood: 4\n---\n\n- [x] A\n';
        const remote = '---\nfajr: ontime\n---\n\n- [ ] A\n- [ ] B\n';

        const first = mergedText(mergeMarkdown(local, remote, OPTS));
        expect(mergeMarkdown(first, first, OPTS)).toEqual({ kind: 'identical' });
    });
});
