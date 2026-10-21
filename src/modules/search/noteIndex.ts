import { TFile, type App, type EventRef, type TAbstractFile } from 'obsidian';
import {
    lineOf,
    locate,
    parseTextQuery,
    pathFilter,
    prepareText,
    type TextLine,
    type TextSpot,
} from './noteText';

/**
 * What the vault's notes say, kept in memory for Search.
 *
 * Read the first time the panel opens, not when Obsidian starts: a vault
 * whose owner never searches it is never read. From then on it follows the
 * vault — a note edited, made, renamed or deleted is read again or let go —
 * so a search never waits on the disk.
 *
 * What it leaves out is read off Obsidian's own settings, through the vault
 * adapter rather than the undocumented `app.vault.getConfig`: the "Excluded
 * files" list, and the folder the core Templates plugin takes its templates
 * from, whose `{{date}}` placeholders would otherwise be found every time.
 */

/** Notes read at once while loading. */
const BATCH = 40;

interface Entry {
    text: string;
    mtime: number;
}

/** A note that says it: where, and the line as shown. */
export interface NoteHit extends TextSpot, TextLine {
    path: string;
}

async function readJson(app: App, name: string): Promise<Record<string, unknown> | null> {
    const path = `${app.vault.configDir}/${name}`;
    try {
        if (!(await app.vault.adapter.exists(path))) return null;
        const value: unknown = JSON.parse(await app.vault.adapter.read(path));
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

export class NoteIndex {
    private texts = new Map<string, Entry>();
    private state: 'cold' | 'loading' | 'ready' = 'cold';
    private skip: (path: string) => boolean = () => false;
    private filters = '';
    private listeners = new Set<() => void>();
    private refs: EventRef[] = [];

    constructor(private readonly app: App) {}

    /** Follow the vault. Only notes already read are kept up to date. */
    start(): void {
        const { vault } = this.app;
        this.refs.push(
            vault.on('create', (file) => void this.reread(file)),
            vault.on('modify', (file) => void this.reread(file)),
            vault.on('delete', (file) => this.forget(file.path)),
            vault.on('rename', (file, oldPath) => {
                this.forget(oldPath);
                void this.reread(file);
            })
        );
        void this.readFilters();
    }

    stop(): void {
        this.refs.forEach((ref) => this.app.vault.offref(ref));
        this.refs = [];
        this.texts.clear();
        this.listeners.clear();
        this.state = 'cold';
    }

    /** The panel is opening: read every note, the first time; what to leave out, every time. */
    warm(): void {
        void this.readFilters();
        if (this.state !== 'cold') return;
        this.state = 'loading';
        void this.load();
    }

    /** Left out of Search: excluded in Obsidian, or a template. */
    skipped(path: string): boolean {
        return this.skip(path);
    }

    /** Told when what Search would find has changed: the notes are read, or what to leave out is. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * The notes that say every word of `query`: those saying it in a heading
     * first, then the most recently edited, at most `limit`.
     */
    search(query: string, limit: number): NoteHit[] {
        const q = parseTextQuery(query);
        if (!q) return [];
        const spots: Array<TextSpot & { path: string; mtime: number; text: string }> = [];
        for (const [path, entry] of this.texts) {
            if (this.skip(path)) continue;
            const spot = locate(entry.text, q);
            if (spot) spots.push({ ...spot, path, mtime: entry.mtime, text: entry.text });
        }
        spots.sort((a, b) => Number(b.heading) - Number(a.heading) || b.mtime - a.mtime);
        // The line is cut out and marked only for the few that are shown.
        return spots.slice(0, limit).map(({ path, line, heading, text }) => ({
            path,
            line,
            heading,
            ...lineOf(text.split('\n')[line] ?? '', q),
        }));
    }

    private changed(): void {
        this.listeners.forEach((listener) => listener());
    }

    private async load(): Promise<void> {
        const files = this.app.vault.getMarkdownFiles();
        for (let i = 0; i < files.length; i += BATCH) {
            await Promise.all(files.slice(i, i + BATCH).map((file) => this.read(file)));
            // Switched off while reading.
            if (this.state === 'cold') return;
        }
        this.state = 'ready';
        this.changed();
    }

    private async read(file: TFile): Promise<void> {
        try {
            const raw = await this.app.vault.cachedRead(file);
            this.texts.set(file.path, { text: prepareText(raw), mtime: file.stat.mtime });
        } catch {
            // Gone while it was being read: the delete has forgotten it.
        }
    }

    private async reread(file: TAbstractFile): Promise<void> {
        if (this.state === 'cold') return;
        if (file instanceof TFile) {
            if (file.extension === 'md') await this.read(file);
            return;
        }
        // A folder moved: its notes, each under its new path.
        const inside = this.app.vault
            .getMarkdownFiles()
            .filter((note) => note.path.startsWith(`${file.path}/`));
        await Promise.all(inside.map((note) => this.read(note)));
    }

    /** A note, or everything under a folder, by its old path. */
    private forget(path: string): void {
        this.texts.delete(path);
        for (const key of [...this.texts.keys()]) {
            if (key.startsWith(`${path}/`)) this.texts.delete(key);
        }
    }

    private async readFilters(): Promise<void> {
        const [app, core, templates] = await Promise.all([
            readJson(this.app, 'app.json'),
            readJson(this.app, 'core-plugins.json'),
            readJson(this.app, 'templates.json'),
        ]);
        const excluded = Array.isArray(app?.userIgnoreFilters)
            ? app.userIgnoreFilters.filter((f): f is string => typeof f === 'string')
            : [];
        // Older Obsidian wrote a plain array of the core plugins switched on.
        const templatesOn = Array.isArray(core)
            ? core.includes('templates')
            : core?.templates === true;
        const folder = templatesOn && typeof templates?.folder === 'string' ? templates.folder : '';
        const key = JSON.stringify([excluded, folder]);
        if (key === this.filters) return;
        this.filters = key;
        this.skip = pathFilter(excluded, folder);
        this.changed();
    }
}
