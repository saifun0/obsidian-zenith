import { describe, it, expect } from 'vitest';
import {
    buildSyncPlan,
    conflictCopyName,
    same,
    sameRemote,
    toPrevRecord,
} from '../src/modules/sync/services/syncPlan';
import {
    ACTIONABLE_DECISIONS,
    DESTRUCTIVE_DECISIONS,
    type FileEntity,
    type PlanOptions,
    type PrevSide,
    type PrevSyncRecord,
    type SyncDecision,
} from '../src/modules/sync/fileSyncTypes';

const f = (key: string, size: number, mtimeCli: number): FileEntity => ({ key, size, mtimeCli });

/**
 * A previous-sync record. Both sides default to the same size and time, which
 * is the shape you get from a server that preserved the client's mtime; the
 * `remote` override covers servers that stamp their own.
 */
const p = (
    key: string,
    size: number,
    mtime: number,
    remote?: Partial<PrevSide>
): PrevSyncRecord => ({
    key,
    local: { size, mtime },
    remote: { size, mtime, ...remote },
});

const OPTS: PlanOptions = {
    conflictAction: 'keep_newer',
    protectModifyRatio: 0.5,
    protectMinFiles: 10,
    maxFileSize: 0,
    mtimeToleranceMs: 2000,
    isExcluded: () => false,
    isMergeable: (k: string) => k.endsWith('.md'),
    deviceLabel: 'desktop',
    now: 1_700_000_000_000,
    firstRun: false,
};

const opts = (patch: Partial<PlanOptions> = {}): PlanOptions => ({ ...OPTS, ...patch });

/** The decision for a single path, for the matrix below. */
function decisionFor(
    local: FileEntity | null,
    remote: FileEntity | null,
    prev: PrevSyncRecord | null,
    patch: Partial<PlanOptions> = {}
): SyncDecision {
    const plan = buildSyncPlan(
        local ? [local] : [],
        remote ? [remote] : [],
        prev ? [prev] : [],
        opts(patch)
    );
    return plan.items[0].decision;
}

describe('same', () => {
    it('needs both size and timestamp to match', () => {
        expect(same(f('a', 10, 1000), f('a', 10, 1000), 0)).toBe(true);
        expect(same(f('a', 11, 1000), f('a', 10, 1000), 0)).toBe(false);
        expect(same(f('a', 10, 5000), f('a', 10, 1000), 0)).toBe(false);
    });

    it('absorbs whole-second timestamp granularity', () => {
        // FAT and several WebDAV servers store seconds. Without slack every file
        // reads as modified on every run and the engine ships the vault back and
        // forth forever.
        expect(same(f('a', 10, 1000), f('a', 10, 2500), 2000)).toBe(true);
        expect(same(f('a', 10, 1000), f('a', 10, 4000), 2000)).toBe(false);
    });

    it('is false when either side is missing', () => {
        expect(same(undefined, f('a', 10, 1), 0)).toBe(false);
        expect(same(f('a', 10, 1), undefined, 0)).toBe(false);
    });
});

// ── The matrix ───────────────────────────────────────

describe('no previous record', () => {
    it('treats a file only we have as a creation', () => {
        expect(decisionFor(f('a.md', 10, 100), null, null)).toBe('local_is_created_then_push');
    });

    it('treats a file only they have as a creation', () => {
        expect(decisionFor(null, f('a.md', 10, 100), null)).toBe('remote_is_created_then_pull');
    });

    it('does nothing when both sides already agree', () => {
        expect(decisionFor(f('a.md', 10, 100), f('a.md', 10, 100), null)).toBe('equal');
    });

    it('treats a disagreement as a conflict rather than guessing', () => {
        expect(decisionFor(f('a.md', 10, 100), f('a.md', 20, 500), null)).toBe(
            'conflict_created_then_keep_remote'
        );
    });

    it('NEVER produces a deletion', () => {
        // The rule that matters most. A remote returning an empty listing after
        // an expired token must read as "nothing known", never as "the user
        // deleted their vault".
        const vault = ['a.md', 'b.md', 'c.md'].map((k, i) => f(k, 10, 100 + i));
        const plan = buildSyncPlan(vault, [], [], opts());

        for (const item of plan.items) {
            expect(DESTRUCTIVE_DECISIONS.has(item.decision)).toBe(false);
        }
        expect(plan.stats.push).toBe(3);
    });
});

