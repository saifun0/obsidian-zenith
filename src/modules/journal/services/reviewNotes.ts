import { Notice, TFile, TFolder, normalizePath, type App } from 'obsidian';
import { translate, resolveLocale, type Locale } from '../../../core/i18n';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { openFileAtLine } from '../../../core/openInVault';
import { applyTemplate } from './journalWriter';
import {
    normalizeReviewNotes,
    periodRange,
    reviewNotePath,
    type PeriodRange,
    type ReviewPeriod,
} from './reviewPeriods';

/** The code block that shows a period's numbers. */
export const SUMMARY_BLOCK_LANG = 'zenith-summary';

/**
 * Where a review note keeps what it is about. Not `date:` — that key is how
 * the journal recognises a *daily* note, and a week's note in the journal
 * folder would otherwise be read as the note for its first day.
 */
export const REVIEW_KEY = 'review';

export function reviewRange(
    settings: ZenithSettings,
    period: ReviewPeriod,
    date: string
): PeriodRange {
    return periodRange(period, date, settings.journalWeekStart);
}

export function reviewPath(settings: ZenithSettings, range: PeriodRange): string {
    return normalizePath(
        reviewNotePath(
            normalizeReviewNotes(settings.journalReviewNotes),
            settings.journalFolderPath,
            range
        )
    );
}

/** The block a new note opens with — the period written out, so a renamed note still knows it. */
export function summaryBlock(range: PeriodRange): string {
    return [
        '```' + SUMMARY_BLOCK_LANG,
        `period: ${range.period}`,
        `date: ${range.start}`,
        '```',
    ].join('\n');
}

function defaultBody(range: PeriodRange, locale: Locale): string {
    const well = translate(locale, 'review.template.well');
    const change = translate(locale, 'review.template.change');
    return `${summaryBlock(range)}\n\n## ${well}\n\n- \n\n## ${change}\n\n- \n`;
}

/**
 * Put what the note is about into its frontmatter — without a second `---`
 * block when the template brought one, and without overriding a key the
 * template set on purpose.
 */
export function withReviewProps(body: string, range: PeriodRange): string {
    const props = { [REVIEW_KEY]: range.period, start: range.start, end: range.end };
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);
    const lines = (yaml: string) =>
        Object.entries(props)
            .filter(([key]) => !new RegExp(`^${key}\\s*:`, 'm').test(yaml))
            .map(([key, value]) => `${key}: ${value}`);
    if (!match) return `---\n${lines('').join('\n')}\n---\n\n${body.replace(/^\s+/, '')}`;
    const yaml = match[1];
    const rest = body.slice(match[0].length);
    const merged = [...lines(yaml), yaml].filter(Boolean).join('\n');
    return `---\n${merged}\n---\n${rest.startsWith('\n') ? '' : '\n'}${rest}`;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
    let current = '';
    for (const segment of folder.split('/').filter(Boolean)) {
        current = current ? `${current}/${segment}` : segment;
        const existing = app.vault.getAbstractFileByPath(current);
        if (existing instanceof TFolder) continue;
        if (existing) return;
        try {
            await app.vault.createFolder(current);
        } catch {
            // Created meanwhile — fine.
        }
    }
}

/** The period's note, created from its template when it does not exist yet. */
export async function ensureReviewNote(
    app: App,
    settings: ZenithSettings,
    range: PeriodRange
): Promise<TFile> {
    const path = reviewPath(settings, range);
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    await ensureFolder(app, path.slice(0, Math.max(0, path.lastIndexOf('/'))));
    const locale = resolveLocale(settings.language);
    const title = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    const config = normalizeReviewNotes(settings.journalReviewNotes)[range.period];

    let template = defaultBody(range, locale);
    const templatePath = config.template.trim();
    if (templatePath) {
        const file = app.vault.getAbstractFileByPath(normalizePath(templatePath));
        if (file instanceof TFile) template = await app.vault.read(file);
        else
            console.warn(
                `Zenith: review template "${templatePath}" not found — using the default.`
            );
    }
    const body = applyTemplate(template, range.start, title)
        .replace(/\{\{\s*start\s*\}\}/g, range.start)
        .replace(/\{\{\s*end\s*\}\}/g, range.end)
        .replace(/\{\{\s*period\s*\}\}/g, range.period)
        .replace(/\{\{\s*summary\s*\}\}/g, summaryBlock(range));

    try {
        return await app.vault.create(path, withReviewProps(body, range));
    } catch (err) {
        const raced = app.vault.getAbstractFileByPath(path);
        if (raced instanceof TFile) return raced;
        throw err;
    }
}

/** Open the period's note, creating it on this click — never on its own. */
export async function openReviewNote(
    app: App,
    settings: ZenithSettings,
    period: ReviewPeriod,
    date: string
): Promise<void> {
    try {
        const file = await ensureReviewNote(app, settings, reviewRange(settings, period, date));
        await openFileAtLine(app, file.path);
    } catch (err) {
        console.error('Zenith: failed to open the review note:', err);
        new Notice(translate(resolveLocale(settings.language), 'review.error.create'));
    }
}

/** `reviewed: true` — or the key gone, which is what "not reviewed" is. */
export async function setReviewed(app: App, file: TFile, reviewed: boolean): Promise<void> {
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (reviewed) fm.reviewed = true;
        else delete fm.reviewed;
    });
}

/**
 * Write a snapshot under the block that asked for it: after the line the
 * block's closing fence is on, above whatever follows. Nothing already in
 * the note is changed — an earlier snapshot stays where it is.
 */
export function insertAfterLine(text: string, line: number, block: string): string {
    const lines = text.split('\n');
    const at = Math.min(Math.max(0, line + 1), lines.length);
    lines.splice(at, 0, '', ...block.split('\n'));
    return lines.join('\n');
}

export async function appendSnapshot(
    app: App,
    file: TFile,
    line: number,
    markdown: string
): Promise<void> {
    await app.vault.process(file, (text) => insertAfterLine(text, line, markdown));
}
