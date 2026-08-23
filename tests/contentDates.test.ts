import { describe, it, expect } from 'vitest';
import { datesForStatus, daysBetween } from '../src/modules/content/services/contentDates';

const TODAY = '2026-07-27';

describe('datesForStatus', () => {
    it('stamps a start date when something is begun', () => {
        expect(datesForStatus('in-progress', {}, TODAY)).toEqual({ started: TODAY });
    });

    it('keeps the original start date on a re-read', () => {
        expect(datesForStatus('in-progress', { started: '2024-01-01' }, TODAY)).toBeNull();
    });

    it('clears a finish date when something goes back into progress', () => {
        expect(datesForStatus('in-progress', { started: '2024-01-01', finished: '2024-03-01' }, TODAY)).toEqual({
            finished: undefined,
        });
    });

    it('stamps a finish date on completion', () => {
        expect(datesForStatus('completed', { started: '2026-07-01' }, TODAY)).toEqual({ finished: TODAY });
    });

    it('does not backfill a start date on completion', () => {
        // Guessing "started today" would report an imported backlog as read in
        // a single day, which is worse than not knowing.
        const patch = datesForStatus('completed', {}, TODAY);
        expect(patch).toEqual({ finished: TODAY });
        expect(patch).not.toHaveProperty('started');
    });

    it('leaves an existing finish date alone', () => {
        expect(datesForStatus('completed', { finished: '2020-05-05' }, TODAY)).toBeNull();
    });

    it('clears both dates when an item goes back to the backlog', () => {
        expect(datesForStatus('backlog', { started: '2024-01-01', finished: '2024-03-01' }, TODAY)).toEqual({
            started: undefined,
            finished: undefined,
        });
    });

    it('has nothing to clear for an item that never left the backlog', () => {
        expect(datesForStatus('backlog', {}, TODAY)).toBeNull();
    });

    it('leaves dropped items untouched — you did start it', () => {
        expect(datesForStatus('dropped', { started: '2024-01-01' }, TODAY)).toBeNull();
    });
});

describe('daysBetween', () => {
    it('counts whole days', () => {
        expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10);
    });

    it('is zero for same-day', () => {
        expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    });

    it('survives a daylight-saving change', () => {
        // Europe springs forward on 2026-03-29; parsed as UTC this stays exact.
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    });

    it('rejects a backwards range and missing ends', () => {
        expect(daysBetween('2026-05-01', '2026-04-01')).toBeNull();
        expect(daysBetween(undefined, '2026-04-01')).toBeNull();
        expect(daysBetween('2026-04-01', undefined)).toBeNull();
        expect(daysBetween('nonsense', '2026-04-01')).toBeNull();
    });
});