describe('deletions', () => {
    it('propagates a remote deletion we did not touch', () => {
        const prev = p('a.md', 10, 100);
        expect(decisionFor(f('a.md', 10, 100), null, prev)).toBe(
            'remote_is_deleted_thus_also_delete_local'
        );
    });

    it('propagates a local deletion they did not touch', () => {
        const prev = p('a.md', 10, 100);
        expect(decisionFor(null, f('a.md', 10, 100), prev)).toBe(
            'local_is_deleted_thus_also_delete_remote'
        );
    });

    it('keeps our edit when the remote deleted the file', () => {
        // A deletion the user has to repeat costs one action; an edit thrown
        // away costs work they may never notice is gone.
        const prev = p('a.md', 10, 100);
        expect(decisionFor(f('a.md', 40, 900), null, prev)).toBe('local_is_modified_then_push');
    });

    it('keeps their edit when we deleted the file', () => {
        const prev = p('a.md', 10, 100);
        expect(decisionFor(null, f('a.md', 40, 900), prev)).toBe('remote_is_modified_then_pull');
    });

    it('does nothing when both sides already removed it', () => {
        expect(decisionFor(null, null, p('a.md', 10, 100))).toBe('equal');
    });
});

describe('modifications', () => {
    const prev = p('a.md', 10, 100);

    it('does nothing when neither side moved', () => {
        expect(decisionFor(f('a.md', 10, 100), f('a.md', 10, 100), prev)).toBe('equal');
    });

    it('pushes when only we moved', () => {
        expect(decisionFor(f('a.md', 20, 500), f('a.md', 10, 100), prev)).toBe(
            'local_is_modified_then_push'
        );
    });

    it('pulls when only they moved', () => {
        expect(decisionFor(f('a.md', 10, 100), f('a.md', 20, 500), prev)).toBe(
            'remote_is_modified_then_pull'
        );
    });

    it('does nothing when both moved to the same result', () => {
        expect(decisionFor(f('a.md', 20, 500), f('a.md', 20, 500), prev)).toBe('equal');
    });

    it('calls it a conflict when both moved and disagree', () => {
        const d = decisionFor(f('a.md', 20, 500), f('a.md', 30, 900), prev);
        expect(d.startsWith('conflict_created')).toBe(true);
    });
});

describe('conflict rules', () => {
    const prev = p('a.md', 10, 100);
    const older = f('a.md', 900, 500);
    const newer = f('a.md', 20, 900);

    it('keep_newer uses the client timestamp, not the server one', () => {
        // The server's timestamp is when the upload landed, which would hand
        // every contest to whichever device synced last rather than to whoever
        // actually wrote most recently.
        const remote: FileEntity = { ...newer, mtimeSvr: 1 };
        expect(decisionFor(older, remote, prev, { conflictAction: 'keep_newer' })).toBe(
            'conflict_created_then_keep_remote'
        );
        expect(decisionFor(newer, { ...older, mtimeSvr: 9_999 }, prev)).toBe(
            'conflict_created_then_keep_local'
        );
    });

    it('keep_larger picks by size', () => {
        expect(decisionFor(older, newer, prev, { conflictAction: 'keep_larger' })).toBe(
            'conflict_created_then_keep_local'
        );
    });

    it('keep_both names a copy that will not collide with the next conflict', () => {
        const plan = buildSyncPlan([older], [newer], [prev], opts({ conflictAction: 'keep_both' }));
        const item = plan.items[0];

        expect(item.decision).toBe('conflict_created_then_keep_both');
        expect(item.conflictCopyKey).toBeDefined();
        expect(item.conflictCopyKey).not.toBe('a.md');
    });
});

describe('conflictCopyName', () => {
    it('keeps the extension so Obsidian still reads it as Markdown', () => {
        const name = conflictCopyName('notes/a.md', 'desktop', 1_700_000_000_000);
        expect(name.endsWith('.md')).toBe(true);
        expect(name.startsWith('notes/a.conflict-desktop-')).toBe(true);
    });

    it('appends when there is no extension', () => {
        expect(conflictCopyName('notes/README', 'desktop', 0)).toMatch(
            /^notes\/README\.conflict-desktop-/
        );
    });

    it('is not fooled by a dot in a folder name', () => {
        const name = conflictCopyName('my.folder/note', 'desktop', 0);
        expect(name).toMatch(/^my\.folder\/note\.conflict-/);
    });

    it('sanitises a device name into something filename-safe', () => {
        const name = conflictCopyName('a.md', 'Саша / iPhone 15', 0);
        expect(name).not.toMatch(/[/\s]/);
    });

    it('gives two conflicts on one file different names', () => {
        const first = conflictCopyName('a.md', 'desktop', 1_700_000_000_000);
        const second = conflictCopyName('a.md', 'desktop', 1_700_000_100_000);
        expect(first).not.toBe(second);
    });
});

