import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import { getTodayString } from '../../core/dateUtils';
import { translate } from '../../core/i18n';
import { appendBlock } from '../../services/markdownSections';
import type { ZenithSettings } from '../../store/settingsSlice';
import { JournalWriter, journalConfig } from '../journal/services/journalWriter';
import { NOTES_HEADINGS } from '../../core/journalConfig';
import { capturePath, fileInDailyNote } from './capture';

/** Why a line could not be filed, in terms the card can say. */
export class CaptureError extends Error {
    constructor(readonly reason: 'noPath' | 'noFolder' | 'notANote') {
        super(reason);
    }
}

/** Today's daily note — made from the journal's template if today has not been started. */
export function dailyNote(app: App, settings: ZenithSettings): Promise<TFile> {
    return new JournalWriter(app).ensureNote(journalConfig(settings), getTodayString());
}

/**
 * File a line in today's daily note: under its notes heading when it has one,
 * at the end when it does not.
 */
export async function captureToDaily(
    app: App,
    settings: ZenithSettings,
    line: string
): Promise<TFile> {
    const file = await dailyNote(app, settings);
    const headings = [
        translate(journalConfig(settings).locale, 'journal.template.notes'),
        ...NOTES_HEADINGS,
    ];
    await app.vault.process(file, (data) => fileInDailyNote(data, line, headings));
    return file;
}

/**
 * File a line at the end of a note, creating the note when it is not there
 * yet — `Inbox` typed on a card should not have to be made by hand first.
 *
 * The folder is not created along with it: a folder that does not exist is
 * more often a mistyped path than a wish for a new folder, and a note quietly
 * filed under `Inobx/` is a note lost.
 */
export async function captureToNote(app: App, rawPath: string, line: string): Promise<TFile> {
    const typed = capturePath(rawPath);
    if (!typed) throw new CaptureError('noPath');
    const path = normalizePath(typed);

    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
        await app.vault.process(existing, (data) => appendBlock(data, line));
        return existing;
    }
    if (existing) throw new CaptureError('notANote');

    const slash = path.lastIndexOf('/');
    if (slash > 0 && !(app.vault.getAbstractFileByPath(path.slice(0, slash)) instanceof TFolder)) {
        throw new CaptureError('noFolder');
    }
    return app.vault.create(path, `${line}\n`);
}
