import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { ContentStatus } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import type { ContentDates } from './contentDates';
import { transitionFor, type Transition } from './readings';

export interface NewContentInput {
    title: string;
    type: string;
    status: ContentStatus;
    rating: number;
    tags: string[];
    coverImage?: string;
    description?: string;
    year?: number;
    creator?: string;
    genres?: string[];
    progress?: number;
    progressTotal?: number;
    /** `YYYY-MM-DD`. */
    started?: string;
    finished?: string;
}

/**
 * ContentWriter — persists content-item mutations (rating, status, progress)
 * back to the YAML frontmatter of the source Markdown file, and creates new
 * content notes.
 *
 * Edits go through `processFrontMatter` and name only the keys they change, so
 * whatever else a note carries — keys another plugin reads, or the
 * `externalRating` / `source` / `sourceId` an older Zenith wrote — stays in
 * the file exactly as it was.
 */
export class ContentWriter {
    constructor(private readonly app: App) {}

    async setRating(filePath: string, rating: number): Promise<void> {
        const clamped = Math.min(10, Math.max(0, Math.round(rating)));
        await this.updateFields(filePath, { rating: clamped });
    }

    /**
     * Write a status and, given the item's current dates, the started/finished
     * stamps the transition implies. Returns the date patch that was applied
     * (or null) so the caller can mirror it into the store optimistically.
     */
    async setStatus(
        filePath: string,
        status: ContentStatus,
        dates?: ContentDates & { readings?: string[] },
        withReadings = false
    ): Promise<Transition | null> {
        const patch = dates ? transitionFor(status, dates, getTodayString(), withReadings) : null;
        // `updateFields` deletes keys set to undefined, which is exactly the
        // "clear this date" half of the patch.
        await this.updateFields(filePath, { status, ...(patch ?? {}) });
        return patch;
    }

    /**
     * Write progress as two numeric keys. `total` of 0/undefined clears
     * `progressTotal`, which is how "I don't know the length" is expressed.
     */
    async setProgress(filePath: string, current: number, total?: number): Promise<void> {
        await this.updateFields(filePath, {
            progress: Math.max(0, Math.round(current)),
            progressTotal: total && total > 0 ? Math.round(total) : undefined,
        });
    }

    /**
     * Move a content note to the vault trash.
     *
     * `trashFile` honours the user's "deleted files" preference (system trash,
     * `.trash`, or permanent), so removing an item from the library never
     * destroys a note behind their back.
     */
    async deleteItem(filePath: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        await this.app.fileManager.trashFile(file);
        return true;
    }

    /** Apply several frontmatter changes in one write (one vault event). */
    async patch(filePath: string, fields: Record<string, unknown>): Promise<void> {
        await this.updateFields(filePath, fields);
    }

    /**
     * Create a new content note (with YAML frontmatter) inside the content
     * folder. Returns the created file. Picks a non-colliding filename derived
     * from the title.
     */
    async createItem(folderPath: string, input: NewContentInput): Promise<TFile> {
        const folder = folderPath.trim().replace(/\/+$/, '');
        await this.ensureFolder(folder);

        const baseName = this.sanitizeFileName(input.title) || 'Untitled';
        const filePath = await this.uniquePath(folder, baseName);

        const content = this.buildNote(input);
        return this.app.vault.create(filePath, content);
    }

    private buildNote(input: NewContentInput): string {
        const fm: string[] = ['---'];
        fm.push(`title: ${this.yamlString(input.title)}`);
        fm.push(`type: ${this.yamlString(input.type)}`);
        fm.push(`status: ${input.status}`);
        fm.push(`rating: ${Math.min(10, Math.max(0, Math.round(input.rating)))}`);
        if (input.coverImage) fm.push(`cover: ${this.yamlString(input.coverImage)}`);
        if (input.year && input.year > 0) fm.push(`year: ${Math.round(input.year)}`);
        if (input.creator?.trim()) fm.push(`creator: ${this.yamlString(input.creator)}`);
        if (input.genres && input.genres.length > 0) {
            fm.push(`genres: [${input.genres.map((g) => this.yamlString(g.trim())).filter(Boolean).join(', ')}]`);
        }
        if (input.progress != null && input.progress > 0) fm.push(`progress: ${Math.round(input.progress)}`);
        if (input.progressTotal != null && input.progressTotal > 0) {
            fm.push(`progressTotal: ${Math.round(input.progressTotal)}`);
        }
        if (input.tags.length > 0) {
            fm.push(
                `tags: [${input.tags
                    .map((t) => t.replace(/^#/, '').trim())
                    .filter(Boolean)
                    .map((t) => this.yamlString(t))
                    .join(', ')}]`
            );
        }
        if (input.started) fm.push(`started: ${input.started}`);
        if (input.finished) fm.push(`finished: ${input.finished}`);
        fm.push('---');
        fm.push('');
        if (input.description) fm.push(input.description.trim());
        fm.push('');
        return fm.join('\n');
    }

    /** Quote a YAML scalar if it contains characters that need it. */
    private yamlString(value: string): string {
        const v = value.trim();
        // Leading indicators (`-`, `?`) and anything YAML treats as structure.
        if (v === '' || /^[-?]\s|^[-?]$/.test(v) || /[:#[\]{},"'&*!|>%@`]/.test(v)) {
            return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return v;
    }

    private sanitizeFileName(name: string): string {
        // Strip characters not allowed in vault file names, plus trailing dots
        // and spaces (illegal on Windows).
        return name
            .replace(/[\\/:*?"<>|#^[\]]/g, '')
            .replace(/[.\s]+$/, '')
            .trim();
    }

    private async uniquePath(folder: string, baseName: string): Promise<string> {
        const make = (n: number) =>
            normalizePath(folder ? `${folder}/${baseName}${n ? ` ${n}` : ''}.md` : `${baseName}${n ? ` ${n}` : ''}.md`);
        let i = 0;
        while (this.app.vault.getAbstractFileByPath(make(i))) i++;
        return make(i);
    }

    private async ensureFolder(folder: string): Promise<void> {
        if (!folder) return;
        const existing = this.app.vault.getAbstractFileByPath(folder);
        if (existing instanceof TFolder) return;
        if (existing) return;
        try {
            await this.app.vault.createFolder(folder);
        } catch {
            // Concurrent creation — safe to ignore.
        }
    }

    private async updateFields(filePath: string, fields: Record<string, unknown>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, value] of Object.entries(fields)) {
                if (value === undefined) delete fm[key];
                else fm[key] = value;
            }
        });
    }
}
