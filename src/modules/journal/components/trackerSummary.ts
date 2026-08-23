import { SCALE_MAX } from '../../../core/journalConfig';
import type { Translator } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';

/**
 * How one tracker's window reads as a figure.
 *
 * The three kinds answer different questions and now say so out loud: a scale
 * gives an average "of 5", a count gives its window sum in its own unit, a
 * habit gives how many days of the window it was ticked. `basis` carries the
 * number of days behind the figure, which is what stops "3.4" from looking like
 * the same claim whether it came from three days or thirty.
 *
 * The old version normalised all three onto one 0–1 bar. That invited a
 * comparison the data never supported — a full "Exercise" bar beside a 40%
 * "Mood" bar read as a verdict on the person, not on the sampling.
 */
export interface TrackerSummary {
    /** The figure itself, already formatted. */
    value: string;
    /** Unit or scale suffix, set smaller beside the figure. */
    suffix: string;
    /** "avg · 3 d" — what the figure is, and how many days it stands on. */
    basis: string;
    /** Short label for the tracker's kind ("scale 1–5", "number", "yes/no"). */
    tag: string;
    /** Caption under the plot, naming the vertical axis. */
    axisLabel: string;
    /**
     * Where the plot's reference line sits, as a percentage from the bottom.
     * Null for kinds whose baseline is simply zero.
     */
    axisAt: number | null;
}

const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function summarizeTracker(stat: TrackerStat, t: Translator): TrackerSummary {
    const { tracker, average, total, days, windowDays } = stat;
    const dayShort = t('journal.stats.dayShort');

    if (tracker.kind === 'scale') {
        return {
            value: average === null ? '—' : average.toFixed(1),
            suffix: average === null ? '' : ` ${t('journal.stats.outOfScale', { max: SCALE_MAX })}`,
            basis: `${t('journal.stats.basisAvg')} · ${days} ${dayShort}`,
            tag: t('journal.stats.tagScale', { max: SCALE_MAX }),
            axisLabel: t('journal.stats.axisScale', { max: SCALE_MAX }),
            // The midpoint of a 1–5 scale, so "above or below average day" is
            // readable without counting pixels.
            axisAt: 50,
        };
    }

    if (tracker.kind === 'check') {
        return {
            value: String(total),
            suffix: `/${windowDays}`,
            // A habit's denominator is the whole window: a day without a tick is
            // a real "no", not a gap in the data.
            basis: `${t('journal.stats.basisFreq')} · ${windowDays} ${dayShort}`,
            tag: t('journal.stats.tagCheck'),
            axisLabel: t('journal.stats.axisCheck'),
            axisAt: null,
        };
    }

    const unit = tracker.unit?.trim();
    return {
        value: days === 0 ? '—' : trim(total),
        suffix: days === 0 || !unit ? '' : ` ${unit}`,
        basis: `${t('journal.stats.basisSum')} · ${days} ${dayShort}`,
        tag: t('journal.stats.tagNumber'),
        axisLabel: t('journal.stats.axisNumber', { unit: unit || t('journal.stats.tagNumber') }),
        axisAt: null,
    };
}
