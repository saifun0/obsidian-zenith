import { describe, it, expect } from 'vitest';
import { pixelFor, yearMonths } from '../src/modules/journal/components/YearPixels';
import { SCALE_COLORS, type JournalTracker } from '../src/core/journalConfig';
import type { JournalEntry } from '../src/store/journalSlice';

const MOOD: JournalTracker = {
    id: 'mood',
    label: 'Mood',
    icon: 'smile',
    color: '#eab308',
    kind: 'scale',
};
const WATER: JournalTracker = {
    id: 'water',
    label: 'Water',
    icon: 'droplet',
    color: '#3b82f6',
    kind: 'number',
    max: 8,
};
const entry = (values: Record<string, unknown>) =>
    ({ date: '2026-03-01', values, texts: {}, words: 5 }) as unknown as JournalEntry;

describe('yearMonths', () => {
    it('lays the year out as twelve months of their own length', () => {
        const months = yearMonths(2028);
        expect(months).toHaveLength(12);
        expect(months[1]).toHaveLength(29); // a leap year's February
        expect(months[11][30]).toBe('2028-12-31');
        expect(months.flat()).toHaveLength(366);
    });
});

describe('pixelFor', () => {
    it('colours a scale day by its score', () => {
        expect(pixelFor(MOOD, entry({ mood: 2 }), '2026-03-01')).toEqual({
            date: '2026-03-01',
            color: SCALE_COLORS[2],
            strength: 1,
        });
    });

    it('leaves a day with nothing recorded neutral, not bad', () => {
        expect(pixelFor(MOOD, entry({}), '2026-03-01').color).toBeNull();
        expect(pixelFor(MOOD, undefined, '2026-03-01').color).toBeNull();
    });

    it('draws a count by how full it was, and never invisibly faint', () => {
        expect(pixelFor(WATER, entry({ water: 8 }), '2026-03-01').strength).toBe(1);
        expect(pixelFor(WATER, entry({ water: 1 }), '2026-03-01').strength).toBeGreaterThanOrEqual(
            0.25
        );
    });
});
