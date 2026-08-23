import { describe, it, expect, vi, afterEach } from 'vitest';
import { toLocalIsoDate, getTodayString, isOverdue, isToday } from '../src/core/dateUtils';

afterEach(() => {
    vi.useRealTimers();
});

describe('toLocalIsoDate', () => {
    it('formats local calendar fields, zero-padded', () => {
        // Local time, not UTC — construct with local components.
        expect(toLocalIsoDate(new Date(2025, 0, 5))).toBe('2025-01-05');
        expect(toLocalIsoDate(new Date(2025, 11, 31))).toBe('2025-12-31');
    });
});

describe('getTodayString / isOverdue / isToday', () => {
    it('uses the local date, not UTC', () => {
        // 2025-06-15 22:30 local — toISOString() in a positive TZ would already
        // be the 16th in UTC; getTodayString must still say the 15th locally.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 5, 15, 22, 30));

        expect(getTodayString()).toBe('2025-06-15');
        expect(isToday('2025-06-15')).toBe(true);
        expect(isToday('2025-06-16')).toBe(false);
        expect(isOverdue('2025-06-14')).toBe(true);
        expect(isOverdue('2025-06-15')).toBe(false);
        expect(isOverdue(undefined)).toBe(false);
        expect(isToday(undefined)).toBe(false);
    });
});
