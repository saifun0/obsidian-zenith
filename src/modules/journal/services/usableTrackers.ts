import { featureEnabled, type FeatureSettings } from '../../../core/features';
import {
    activeTrackers,
    withoutGoalExtensions,
    type JournalTracker,
} from '../../../core/journalConfig';
import type { ZenithSettings } from '../../../store/settingsSlice';

/**
 * The trackers every journal surface draws, as the features say they read.
 *
 * With goals off a tracker is the plain daily one it used to be — the weekly
 * count, the limit, the goal history and rest days all set aside, not deleted,
 * so switching the feature back on finds them where they were. With quitting
 * off, a habit being quit reads as an ordinary one.
 */
export function usableTrackers(
    settings: FeatureSettings & Pick<ZenithSettings, 'journalTrackers'>
): JournalTracker[] {
    const goals = featureEnabled(settings, 'journal.goals');
    const quit = featureEnabled(settings, 'journal.quitHabits');
    return activeTrackers(settings.journalTrackers).map((tracker) => {
        let out = goals ? { ...tracker, restDays: true } : withoutGoalExtensions(tracker);
        if (!quit && out.mode === 'quit') {
            out = { ...out };
            delete out.mode;
        }
        return out;
    });
}
