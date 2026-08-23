import { App, Notice } from 'obsidian';
import { translate, resolveLocale } from '../../../core/i18n';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { JournalWriter, journalConfig } from '../../journal/services/journalWriter';
import { getTodayString } from '../../../core/dateUtils';

/** Where a newly created task should be written. */
export interface TaskTarget {
    filePath: string;
    /** Heading to file it under; the writer appends at the end without one. */
    heading?: string;
}

/**
 * Resolve where a new task goes.
 *
 * With **Capture tasks in the daily note** on, everything created from the UI
 * or the quick-add command lands in today's note — creating it if today hasn't
 * been started yet — so the day's note is the single place the day accumulates
 * in. Off (or with the journal module disabled) it's the tasks inbox, as before.
 *
 * Returning null means "use the inbox"; a failure to prepare the daily note
 * also returns null rather than throwing, because losing the task the user just
 * typed is a far worse outcome than filing it in the wrong place.
 */
export async function resolveTaskTarget(
    app: App,
    settings: ZenithSettings
): Promise<TaskTarget | null> {
    if (!settings.journalCaptureTasks) return null;
    if (!settings.activeModuleIds.includes('journal')) return null;

    const config = journalConfig(settings);
    try {
        const file = await new JournalWriter(app).ensureNote(config, getTodayString());
        return {
            filePath: file.path,
            // An unset heading means the localized default from the built-in
            // template — which is there in a fresh vault, and simply misses
            // (→ append at the end) in a note that doesn't use it.
            heading: config.taskHeading.trim() || translate(config.locale, 'journal.template.tasks'),
        };
    } catch (err) {
        console.error('Zenith: could not prepare the daily note for task capture:', err);
        new Notice(translate(resolveLocale(settings.language), 'journal.error.capture'));
        return null;
    }
}
