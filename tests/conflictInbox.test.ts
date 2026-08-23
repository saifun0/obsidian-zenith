import { describe, it, expect } from 'vitest';
import type { ModuleFs } from '../src/core/moduleFs';
import { ConflictInbox, detectConflictCopy } from '../src/modules/sync/services/conflictInbox';

function fakeFs(files: Record<string, string>): ModuleFs {
    return {
        exists: async (p) => Object.hasOwn(files, p),
        read: async (p) => files[p] ?? '',
        write: async (p, data) => {
            files[p] = data;
        },
        listFolders: async () => [],
        listFiles: async () => [],
        mkdirp: async () => undefined,
        removeDir: async () => undefined,
        removeFile: async (p) => {
            delete files[p];
        },
        stat: async (p) =>
            Object.hasOwn(files, p)
                ? { type: 'file' as const, ctime: 0, mtime: 0, size: files[p].length }
                : null,
        readBinary: async () => new ArrayBuffer(0),
        writeBinary: async () => undefined,
        walk: async () => Object.keys(files),
    };
}

describe('detectConflictCopy', () => {
    it('recognises what Remotely Save leaves behind', () => {
        expect(detectConflictCopy('Notes/day.conflict.md')).toMatchObject({
            originalPath: 'Notes/day.md',
            source: 'remotely-save',
        });
        expect(detectConflictCopy('day.conflict.1.md')).toMatchObject({
            originalPath: 'day.md',
            source: 'remotely-save',
        });
    });

    it('recognises what Syncthing leaves behind', () => {
        expect(detectConflictCopy('day.sync-conflict-20260822-120000-ABCDEFG.md')).toMatchObject({
            originalPath: 'day.md',
            source: 'syncthing',
        });
    });

    it('recognises its own copies', () => {
        expect(detectConflictCopy('day.conflict-desktop-2026-08-22-12-00-00.md')).toMatchObject({
            originalPath: 'day.md',
            source: 'zenith',
        });
    });

    it('recognises a numbered duplicate', () => {
        expect(detectConflictCopy('day (2).md')).toMatchObject({
            originalPath: 'day.md',
            source: 'copy',
        });
    });

    it('leaves ordinary notes alone', () => {
        // Getting this wrong is worse than missing a real conflict copy: it
        // would offer to merge two notes the user deliberately keeps apart.
        for (const path of [
            'Notes/Design.md',
            'Notes/Design 2.md',
            'conflict.md',
            'How to resolve a conflict.md',
            'sync-conflict notes.md',
            'day.conflicted.md',
        ]) {
            expect(detectConflictCopy(path)).toBeNull();
        }
    });

    it('keeps the folder', () => {
        expect(detectConflictCopy('a/b/c/day.conflict.md')?.originalPath).toBe('a/b/c/day.md');
    });

    it('ignores a file with no real extension', () => {
        // `day.conflict` reads as a file named `day` with an odd extension, and
        // there is no way to tell that from a note somebody named that way. The
        // scan only offers to act on `.md` anyway, so guessing here would buy
        // nothing and could cost a file.
        expect(detectConflictCopy('day.conflict')).toBeNull();
        expect(detectConflictCopy('README')).toBeNull();
    });
});

describe('scan', () => {
    it('lists copies and says whether the original is still there', async () => {
        const inbox = new ConflictInbox(
            fakeFs({
                'day.md': 'original',
                'day.conflict.md': 'copy',
                'gone.conflict.md': 'orphan',
                'ordinary.md': 'nothing to see',
            })
        );

        const found = await inbox.scan('');
        expect(found).toHaveLength(2);
        expect(found.find((e) => e.path === 'day.conflict.md')?.originalExists).toBe(true);
        expect(found.find((e) => e.path === 'gone.conflict.md')?.originalExists).toBe(false);
    });

    it('ignores anything that is not Markdown', async () => {
        const inbox = new ConflictInbox(fakeFs({ 'photo.conflict.png': 'bytes' }));
        expect(await inbox.scan('')).toEqual([]);
    });
});

describe('reconcile', () => {
    it('merges the copy into the original and removes it', async () => {
        const files: Record<string, string> = {
            'day.md': '---\nmood: 4\n---\n\n- [x] Walk\n',
            'day.conflict.md': '---\nfajr: ontime\n---\n\n- [ ] Walk\n- [ ] Call\n',
        };
        const inbox = new ConflictInbox(fakeFs(files));

        const entry = (await inbox.scan(''))[0];
        const result = await inbox.reconcile(entry);

        expect(result.kind).toBe('merged');
        expect(files['day.md']).toContain('mood: 4');
        expect(files['day.md']).toContain('fajr: ontime');
        expect(files['day.md']).toContain('- [x] Walk');
        expect(files['day.md']).toContain('- [ ] Call');
        expect(files['day.conflict.md']).toBeUndefined();
    });

    it('refuses and keeps both when the prose diverged', async () => {
        const files: Record<string, string> = {
            'day.md': '# Day\n\nI went out.\n',
            'day.conflict.md': '# Day\n\nI stayed in.\n',
        };
        const inbox = new ConflictInbox(fakeFs(files));

        const result = await inbox.reconcile((await inbox.scan(''))[0]);

        expect(result).toMatchObject({ kind: 'unmergeable', reason: 'prose_diverged' });
        // Nothing was touched, so the user still has both halves.
        expect(files['day.md']).toContain('I went out.');
        expect(files['day.conflict.md']).toContain('I stayed in.');
    });

    it('refuses when the original is gone', async () => {
        const inbox = new ConflictInbox(fakeFs({ 'gone.conflict.md': 'orphan' }));
        const result = await inbox.reconcile((await inbox.scan(''))[0]);
        expect(result).toMatchObject({ kind: 'unmergeable', reason: 'the original is gone' });
    });
});

describe('the manual choices', () => {
    it('keepOriginal throws the copy away', async () => {
        const files: Record<string, string> = { 'day.md': 'keep me', 'day.conflict.md': 'drop me' };
        const inbox = new ConflictInbox(fakeFs(files));

        await inbox.keepOriginal((await inbox.scan(''))[0]);
        expect(files['day.md']).toBe('keep me');
        expect(files['day.conflict.md']).toBeUndefined();
    });

    it('keepCopy promotes the copy over the original', async () => {
        const files: Record<string, string> = { 'day.md': 'old', 'day.conflict.md': 'new' };
        const inbox = new ConflictInbox(fakeFs(files));

        await inbox.keepCopy((await inbox.scan(''))[0]);
        expect(files['day.md']).toBe('new');
        expect(files['day.conflict.md']).toBeUndefined();
    });
});