describe('skipping', () => {
    it('leaves an oversized file alone on both sides', () => {
        // Half-applying a decision to it would be worse than skipping.
        expect(
            decisionFor(f('big.zip', 5_000_000, 100), null, null, { maxFileSize: 1_000_000 })
        ).toBe('skipped_too_large');
        expect(
            decisionFor(null, f('big.zip', 5_000_000, 100), null, { maxFileSize: 1_000_000 })
        ).toBe('skipped_too_large');
    });

    it('applies no size limit when the limit is zero', () => {
        expect(decisionFor(f('big.zip', 5_000_000, 100), null, null, { maxFileSize: 0 })).toBe(
            'local_is_created_then_push'
        );
    });

    it('never touches an excluded path, even one it would otherwise delete', () => {
        const prev = p('.obsidian/plugins/zenith/data.json', 10, 100);
        expect(
            decisionFor(f('.obsidian/plugins/zenith/data.json', 10, 100), null, prev, {
                isExcluded: (k) => k.endsWith('data.json'),
            })
        ).toBe('skipped_excluded');
    });
});

describe('safety rails', () => {
    /** n files that exist locally and in prev, but have vanished remotely. */
    const massDeletion = (n: number) => {
        const local = Array.from({ length: n }, (_, i) => f(`note-${i}.md`, 10, 100));
        const prev = local.map((e) => p(e.key, e.size, e.mtimeCli));
        return buildSyncPlan(local, [], prev, opts());
    };

    it('blocks a plan that would delete most of the vault', () => {
        const plan = massDeletion(40);
        expect(plan.blocked).toMatchObject({ kind: 'too_many_changes' });
        expect(plan.blocked?.ratio).toBeGreaterThan(0.5);
    });

    it('still computes the whole plan so it can be reviewed', () => {
        // The rail is advisory: refusing to even show what it wanted to do would
        // leave the user with no way to find out why.
        const plan = massDeletion(40);
        expect(plan.items).toHaveLength(40);
        expect(plan.stats.deleteLocal).toBe(40);
    });

    it('does not apply the ratio rail to a handful of files', () => {
        // With three files every change is 33%, and a rail that fires constantly
        // trains the user to click through it.
        const plan = massDeletion(3);
        expect(plan.blocked).toBeNull();
    });

    it('measures deletions, not activity — a hundred new notes is a normal day', () => {
        const local = Array.from({ length: 100 }, (_, i) => f(`new-${i}.md`, 10, 100));
        const plan = buildSyncPlan(local, [], [], opts());
        expect(plan.stats.push).toBe(100);
        expect(plan.blocked).toBeNull();
    });

    it('forces the first run against a remote to be reviewed', () => {
        const plan = buildSyncPlan([f('a.md', 10, 100)], [], [], opts({ firstRun: true }));
        expect(plan.blocked).toMatchObject({ kind: 'first_run_requires_review' });
    });

    it('does not interrupt a first run that would do nothing', () => {
        const plan = buildSyncPlan(
            [f('a.md', 10, 100)],
            [f('a.md', 10, 100)],
            [],
            opts({ firstRun: true })
        );
        expect(plan.actionable).toBe(0);
        expect(plan.blocked).toBeNull();
    });
});

describe('the plan as a whole', () => {
    it('covers every path from all three sides exactly once', () => {
        const plan = buildSyncPlan(
            [f('only-local.md', 1, 1), f('both.md', 1, 1)],
            [f('only-remote.md', 1, 1), f('both.md', 1, 1)],
            [p('only-prev.md', 1, 1)],
            opts()
        );

        expect(plan.items.map((i) => i.key)).toEqual([
            'both.md',
            'only-local.md',
            'only-prev.md',
            'only-remote.md',
        ]);
    });

    it('counts actionable items consistently with the decision set', () => {
        const plan = buildSyncPlan(
            [f('push.md', 1, 1), f('same.md', 1, 1)],
            [f('pull.md', 1, 1), f('same.md', 1, 1)],
            [],
            opts()
        );

        const expected = plan.items.filter((i) => ACTIONABLE_DECISIONS.has(i.decision)).length;
        expect(plan.actionable).toBe(expected);
        expect(plan.actionable).toBe(2);
    });

    it('gives every item a reason a person can read', () => {
        const plan = buildSyncPlan([f('a.md', 1, 1)], [f('b.md', 1, 1)], [p('c.md', 1, 1)], opts());
        for (const item of plan.items) {
            expect(item.reason.length).toBeGreaterThan(0);
        }
    });

    it('is deterministic — the same inputs give the same plan', () => {
        const local = [f('a.md', 1, 1), f('b.md', 2, 2)];
        const remote = [f('b.md', 9, 9), f('c.md', 3, 3)];
        const prev = [p('b.md', 2, 2)];

        expect(buildSyncPlan(local, remote, prev, opts())).toEqual(
            buildSyncPlan(local, remote, prev, opts())
        );
    });
});

