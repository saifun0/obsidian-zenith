import { describe, it, expect } from 'vitest';
import { pace, periodProgress } from '../src/core/period';

describe('periodProgress', () => {
    it('counts both ends, and today as begun', () => {
        expect(periodProgress('2026-09-01', '2026-09-30', '2026-09-01')).toEqual({
            total: 30,
            elapsed: 1,
            remaining: 29,
            fraction: 1 / 30,
        });
        expect(periodProgress('2026-09-01', '2026-09-30', '2026-09-30').remaining).toBe(0);
    });

    it('stays inside the period on either side of it', () => {
        expect(periodProgress('2026-09-01', '2026-09-30', '2026-08-15').elapsed).toBe(0);
        expect(periodProgress('2026-09-01', '2026-09-30', '2026-10-15')).toMatchObject({
            elapsed: 30,
            remaining: 0,
            fraction: 1,
        });
    });

    it('counts calendar days across a daylight-saving change', () => {
        expect(periodProgress('2026-10-20', '2026-11-05', '2026-11-05').total).toBe(17);
    });

    it('treats a period that ends before it starts as a single day', () => {
        expect(periodProgress('2026-09-10', '2026-09-01', '2026-09-10').total).toBe(1);
    });

    it('covers a leap year', () => {
        expect(periodProgress('2028-01-01', '2028-12-31', '2028-12-31').total).toBe(366);
    });
});

describe('pace', () => {
    // 24 books in 2026: an even pace is two a month.
    const year = (done: number, today: string) =>
        pace(24, done, '2026-01-01', '2026-12-31', today);

    it('is on track within one book of an even pace', () => {
        const p = year(17, '2026-09-23');
        expect(p.expected).toBeCloseTo((24 * 266) / 365, 5);
        expect(p.status).toBe('onTrack');
    });

    it('says ahead and behind, by how much, and what it takes from here', () => {
        const behind = year(12, '2026-09-23');
        expect(behind.status).toBe('behind');
        expect(behind.delta).toBeLessThan(-1);
        expect(behind.left).toBe(12);
        expect(behind.perDay).toBeCloseTo(12 / 99, 5);

        expect(year(20, '2026-09-23').status).toBe('ahead');
    });

    it('is done at the target, with nothing more needed', () => {
        expect(year(24, '2026-06-01')).toMatchObject({ status: 'done', left: 0, perDay: 0 });
        expect(year(30, '2026-06-01').left).toBe(0);
    });

    it('offers no daily figure when no days are left', () => {
        expect(year(20, '2026-12-31').perDay).toBeNull();
        expect(year(20, '2027-02-01').perDay).toBeNull();
    });

    it('expects nothing before the period starts', () => {
        expect(pace(10, 0, '2026-10-01', '2026-10-31', '2026-09-23')).toMatchObject({
            expected: 0,
            status: 'onTrack',
            perDay: 10 / 31,
        });
    });
});
