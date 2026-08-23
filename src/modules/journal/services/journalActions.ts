import { App, Notice, TFile } from 'obsidian';
import { openFileAtLine } from '../../../core/openInVault';
import { translate } from '../../../core/i18n';
import type { TrackerValue } from '../../../store/journalSlice';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { JournalWriter, journalConfig, type TrackerPatch } from './journalWriter';

/**
 * The mutations the journal UI performs, in one place.
 *
 * Every one of them starts by making sure the day's note exists: ticking a
 * habit for a day you haven't written yet is a perfectly reasonable thing to
 * do, and it shouldn't fail with "no note". The code block, the calendar and
 * all three dashboard widgets share these, so a value set from one behaves
 * exactly like the same value set from another.
 */

/** Create the note for a date if needed, and write the given values. */
export async function writeTrackerValues(
    app: App,
    settings: ZenithSettings,
    date: string,
    patch: TrackerPatch
): Promise<boolean> {
    const config = journalConfig(settings);
    const writer = new JournalWriter(app);
    try {
        const file = await writer.ensureNote(config, date);
        await writer.setValues(file, patch);
        return true;
    } catch (err) {
        console.error('Zenith: failed to update the daily note:', err);
        new Notice(translate(config.locale, 'journal.error.write'));
        return false;
    }
}

/**
 * Set (or clear, with null) one tracker's value for a day.
 *
 * Un-ticking a check tracker removes its key rather than writing `false`: an
 * untouched day and a deliberate "no" would otherwise be indistinguishable in
 * the note, and only one of the two has earned a property. A `number` of zero
 * *is* kept — "I tracked it and it was none" is a real answer, and the controls
 * offer a separate way to clear.
 */
export function setTrackerValue(
    app: App,
    settings: ZenithSettings,
    date: string,
    trackerId: string,
    value: TrackerValue | null
): Promise<boolean> {
    return writeTrackerValues(app, settings, date, {
        [trackerId]: value === false ? null : value,
    });
}

/** Create the day's note if needed and open it in the workspace. */
export async function openDailyNote(
    app: App,
    settings: ZenithSettings,
    date: string
): Promise<TFile | null> {
    const config = journalConfig(settings);
    try {
        const file = await new JournalWriter(app).ensureNote(config, date);
        await openFileAtLine(app, file.path);
        return file;
    } catch (err) {
        console.error('Zenith: failed to open the daily note:', err);
        new Notice(translate(config.locale, 'journal.error.create'));
        return null;
    }
}

/** Create the day's note without stealing focus from the journal view. */
export async function createDailyNote(
    app: App,
    settings: ZenithSettings,
    date: string
): Promise<TFile | null> {
    const config = journalConfig(settings);
    try {
        return await new JournalWriter(app).ensureNote(config, date);
    } catch (err) {
        console.error('Zenith: failed to create the daily note:', err);
        new Notice(translate(config.locale, 'journal.error.create'));
        return null;
    }
}