describe('a server that stamps its own timestamps', () => {
    it('does not re-push a file just because the upload time differs', () => {
        // The failure this two-sided record exists to prevent: comparing the
        // server's upload time against the local mtime marks every file modified
        // on every run, and the vault ships back and forth forever.
        const local = f('a.md', 10, 1_000);
        const remote: FileEntity = { key: 'a.md', size: 10, mtimeCli: 9_000, mtimeSvr: 9_000 };
        const prev = p('a.md', 10, 1_000, { mtime: 9_000 });

        expect(decisionFor(local, remote, prev)).toBe('equal');
    });

    it('still notices a real remote edit', () => {
        const local = f('a.md', 10, 1_000);
        const remote: FileEntity = { key: 'a.md', size: 44, mtimeCli: 50_000, mtimeSvr: 50_000 };
        const prev = p('a.md', 10, 1_000, { mtime: 9_000 });

        expect(decisionFor(local, remote, prev)).toBe('remote_is_modified_then_pull');
    });

    it('trusts an etag over size and time when the server offers one', () => {
        const remote: FileEntity = {
            key: 'a.md',
            size: 10,
            mtimeCli: 123,
            mtimeSvr: 123,
            etag: 'v1',
        };
        // Times disagree wildly, but the server says it is the same version.
        expect(sameRemote(remote, { size: 999, mtime: 999_999, etag: 'v1' }, 0)).toBe(true);
        expect(sameRemote(remote, { size: 10, mtime: 123, etag: 'v2' }, 0)).toBe(false);
    });

    it('falls back to size and time when only one side has an etag', () => {
        const remote: FileEntity = { key: 'a.md', size: 10, mtimeCli: 5, mtimeSvr: 100, etag: 'v1' };
        expect(sameRemote(remote, { size: 10, mtime: 100 }, 0)).toBe(true);
    });
});

describe('toPrevRecord', () => {
    it('records each side against its own clock', () => {
        const local = f('a.md', 10, 1_000);
        const remote: FileEntity = {
            key: 'a.md',
            size: 10,
            mtimeCli: 1_000,
            mtimeSvr: 9_000,
            etag: 'v7',
        };

        expect(toPrevRecord(local, remote)).toEqual({
            key: 'a.md',
            local: { size: 10, mtime: 1_000 },
            remote: { size: 10, mtime: 9_000, etag: 'v7' },
        });
    });

    it('falls back to the client time when the server offered none', () => {
        const e = f('a.md', 10, 1_000);
        expect(toPrevRecord(e, e).remote.mtime).toBe(1_000);
    });

    it('round-trips: a record written now reads as unchanged next run', () => {
        const local = f('a.md', 10, 1_000);
        const remote: FileEntity = { key: 'a.md', size: 10, mtimeCli: 1_000, mtimeSvr: 9_000 };
        const prev = toPrevRecord(local, remote);

        expect(decisionFor(local, remote, prev)).toBe('equal');
    });
});

describe('smart conflicts', () => {
    const prev = p('a.md', 10, 100);

    it('promises a merge attempt for Markdown', () => {
        // The plan has metadata, not contents, so it can only promise to try.
        // What actually happened is reported by the run.
        expect(
            decisionFor(f('a.md', 20, 500), f('a.md', 30, 900), prev, { conflictAction: 'smart' })
        ).toBe('conflict_created_then_smart_merge');
    });

    it('names a conflict copy anyway, for the fallback', () => {
        const plan = buildSyncPlan(
            [f('a.md', 20, 500)],
            [f('a.md', 30, 900)],
            [prev],
            opts({ conflictAction: 'smart' })
        );
        expect(plan.items[0].conflictCopyKey).toBeDefined();
    });

    it('falls back to keeping both for anything that is not Markdown', () => {
        // Reasoning about frontmatter and task lines in a PDF would produce
        // something that looks like a merge and is not one.
        const pdfPrev = p('scan.pdf', 10, 100);
        expect(
            decisionFor(f('scan.pdf', 20, 500), f('scan.pdf', 30, 900), pdfPrev, {
                conflictAction: 'smart',
            })
        ).toBe('conflict_created_then_keep_both');
    });

    it('counts as a conflict in the summary', () => {
        const plan = buildSyncPlan(
            [f('a.md', 20, 500)],
            [f('a.md', 30, 900)],
            [prev],
            opts({ conflictAction: 'smart' })
        );
        expect(plan.stats.conflict).toBe(1);
        expect(plan.actionable).toBe(1);
    });
});
