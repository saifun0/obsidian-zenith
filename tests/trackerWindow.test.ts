import { describe, it, expect } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import { trackerWindow, staleness } from '../src/modules/journal/components/trackerWindow';
import { summarizeTracker } from '../src/modules/journal/components/trackerSummary';
import type { TrackerPoint, TrackerStat } from '../src/modules/journal/services/journalStats';
import type { JournalTracker } from '../src/core/journalConfig';

// The real dictionary rather than a stub: a key that exists in neither language
// would otherwise pass the test and render as `journal.stats.avgPerDay` on the
// card.
const t = translatorFor('en');

const MOOD: JournalTracker = {
    id: 'mood',
    label: 'Mood',
    icon: 'smile',
    color: '#eab308',
    kind: 'scale',
};
const SPORT: JournalTracker = {
    id: 'sport',
    label: 'Exercise',
    icon: 'dumbbell',
    color: '#ef4444',
    kind: 'check',
};

const WATER: JournalTracker = {
    id: 'water',
    label: 'Water',
    icon: 'glass-water',
    color: '#38bdf8',
    kind: 'number',
    unit: 'glasses',
};

/** A window of `values`, oldest first — null for a day that recorded nothing. */
function stat(tracker: JournalTracker, values: Array<number | null>): TrackerStat {
    const series: TrackerPoint[] = values.map((value, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        value,
    }));
    const recorded = values.filter((v): v is number => v !== null);
    return {
        tracker,
        windowDays: values.length,
        days: recorded.length,
        total: tracker.kind === 'number' ? recorded.reduce((a, b) => a + b, 0) : recorded.length,
        average: recorded.length === 0 ? null : recorded.reduce((a, b) => a + b, 0) / recorded.length,
        rate: values.length === 0 ? 0 : recorded.length / values.length,
        series,
        scaleMax: 5,
    };
}

describe('trackerWindow', () => {
    it('reads the window each row tooltip stands on', () => {
        const window = trackerWindow(stat(MOOD, [3, null, 4, 5, 4]), t);
        expect(window.days).toBe(4);
        expect(window.windowDays).toBe(5);
        expect(window.percent).toBe(80);
        expect(window.currentRun).toBe(3);
        expect(window.bestRun).toBe(3);
        expect(window.sinceLast).toBe(0);
    });

    it('rounds and clamps the share, so a double-counted day never reads 103%', () => {
        const doubled = { ...stat(MOOD, [3, 4]), rate: 1.5 };
        expect(trackerWindow(doubled, t).percent).toBe(100);
        expect(trackerWindow({ ...stat(MOOD, [3, 4]), rate: NaN }, t).percent).toBe(0);
    });

    it('forgives an unwritten today, like the journal streak does', () => {
        // The day is not over. Two blank days in a row is what ends a run.
        expect(trackerWindow(stat(MOOD, [4, 5, 3, null]), t).currentRun).toBe(3);
        expect(trackerWindow(stat(MOOD, [4, 5, null, null]), t).currentRun).toBe(0);
    });
});

describe('staleness', () => {
    it('says how long ago in words', () => {
        expect(staleness(0, t)).toBe('today');
        expect(staleness(3, t)).toBe('3 d ago');
        expect(staleness(null, t)).toBe('never');
    });
});

const COUNT: JournalTracker = {
    id: 'count',
    label: 'Count',
    icon: 'hash',
    color: '#ecf75f',
    kind: 'number',
    max: 10,
};

describe('summarizeTracker', () => {
    const figure = (tracker: JournalTracker, values: Array<number | null>) => {
        const summary = summarizeTracker(stat(tracker, values), t);
        return `${summary.value}${summary.suffix}`;
    };

    it('reads a scale as its average out of the scale', () => {
        expect(figure(MOOD, [3, null, 4])).toBe('3.5/5');
    });

    it('reads a yes/no as the share of the window it was ticked on', () => {
        expect(figure(SPORT, [1, null, 1, null])).toBe('50%');
        expect(summarizeTracker(stat(SPORT, [1, null, 1, null]), t).basis).toBe('2 of 4 days');
    });

    // The sum grows just by leaving the window open; an ordinary day does not.
    it('reads a number as what a recorded day comes to, not as the window sum', () => {
        expect(figure(WATER, [2, null, 3])).toBe('2.5 glasses');
        expect(figure(COUNT, [4, null, 7])).toBe('5.5/10');
    });

    it('rounds a two-digit average whole', () => {
        expect(figure(WATER, [30, 35, 32])).toBe('32 glasses');
    });

    // A window with nothing in it has no average to report, and inventing a
    // zero would read as "none a day" rather than as "not recorded".
    it('shows a dash, and no suffix, for a window nobody wrote in', () => {
        expect(figure(MOOD, [null, null])).toBe('—');
        expect(figure(WATER, [null, null])).toBe('—');
    });

    it('never renders a key where a phrase belongs', () => {
        for (const tracker of [MOOD, SPORT, WATER, COUNT]) {
            expect(summarizeTracker(stat(tracker, [2, null, 3]), t).basis).not.toContain(
                'journal.stats.'
            );
        }
    });
});
