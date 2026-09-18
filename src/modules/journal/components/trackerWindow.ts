import type { Translator } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { trackerHistory } from '../services/journalStats';
import { clampRate } from './dialGeometry';

const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * One tracker's window, read as figures rather than as a shape.
 *
 * Two places say this and they say it at different lengths: the panel beside
 * the ring has room for a figure, a label and a plot, and the strip under the
 * dial has one line. Both need the same numbers, and the interesting part is
 * not the arithmetic — it is `figureIsCoverage`, which is the one thing that
 * stops the short version repeating the number already standing in the middle
 * of the dial.
 *
 * So the counting lives here once and the phrasing lives in the two renderers.
 */
export interface TrackerWindow {
    /** Days of the window the tracker was recorded on. */
    days: number;
    windowDays: number;
    /** Recorded share of the window, 0–100, rounded and safe to print. */
    percent: number;
    /** Consecutive recorded days ending at the window's last day. */
    currentRun: number;
    /** The longest such run anywhere in the window. */
    bestRun: number;
    /** Days since the last recorded one — 0 is today, null is never. */
    sinceLast: number | null;
    /** The same, in words: "today" / "3 d ago" / "never". */
    lastMark: string;
    /**
     * Whether the dial's own figure already IS the coverage.
     *
     * A `check` tracker's centre reads "11" over "/30", which is the coverage
     * spelled exactly the way the strip would spell it. Saying it twice on one
     * card is worse than saying it once, so the strip drops its first chip and
     * leads with the run instead.
     */
    figureIsCoverage: boolean;
}

/** "today" / "3 d ago" / "never" — how stale the tracker is, in words. */
export function staleness(sinceLast: number | null, t: Translator): string {
    if (sinceLast === null) return t('journal.stats.never');
    if (sinceLast === 0) return t('journal.stats.today');
    return t('journal.stats.daysAgo', { count: sinceLast });
}

export function trackerWindow(stat: TrackerStat, t: Translator): TrackerWindow {
    const history = trackerHistory(stat.series);

    return {
        days: stat.days,
        windowDays: stat.windowDays,
        percent: Math.round(clampRate(stat.rate) * 100),
        currentRun: history.currentRun,
        bestRun: history.bestRun,
        sinceLast: history.sinceLast,
        lastMark: staleness(history.sinceLast, t),
        figureIsCoverage: stat.tracker.kind === 'check',
    };
}

/**
 * One line of the reading, at both the lengths it gets asked for.
 *
 * The panel beside the ring sets a figure over a phrase; the strip under a
 * small dial sets the same fact in two words. They are the same fact and the
 * same order, and the difference is only how much room there is to say it — so
 * one function decides WHICH facts a tracker has, and each renderer picks the
 * pair of fields it can fit.
 */
export interface TrackerFact {
    key: 'average' | 'coverage' | 'run' | 'last';
    /** The strip's figure — as short as it can be and still be true. */
    short: string;
    /** The word after it, or empty where the figure speaks for itself. */
    unit: string;
    /** The panel's figure, which has the room to be a percentage. */
    value: string;
    /** The panel's label under it — a phrase, not a word. */
    label: string;
}

/**
 * What a tracker's window has to say, beyond the figure in the middle.
 *
 * The rule that shapes the list is that nothing here repeats the dial's own
 * centre. Each kind of tracker leads with a different headline — a scale with
 * its average, a number with its window sum, a check with the days it was
 * ticked — so each one has a different fact left over to be the first thing
 * beside it:
 *
 *   scale   3.5 of 5  →  coverage, run, last
 *   check   11 /30    →  average (as a share), run, last
 *   number  12 glasses → average per day, coverage, run, last
 *
 * The average is the one that has been missing. A check tracker's centre says
 * eleven days of thirty and never says what share of the month that is; a
 * number tracker's centre is a total, which is the one figure that grows just
 * by leaving the window open. A scale's average IS its centre, so it is not
 * repeated — see the kind check below rather than looking for it in the list.
 */
export function trackerFacts(stat: TrackerStat, t: Translator): TrackerFact[] {
    const reading = trackerWindow(stat, t);
    const dayShort = t('journal.stats.dayShort');
    const unit = stat.tracker.unit?.trim();
    const coverageLabel = t('journal.stats.coverageDays', {
        count: reading.days,
        days: reading.windowDays,
    });

    const facts: TrackerFact[] = [];

    // A yes/no tracker's average is the share of the window it was ticked on —
    // the same quantity the coverage counts, said as a rate rather than as two
    // numbers, which is exactly what its centre is NOT saying.
    if (stat.tracker.kind === 'check') {
        facts.push({
            key: 'average',
            short: `${reading.percent}%`,
            unit: '',
            value: `${reading.percent}%`,
            label: coverageLabel,
        });
    } else if (stat.tracker.kind === 'number' && stat.average !== null) {
        const average = trim(stat.average);
        facts.push({
            key: 'average',
            short: average,
            unit: unit ? `${unit}/${dayShort}` : t('journal.stats.perDay'),
            value: unit ? `${average} ${unit}` : average,
            label: t('journal.stats.avgPerDay'),
        });
    }

    if (!reading.figureIsCoverage) {
        facts.push({
            key: 'coverage',
            short: `${reading.days}/${reading.windowDays}`,
            unit: dayShort,
            value: `${reading.percent}%`,
            label: coverageLabel,
        });
    }

    facts.push({
        key: 'run',
        short: String(reading.currentRun),
        unit: t('journal.stats.inARow'),
        value: `${reading.currentRun} ${dayShort}`,
        label: t('journal.stats.runLabel', { count: reading.bestRun }),
    });

    facts.push({
        key: 'last',
        short: reading.lastMark,
        unit: '',
        value: reading.lastMark,
        label: t('journal.stats.lastMark'),
    });

    return facts;
}
