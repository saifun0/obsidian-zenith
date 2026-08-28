import { App, TFile, TFolder, parseYaml, type CachedMetadata } from 'obsidian';

/**
 * Matches a Markdown task checkbox line: `- [ ] ...` or `* [x] ...`.
 * Group 1 = the single status char (` `, `x`, `/`, `-`, …), group 2 = task text.
 * Shared between the parser (VaultService) and the writer (TaskWriter).
 */
export const CHECKBOX_RE = /^[\s]*[-*]\s*\[([^\]])\]\s*(.+)/;

/**
 * A checkbox line regardless of whether it has any text — `- [ ]` on its own
 * counts. Used to compare a file against Obsidian's list-item cache, where an
 * empty checkbox is still an item; {@link CHECKBOX_RE} would miss it and make
 * an in-sync cache look stale.
 */
export const CHECKBOX_ANY_RE = /^\s*[-*]\s*\[[^\]]\]/;

/**
 * Coerce an unknown YAML value into a `string[]`.
 *
 * YAML frontmatter for `tags` can arrive as an array, a bare string
 * (`tags: work`), a comma/space separated string, or numbers — a naive
 * `value as string[]` cast produces runtime errors or garbage in the UI.
 */
export function toStringArray(value: unknown): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,\s]+/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }
    // number / boolean / other scalar
    return [String(value)];
}

/**
 * Coerce an unknown YAML value into an ISO `YYYY-MM-DD` string (or undefined).
 *
 * A YAML date (`due: 2025-01-15`) is parsed by js-yaml into a `Date` object at
 * UTC midnight, not a string, so `value as string` yields something like
 * `"Wed Jan 15 2025 ..."`. We read a `Date` back with its UTC fields so the
 * calendar day round-trips regardless of the user's timezone; plain ISO
 * strings are kept as-is.
 */
export function toIsoDate(value: unknown): string | undefined {
    if (value == null || value === '') return undefined;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return undefined;
        const y = value.getUTCFullYear();
        const m = String(value.getUTCMonth() + 1).padStart(2, '0');
        const d = String(value.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        // Already an ISO date — keep just the date part.
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
        return undefined;
    }
    return undefined;
}

/**
 * VaultService — abstraction over Obsidian Vault API.
 *
 * Provides typed, async methods for reading and parsing
 * Markdown files, frontmatter, and checkboxes.
 */
export class VaultService {
    /**
     * Paths already complained about.
     *
     * Every one of these reads runs again whenever the setting it came from
     * changes, whenever a note is written, and on every reload — so one
     * misconfigured folder was filling the console with the same sentence and
     * pushing everything else off the top. It is one fact; it gets said once.
     */
    private readonly reported = new Set<string>();

    /** Notes whose frontmatter has already been complained about. Same reason. */
    private readonly malformed = new Set<string>();

    constructor(private readonly app: App) {}

    /**
     * Every `.md` file under a vault-relative folder, or none.
     *
     * Three outcomes rather than two, because they mean different things. A
     * folder with files gives files. A folder nobody has configured gives
     * nothing and says nothing — an unset setting is not a problem to report.
     * A folder that was configured and is not there gives nothing and says so
     * once, because that one really is something the user has to fix and
     * nothing will be read until they do.
     */
    getMarkdownFiles(folderPath: string): TFile[] {
        const path = (folderPath ?? '').trim();
        // Warning about `""` claimed a folder named nothing was missing, which
        // is neither true nor anything anyone can act on.
        if (!path) return [];

        const folder = this.app.vault.getAbstractFileByPath(path);

        if (!folder || !(folder instanceof TFolder)) {
            if (!this.reported.has(path)) {
                this.reported.add(path);
                console.warn(
                    `Zenith: the folder "${path}" is set in settings but is not in this vault, so nothing is being read from it. Create it, or point the setting somewhere else.`
                );
            }
            return [];
        }

        // It exists after all — so the next disappearance is worth hearing
        // about again rather than being swallowed by a stale record.
        this.reported.delete(path);

        const files: TFile[] = [];
        this.collectMarkdownFiles(folder, files);
        return files;
    }

    /**
     * Recursively collect .md files from a folder.
     */
    private collectMarkdownFiles(folder: TFolder, result: TFile[]): void {
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                result.push(child);
            } else if (child instanceof TFolder) {
                this.collectMarkdownFiles(child, result);
            }
        }
    }

    /**
     * Read the full text content of a file.
     */
    async readFileContent(file: TFile): Promise<string> {
        return this.app.vault.cachedRead(file);
    }

    /**
     * The parsed metadata (frontmatter, tags, list items…) Obsidian already
     * keeps in memory for a file. Prefer this over re-reading & re-parsing the
     * file — it's faster and stays consistent with the rest of Obsidian.
     * Returns null before the cache is warmed for a file.
     */
    getMetadata(file: TFile): CachedMetadata | null {
        return this.app.metadataCache.getFileCache(file);
    }

    /**
     * Frontmatter for a file, preferring the metadata cache and falling back to
     * a manual read+parse when the cache is cold.
     */
    async getFrontmatter(file: TFile): Promise<Record<string, unknown>> {
        const cached = this.getMetadata(file)?.frontmatter;
        if (cached) {
            // Drop Obsidian's internal `position` key from frontmatter cache.
            const { position, ...rest } = cached as Record<string, unknown>;
            void position;
            return rest;
        }
        const content = await this.readFileContent(file);
        return this.parseFrontmatter(content, file.path);
    }

    /**
     * Parse YAML frontmatter from file content.
     * Returns an empty object if no frontmatter found.
     */
    parseFrontmatter(content: string, path?: string): Record<string, unknown> {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match || !match[1]) {
            return {};
        }

        try {
            return (parseYaml(match[1]) as Record<string, unknown>) ?? {};
        } catch (error) {
            // Named, and said once. The old message reported neither which note
            // was broken nor that the note had still been read — so it was both
            // impossible to act on and repeated on every re-parse, which for a
            // note in a watched folder is constantly.
            const key = path ?? '<unnamed>';
            if (!this.malformed.has(key)) {
                this.malformed.add(key);
                console.warn(
                    `Zenith: could not read the frontmatter of "${key}" — ${describeError(error)}. The note itself was read; only its properties were skipped.`
                );
            }
            return {};
        }
    }

    /**
     * Extract the body content (everything after frontmatter).
     */
    getBodyContent(content: string): string {
        return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    }

    /**
     * Parse checkbox lines from Markdown content.
     * Returns array of { text, statusChar, indent, lineNumber }.
     */
    parseCheckboxes(content: string): Array<{
        text: string;
        statusChar: string;
        indent: number;
        lineNumber: number;
    }> {
        const lines = content.split('\n');
        const checkboxes: Array<{
            text: string;
            statusChar: string;
            indent: number;
            lineNumber: number;
        }> = [];

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(CHECKBOX_RE);
            if (match) {
                const leading = lines[i].match(/^(\s*)/)?.[1] ?? '';
                checkboxes.push({
                    statusChar: match[1],
                    text: match[2].trim(),
                    indent: leading.replace(/\t/g, '    ').length,
                    lineNumber: i + 1, // 1-indexed
                });
            }
        }

        return checkboxes;
    }

    /**
     * Parse inline tags (#tag) from a string.
     */
    parseTags(text: string): string[] {
        const matches = text.match(/#[\w-]+/g);
        return matches ? matches.map((t) => t.slice(1)) : [];
    }
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
