import { App, TFile } from 'obsidian';
import { VaultService, toStringArray, toIsoDate } from '../../../services/vaultService';
import { NOTES_HEADINGS, RESERVED_TRACKER_IDS } from '../../../core/journalConfig';
import type { JournalEntry, TrackerValue } from '../../../store/journalSlice';
import { buildDateMatcher, relativeNotePath } from './journalDates';

/**
 * How much of the note body the day panel and widget preview. Enough for a few
 * lines; the rest is what opening the note is for.
 */
const PREVIEW_CHARS = 600;

/**
 * The part of a note that is the day's writing: everything under the notes
 * heading, up to the next heading of the same or a higher level.
 *
 * Returns null when the note has no such heading, and the caller then falls
 * back to the whole body — a note written without the template is all prose,
 * and reporting zero words for it would break the streak it earned.
 *
 * Matching is on the heading's text against {@link NOTES_HEADINGS}, so a note
 * written under one interface language still counts under another.
 */
export function notesSection(body: string): string | null {
    const lines = body.split('\n');
    let level = 0;
    let start = -1;

    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!heading) continue;

        if (start === -1) {
            // Trailing punctuation and emphasis are what a hand-edited heading
            // collects; the word itself is what identifies the section.
            const text = heading[2]
                .replace(/[*_`~]/g, '')
                .replace(/[:：.!?]+$/, '')
                .trim()
                .toLowerCase();
            if (NOTES_HEADINGS.includes(text)) {
                level = heading[1].length;
                start = i + 1;
            }
            continue;
        }

        if (heading[1].length <= level) return lines.slice(start, i).join('\n');
    }

    return start === -1 ? null : lines.slice(start).join('\n');
}

/**
 * Count the words the day was written in.
 *
 * Only the notes section counts (see {@link notesSection}): the template's
 * other headings hold a task list and a bullet for highlights, and counting
 * those reported a productive day for a note that was still empty — a template
 * alone used to be worth a dozen words. Markdown scaffolding inside the section
 * is stripped for the same reason.
 */
export function countWords(body: string): number {
    const prose = (notesSection(body) ?? body)
        .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+(\[[^\]]\]\s*)?/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/[*_`~]/g, '');
    const words = prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return words ? words.length : 0;
}

/**
 * Read the day's tracker values out of its frontmatter.
 *
 * Every numeric or boolean property is taken, **without** consulting the
 * configured trackers: a value whose tracker was renamed or removed stays in
 * the entry, so re-adding that tracker finds its history rather than a blank
 * slate. Interpreting a value (is `4` a scale step or a count?) is the
 * tracker's job, and happens where the tracker is known.
 *
 * The legacy `habits: [sport, reading]` list is folded in as `true` values, so
 * notes written before trackers existed keep their ticks.
 */
export function readTrackerValues(fm: Record<string, unknown>): Record<string, TrackerValue> {
    const values: Record<string, TrackerValue> = {};

    for (const [key, raw] of Object.entries(fm)) {
        if (RESERVED_TRACKER_IDS.includes(key)) continue;
        if (typeof raw === 'boolean') {
            if (raw) values[key] = true;
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
            values[key] = raw;
        }
    }

    for (const habit of toStringArray(fm.habits)) {
        if (!(habit in values)) values[habit] = true;
    }

    return values;
}

/**
 * Read the day's string-valued properties out of its frontmatter.
 *
 * The companion to `readTrackerValues`, and just as indiscriminate: every
 * string that isn't structural is kept, without asking who owns it. That's what
 * lets a module store a worded answer (`fajr: ontime`) in the daily note and
 * find it again through the entry the journal already parsed, instead of
 * opening the same file a second time.
 *
 * Arrays and objects are skipped — `tags` is already lifted out separately, and
 * nothing else in a daily note has a shape a single string can represent.
 */
export function readTextValues(fm: Record<string, unknown>): Record<string, string> {
    const texts: Record<string, string> = {};
    for (const [key, raw] of Object.entries(fm)) {
        if (RESERVED_TRACKER_IDS.includes(key)) continue;
        if (typeof raw !== 'string') continue;
        const value = raw.trim();
        if (value) texts[key] = value;
    }
    return texts;
}

/**
 * JournalParser — turns the .md files in the journal folder into
 * {@link JournalEntry} records.
 *
 * A file counts as a daily note when its date can be established: either the
 * frontmatter says so (`date: 2026-07-28`) or the filename matches the
 * configured pattern. Anything else in the folder — an index note, a stray
 * attachment write-up — is left alone rather than shown as an undated day.
 */
export class JournalParser {
    private vaultService: VaultService;

    constructor(app: App) {
        this.vaultService = new VaultService(app);
    }

    async parseJournal(folderPath: string, format: string): Promise<JournalEntry[]> {
        const files = this.vaultService.getMarkdownFiles(folderPath);
        const matcher = buildDateMatcher(format);
        const entries: JournalEntry[] = [];
        for (const file of files) {
            const entry = await this.parseFile(file, folderPath, matcher);
            if (entry) entries.push(entry);
        }
        return entries;
    }

    /**
     * Parse one file into an entry, or null if it isn't a daily note.
     *
     * Split out so a vault change can re-read just the file that changed —
     * see `DataService`. The matcher is passed in because building it from the
     * format string is regex compilation we'd rather not repeat per file.
     */
    async parseFile(
        file: TFile,
        folderPath: string,
        matcher: (relativePath: string) => string | null
    ): Promise<JournalEntry | null> {
        const fm = await this.vaultService.getFrontmatter(file);

        const relative = relativeNotePath(file.path, folderPath);
        const date = toIsoDate(fm.date) ?? (relative ? matcher(relative) : null);
        if (!date) return null;

        const content = await this.vaultService.readFileContent(file);
        const body = this.vaultService.getBodyContent(content).trim();

        return {
            date,
            filePath: file.path,
            values: readTrackerValues(fm),
            texts: readTextValues(fm),
            tags: toStringArray(fm.tags),
            body: body.slice(0, PREVIEW_CHARS),
            words: countWords(body),
            mtime: file.stat.mtime,
        };
    }
}
