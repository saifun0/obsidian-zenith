import { SCALE_MAX, trackerGoal } from '../../../core/journalConfig';
import type { Translator } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { trackerWindow } from './trackerWindow';

/**
 * How one tracker's window reads as a single figure at the end of its row.
 *
 * Each kind is asked the question it can answer: a scale for its average, a
 * count for what an ordinary recorded day comes to, a habit for the share of
 * the window it was ticked on. It used to report a count's SUM, which is the
 * one figure that grows just by leaving the window open — "105" said nothing
 * about the tracker and everything about how long the window is.
 *
 * `suffix` is set smaller beside the figure, and it is what keeps "3.5" and
 * "5.5" from reading as the same kind of number: "/5" is a score, "/10" is a
 * count against its goal.
 */
export interface TrackerSummary {
    /** The figure itself, already formatted. "—" when the window has nothing. */
    value: string;
    /** "/5", "/10", " km" — or empty where the figure speaks for itself. */
    suffix: string;
    /** What the figure is, for the tooltip: "avg · 22 d". */
    basis: string;
}

/**
 * An average, to the precision it deserves. A tenth is information on "5.5
 * glasses" and noise on "32.1 reps", so two-digit figures are rounded whole.
 */
const trim = (n: number): string =>
    Math.abs(n) >= 10 ? String(Math.round(n)) : Number.isInteger(n) ? String(n) : n.toFixed(1);

export function summarizeTracker(stat: TrackerStat, t: Translator): TrackerSummary {
    const { tracker, average, days } = stat;
    const dayShort = t('journal.stats.dayShort');

    // Given up rather than kept up: counted over the days that were written
    // down, and said so, because a day nobody recorded is not a day without.
    if (stat.quit) {
        const { kept, recorded } = stat.quit;
        return {
            value: `${kept}`,
            suffix: `/${recorded}`,
            basis: t('journal.quit.basis', { kept, recorded, label: tracker.label }),
        };
    }

    // A weekly goal reads as this week against its count, with the run of
    // kept weeks beside it — the daily coverage would call three good gym
    // days a 43% week.
    if (stat.weekly) {
        const { current, run } = stat.weekly;
        return {
            value: `${current.done}`,
            suffix: `/${current.count}`,
            basis: t.plural('journal.goals.weekBasis', run),
        };
    }

    if (tracker.kind === 'scale') {
        return {
            value: average === null ? '—' : average.toFixed(1),
            suffix: average === null ? '' : `/${SCALE_MAX}`,
            basis: `${t('journal.stats.basisAvg')} · ${days} ${dayShort}`,
        };
    }

    if (tracker.kind === 'check') {
        const { percent, days: ticked, windowDays } = trackerWindow(stat, t);
        return {
            value: `${percent}%`,
            suffix: '',
            // A habit's denominator is the whole window: a day without a tick
            // is a real "no", not a gap in the data.
            basis: t('journal.stats.coverageDays', { count: ticked, days: windowDays }),
        };
    }

    const goal = trackerGoal(tracker);
    const unit = tracker.unit?.trim();
    return {
        value: average === null ? '—' : trim(average),
        suffix: average === null ? '' : goal > 0 ? `/${goal}` : unit ? ` ${unit}` : '',
        basis: `${t('journal.stats.avgPerDay')} · ${days} ${dayShort}`,
    };
}
