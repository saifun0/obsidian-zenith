import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { translate, resolveLocale, type Locale } from '../../../core/i18n';
import { JOURNAL_BLOCK_LANG } from '../../../core/constants';
import { insertUnderHeading, appendBlock } from '../../../services/markdownSections';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { journalNotePath, isoToDate, formatJournalDate } from './journalDates';

/** The subset of settings the journal services need, resolved once per call. */
export interface JournalConfig {
    folder: string;
    format: string;
    templatePath: string;
    /** Heading captured tasks are filed under; empty = the localized default. */
    taskHeading: string;
    locale: Locale;
}

export function journalConfig(settings: ZenithSettings): JournalConfig {
    return {
        folder: settings.journalFolderPath,
        format: settings.journalDateFormat,
        templatePath: settings.journalTemplatePath,
        taskHeading: settings.journalTaskHeading,
        locale: resolveLocale(settings.language),
    };
}

/**
 * Tracker values to write, by frontmatter key. `null` removes the key — which
 * is how a score gets back to "not recorded", a state that has to stay
 * reachable because the statistics treat it differently from a zero.
 */
export type TrackerPatch = Record<string, number | boolean | string | null>;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Substitute the template placeholders Obsidian's own Daily Notes uses, so a
 * template written for it drops in unchanged: `{{date}}`, `{{time}}`,
 * `{{title}}`, plus `{{date:FORMAT}}` for an explicit pattern.
 *
 * `{{date}}` renders as ISO `YYYY-MM-DD` rather than the filename pattern —
 * that pattern may contain `/` to nest folders, which would read as nonsense in
 * the middle of a sentence.
 */
export function applyTemplate(template: string, date: string, title: string): string {
    const now = new Date();
    return template
        .replace(/\{\{\s*date\s*:\s*([^}]+?)\s*\}\}/g, (_m, fmt: string) =>
            formatJournalDate(isoToDate(date), fmt)
        )
        .replace(/\{\{\s*date\s*\}\}/g, date)
        .replace(/\{\{\s*time\s*\}\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
        .replace(/\{\{\s*title\s*\}\}/g, title);
}

/**
 * Body used when no template is configured. Localized, deliberately short.
 *
 * It opens with the check-in code block, so a fresh note carries the day's
 * trackers and its prev/next navigation without the user having to know the
 * block exists.
 */
function defaultBody(locale: Locale): string {
    const highlights = translate(locale, 'journal.template.highlights');
    const notes = translate(locale, 'journal.template.notes');
    const tasks = translate(locale, 'journal.template.tasks');
    const block = ['```' + JOURNAL_BLOCK_LANG, '```'].join('\n');
    return `${block}\n\n## ${highlights}\n\n- \n\n## ${tasks}\n\n## ${notes}\n\n`;
}

/**
 * JournalWriter — creates daily notes and edits their frontmatter.
 *
 * Field edits go through `fileManager.processFrontMatter`, so YAML the user
 * added by hand (aliases, cssclasses, anything) survives a mood being ticked.
 * Note creation builds the initial text directly instead, because the metadata
 * cache is cold for a file that didn't exist a moment ago.
 */
export class JournalWriter {
    constructor(private readonly app: App) {}

    /** Vault path of the note for a date — whether or not it exists yet. */
    pathFor(config: JournalConfig, date: string): string {
        return normalizePath(journalNotePath(config.folder, config.format, isoToDate(date)));
    }

    /** The note for a date, or null when it hasn't been written yet. */
    find(config: JournalConfig, date: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.pathFor(config, date));
        return file instanceof TFile ? file : null;
    }

    /**
     * The note for a date, creating it (and any folders the pattern implies)
     * from the configured template when missing.
     */
    async ensureNote(config: JournalConfig, date: string): Promise<TFile> {
        const existing = this.find(config, date);
        if (existing) return existing;

        const path = this.pathFor(config, date);
        await this.ensureFolder(path.slice(0, path.lastIndexOf('/')));

        const title = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
        const body = applyTemplate(await this.readTemplate(config), date, title);

        try {
            return await this.app.vault.create(path, withDate(body, date));
        } catch (err) {
            // Created concurrently (two clicks, or a sync) — take what's there.
            const raced = this.find(config, date);
            if (raced) return raced;
            throw err;
        }
    }

    /** Template text for a new note: the configured file, or the built-in body. */
    private async readTemplate(config: JournalConfig): Promise<string> {
        const path = config.templatePath.trim();
        if (!path) return defaultBody(config.locale);

        const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (!(file instanceof TFile)) {
            console.warn(`Zenith: journal template "${path}" not found — using the default body.`);
            return defaultBody(config.locale);
        }
        return this.app.vault.read(file);
    }

    /**
     * Write tracker values into a note's frontmatter.
     *
     * Goes through `processFrontMatter` so YAML the user added by hand
     * (aliases, cssclasses, anything) survives a habit being ticked.
     */
    async setValues(file: TFile, patch: TrackerPatch): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(patch)) {
                if (value === null || value === false) delete fm[key];
                else fm[key] = value;
            }
        });
    }

    /**
     * Append a Markdown block to the note, under `heading` when the note has
     * one and at the end otherwise. Used to file captured tasks.
     */
    async appendUnderHeading(file: TFile, heading: string, block: string): Promise<void> {
        await this.app.vault.process(file, (data) => {
            const placed = insertUnderHeading(data.split('\n'), heading, block.split('\n'));
            return placed ? placed.join('\n') : appendBlock(data, block);
        });
    }

    /** Create every folder along a path (patterns like `YYYY/MM` need this). */
    private async ensureFolder(folder: string): Promise<void> {
        if (!folder) return;
        const segments = folder.split('/').filter(Boolean);
        let current = '';
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            const existing = this.app.vault.getAbstractFileByPath(current);
            if (existing instanceof TFolder) continue;
            if (existing) return; // A file occupies the path — don't fight it.
            try {
                await this.app.vault.createFolder(current);
            } catch {
                // Concurrent creation — safe to ignore.
            }
        }
    }
}

/**
 * Ensure the note's frontmatter records its date, without a second `---` block
 * when the template already brought one.
 */
export function withDate(body: string, date: string): string {
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);
    if (!match) return `---\ndate: ${date}\n---\n\n${body.replace(/^\s+/, '')}`;

    const yaml = match[1];
    const rest = body.slice(match[0].length);
    const merged = /^date\s*:/m.test(yaml) ? yaml : `date: ${date}\n${yaml}`;
    return `---\n${merged}\n---\n${rest.startsWith('\n') ? '' : '\n'}${rest}`;
}
