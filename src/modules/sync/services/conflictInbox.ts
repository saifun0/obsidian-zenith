import type { ModuleFs } from '../../../core/moduleFs';
import { mergeMarkdown, type MergeNote } from './conflictResolve';

/**
 * Conflict copies left behind by whatever else syncs this vault.
 *
 * Every file-sync tool resolves a collision it cannot understand by writing a
 * second file and walking away — `note.conflict.md`, `note.sync-conflict-….md`,
 * `note 2.md`. They accumulate silently: nothing lists them, nothing merges
 * them, and the user finds them months later with no idea which half is current.
 *
 * Zenith can do better than list them, because for its own notes it knows what
 * the two halves mean. This finds the pairs and offers the same reconciliation
 * the file engine uses — which matters here regardless of whether Zenith's own
 * engine is switched on at all, since these are somebody else's leftovers.
 */

export type ConflictSource = 'zenith' | 'remotely-save' | 'syncthing' | 'copy';

export interface ConflictCopy {
    /** The copy itself. */
    path: string;
    /** The note it was made from. */
    originalPath: string;
    source: ConflictSource;
}

/**
 * Recognise a conflict copy and name the note it came from.
 *
 * Patterns are matched against the filename only, and each is anchored to the
 * end so an ordinary note that merely mentions the word is not swept up. Null
 * means "an ordinary file", which is the answer that has to be right — offering
 * to merge a note the user deliberately named `Design 2.md` into `Design.md`
 * would be worse than missing a real conflict copy.
 */
export function detectConflictCopy(path: string): ConflictCopy | null {
    const slash = path.lastIndexOf('/');
    const dir = slash === -1 ? '' : path.slice(0, slash + 1);
    const name = path.slice(slash + 1);

    const dot = name.lastIndexOf('.');
    if (dot <= 0) return null;
    const stem = name.slice(0, dot);
    const ext = name.slice(dot);

    const rules: Array<{ re: RegExp; source: ConflictSource }> = [
        // Ours: `note.conflict-<device>-<timestamp>`.
        { re: /^(.+)\.conflict-[\w-]+$/, source: 'zenith' },
        // Remotely Save: `note.conflict` and `note.conflict.1`.
        { re: /^(.+)\.conflict(?:\.\d+)?$/, source: 'remotely-save' },
        // Syncthing: `note.sync-conflict-20260822-120000-ABCDEFG`.
        { re: /^(.+)\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]+$/, source: 'syncthing' },
        // iCloud and several desktop tools: `note 2`, `note (2)`.
        // Deliberately last and deliberately narrow — this is the pattern most
        // likely to catch an innocent filename.
        { re: /^(.+?)[ ]\((\d{1,2})\)$/, source: 'copy' },
    ];

    for (const rule of rules) {
        const match = rule.re.exec(stem);
        if (!match) continue;
        const originalStem = match[1].trim();
        if (!originalStem) continue;
        return {
            path,
            originalPath: `${dir}${originalStem}${ext}`,
            source: rule.source,
        };
    }

    return null;
}

export interface InboxEntry extends ConflictCopy {
    /** False when the note it came from is gone — nothing to merge it with. */
    originalExists: boolean;
}

export interface ResolveResult {
    kind: 'merged' | 'unmergeable';
    reason?: string;
    notes: MergeNote[];
}

export class ConflictInbox {
    constructor(private readonly fs: ModuleFs) {}

    /**
     * Every conflict copy under `root`.
     *
     * Only Markdown: reconciling anything else is not something this can offer,
     * and listing files it cannot act on would be a to-do list rather than an
     * inbox.
     */
    async scan(root: string): Promise<InboxEntry[]> {
        const paths = await this.fs.walk(root || '/');
        const out: InboxEntry[] = [];

        for (const path of paths) {
            if (!path.toLowerCase().endsWith('.md')) continue;
            const copy = detectConflictCopy(path);
            if (!copy) continue;
            out.push({ ...copy, originalExists: await this.fs.exists(copy.originalPath) });
        }

        return out.sort((a, b) => a.originalPath.localeCompare(b.originalPath));
    }

    /**
     * Reconcile a copy into its original and delete the copy.
     *
     * The copy is only removed once the merged text is written, so an
     * interrupted run leaves both files rather than neither.
     */
    async reconcile(entry: InboxEntry): Promise<ResolveResult> {
        if (!entry.originalExists) {
            return { kind: 'unmergeable', reason: 'the original is gone', notes: [] };
        }

        const original = await this.fs.read(entry.originalPath);
        const copy = await this.fs.read(entry.path);

        const outcome = mergeMarkdown(original, copy, { prefer: 'local' });
        if (outcome.kind === 'unmergeable') {
            return { kind: 'unmergeable', reason: outcome.reason, notes: [] };
        }

        if (outcome.kind === 'merged') {
            await this.fs.write(entry.originalPath, outcome.text);
        }
        await this.fs.removeFile(entry.path);
        return { kind: 'merged', notes: outcome.kind === 'merged' ? outcome.notes : [] };
    }

    /** Throw the copy away, keeping the original as it is. */
    async keepOriginal(entry: InboxEntry): Promise<void> {
        await this.fs.removeFile(entry.path);
    }

    /** Promote the copy over the original. */
    async keepCopy(entry: InboxEntry): Promise<void> {
        const copy = await this.fs.read(entry.path);
        await this.fs.write(entry.originalPath, copy);
        await this.fs.removeFile(entry.path);
    }
}
