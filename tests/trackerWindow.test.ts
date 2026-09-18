import { describe, it, expect } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import {
    trackerWindow,
    trackerFacts,
    staleness,
} from '../src/modules/journal/components/trackerWindow';
import type { TrackerPoint, TrackerStat } from '../src/modules/journal/services/journalStats';
import type { JournalTracker } from '../src/core/journalConfig';

// The real dictionary rather than a stub: the strip's chips are two words each,
// and a key that exists in neither language would otherwise pass the test and
// render as `journal.stats.inARow` on the card.
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
    it('reads the window the panel and the strip both stand on', () => {
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

    // The one thing the strip needs that the panel does not: a check tracker's
    // centre figure already reads "2 /5", so a coverage chip beside it would be
    // the same number twice on a card with room for about six.
    it('knows when the dial is already showing the coverage', () => {
        expect(trackerWindow(stat(SPORT, [1, null, 1]), t).figureIsCoverage).toBe(true);
        expect(trackerWindow(stat(MOOD, [3, null, 4]), t).figureIsCoverage).toBe(false);
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

describe('trackerFacts', () => {
    const keys = (tracker: JournalTracker, values: Array<number | null>) =>
        trackerFacts(stat(tracker, values), t).map((fact) => fact.key);

    // The rule the whole list is shaped by: never repeat the figure standing in
    // the middle of the dial. Each kind leads with a different one, so each has
    // a different fact left over to be the first thing beside it.
    it('leaves out whatever the dial is already showing', () => {
        expect(keys(MOOD, [3, null, 4])).toEqual(['coverage', 'run', 'last']);
        expect(keys(SPORT, [1, null, 1])).toEqual(['average', 'run', 'last']);
        expect(keys(WATER, [2, null, 3])).toEqual(['average', 'coverage', 'run', 'last']);
    });

    it('reads a yes/no average as the share of the window', () => {
        const [average] = trackerFacts(stat(SPORT, [1, null, 1, null]), t);
        expect(average.short).toBe('50%');
        expect(average.label).toBe('2 of 4 days');
    });

    it('reads a number average as its own unit a day', () => {
        const [average] = trackerFacts(stat(WATER, [2, null, 3]), t);
        expect(average.short).toBe('2.5');
        expect(average.unit).toBe('glasses/d');
        expect(average.value).toBe('2.5 glasses');
    });

    // A window with nothing in it has no average to report, and inventing a
    // zero would read as "none a day" rather than as "not recorded".
    it('has no average for a number nobody wrote down', () => {
        expect(keys(WATER, [null, null])).toEqual(['coverage', 'run', 'last']);
    });

    it('gives the panel a figure and a phrase for every chip the strip sets', () => {
        for (const fact of trackerFacts(stat(WATER, [2, null, 3]), t)) {
            expect(fact.short.length).toBeGreaterThan(0);
            expect(fact.value.length).toBeGreaterThan(0);
            expect(fact.label.length).toBeGreaterThan(0);
            // A key rendered instead of a phrase is what a missing string looks
            // like on the card.
            expect(fact.label).not.toContain('journal.stats.');
        }
    });
});
