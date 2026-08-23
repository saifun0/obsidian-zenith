import type { DataAdapter, Stat } from 'obsidian';

/**
 * The filesystem operations the module system needs, and nothing else.
 *
 * A thin wrapper rather than direct adapter calls, for two reasons: it keeps
 * the platform quirks (a missing folder that throws instead of returning empty,
 * `list` returning full paths where callers want names, `mkdir` not creating
 * parents) in one place, and it gives tests something to fake.
 */
export interface ModuleFs {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    /** Immediate subfolder NAMES, or `[]` when the folder is missing. */
    listFolders(path: string): Promise<string[]>;
    /** Immediate file NAMES, or `[]` when the folder is missing. */
    listFiles(path: string): Promise<string[]>;
    /** Create a folder and any missing parents. */
    mkdirp(path: string): Promise<void>;
    removeDir(path: string): Promise<void>;
    removeFile(path: string): Promise<void>;

    // ── Added for the sync engine ────────────────────
    // The engine needs size and mtime to decide what changed, binary access
    // because a vault holds images and PDFs as well as Markdown, and a
    // recursive listing because sync works over a folder tree rather than one
    // level. All additive: existing callers are untouched.

    /** Size and timestamps, or null when the path does not exist. */
    stat(path: string): Promise<Stat | null>;
    readBinary(path: string): Promise<ArrayBuffer>;
    writeBinary(path: string, data: ArrayBuffer): Promise<void>;
    /**
     * Every FILE at or below `path`, as vault-relative paths. Folders are not
     * returned — they are implied by the files inside them, and an empty folder
     * carries no user data worth syncing.
     */
    walk(path: string): Promise<string[]>;
}

export function vaultModuleFs(adapter: DataAdapter): ModuleFs {
    return {
        exists: (path) => adapter.exists(path),
        read: (path) => adapter.read(path),
        write: (path, data) => adapter.write(path, data),

        async listFolders(path) {
            // Check first: some adapters throw on a missing folder rather than
            // returning an empty listing, and "no modules yet" is the normal
            // state, not an error.
            if (!(await adapter.exists(path))) return [];
            try {
                const listing = await adapter.list(path);
                // `list` returns vault-relative paths; callers want the names.
                return listing.folders.map((f) => f.split('/').filter(Boolean).pop() ?? '');
            } catch {
                return [];
            }
        },

        async listFiles(path) {
            if (!(await adapter.exists(path))) return [];
            try {
                const listing = await adapter.list(path);
                return listing.files.map((f) => f.split('/').filter(Boolean).pop() ?? '');
            } catch {
                return [];
            }
        },

        async mkdirp(path) {
            // `mkdir` does not reliably create intermediate folders across
            // adapters, so walk the segments.
            const parts = path.split('/').filter(Boolean);
            let cursor = '';
            for (const part of parts) {
                cursor = cursor ? `${cursor}/${part}` : part;
                if (!(await adapter.exists(cursor))) {
                    try {
                        await adapter.mkdir(cursor);
                    } catch {
                        // A concurrent create is fine; anything else surfaces
                        // on the write that follows.
                    }
                }
            }
        },

        async removeDir(path) {
            if (await adapter.exists(path)) await adapter.rmdir(path, true);
        },

        async removeFile(path) {
            if (await adapter.exists(path)) await adapter.remove(path);
        },

        stat: (path) => adapter.stat(path),
        readBinary: (path) => adapter.readBinary(path),
        writeBinary: (path, data) => adapter.writeBinary(path, data),

        async walk(path) {
            const out: string[] = [];
            // Iterative rather than recursive: a deep vault would otherwise
            // risk the call stack, and the queue costs nothing.
            const queue = [path];
            const visited = new Set<string>();

            while (queue.length > 0) {
                const dir = queue.shift() as string;
                // A symlinked or duplicated path could otherwise loop forever.
                if (visited.has(dir)) continue;
                visited.add(dir);

                if (!(await adapter.exists(dir))) continue;
                try {
                    const listing = await adapter.list(dir);
                    out.push(...listing.files);
                    queue.push(...listing.folders);
                } catch {
                    // An unreadable folder is skipped rather than fatal: one
                    // permission problem must not abort a whole sync run.
                }
            }

            return out;
        },
    };
}
