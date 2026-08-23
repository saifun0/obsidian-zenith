import type { App } from 'obsidian';
import { writeTrackerValues } from '../journal/services/journalActions';
import type { ZenithSettings } from '../../store/settingsSlice';
import type { ExtraPrayerId, PrayerId, PrayerStatus } from './prayerConfig';
import { prayerWindows, type PrayerTimeId } from './prayerTimes';

/**
 * Recording a prayer.
 *
 * Everything goes through the journal's writer: the record lives in the daily
 * note's frontmatter, the note is created if the day doesn't have one yet, and
 * a failure surfaces as the same Notice the journal shows. Sharing that path is
 * what makes a prayer ticked from the dashboard, from the view and from the
 * note itself behave identically — including creating today's note as a side
 * effect of the first tap, which is the point.
 */

/**
 * Set (or clear, with null) one prayer's status for a day.
 *
 * Clearing deletes the property rather than writing an empty value: "I haven't
 * answered yet" is a state the statistics rely on, and it has to be reachable
 * again after a mis-tap.
 */
export function setPrayerStatus(
    app: App,
    settings: ZenithSettings,
    date: string,
    prayer: PrayerId,
    status: PrayerStatus | null
): Promise<boolean> {
    return writeTrackerValues(app, settings, date, { [prayer]: status });
}

/** Tick or untick a voluntary prayer. Stored as a plain `witr: true`. */
export function setExtraPrayer(
    app: App,
    settings: ZenithSettings,
    date: string,
    prayer: ExtraPrayerId,
    done: boolean
): Promise<boolean> {
    return writeTrackerValues(app, settings, date, { [prayer]: done ? true : null });
}

/**
 * What a single tap should record.
 *
 * Inside the prayer's window that's "on time"; once the window has closed it is
 * "late", because that is what happened. Making the user pick between the two
 * every time would be asking them to classify something the clock already
 * knows — the context menu is still there for the case it doesn't (admitting
 * a miss).
 */
export function statusForTap(
    times: Record<PrayerTimeId, number>,
    prayer: PrayerId,
    nowMinutes: number
): PrayerStatus {
    const window = prayerWindows(times).find((w) => w.id === prayer);
    if (!window) return 'ontime';
    return nowMinutes <= window.end ? 'ontime' : 'late';
}
