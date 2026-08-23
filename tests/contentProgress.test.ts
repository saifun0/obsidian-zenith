import { describe, it, expect } from 'vitest';
import {
    parseProgress,
    progressPercent,
    isProgressComplete,
    formatProgress,
    shortUnit,
    statusForProgress,
} from '../src/modules/content/services/progress';

describe('parseProgress', () => {
    it('reads the canonical numeric pair', () => {
        expect(parseProgress(88, 100)).toEqual({ current: 88, total: 100 });
        expect(parseProgress(0, 12)).toEqual({ current: 0, total: 12 });
    });

    it('understands legacy free-text forms', () => {
        expect(parseProgress('88/100')).toEqual({ current: 88, total: 100 });
        expect(parseProgress('Ep 5 / 12')).toEqual({ current: 5, total: 12 });
        expect(parseProgress('12 of 24')).toEqual({ current: 12, total: 24 });
        expect(parseProgress('Ch 30')).toEqual({ current: 30, total: undefined });
        expect(parseProgress('p. 120')).toEqual({ current: 120, total: undefined });
    });

    it('treats a percentage as progress on a 0–100 scale', () => {
        expect(parseProgress('45%')).toEqual({ current: 45, total: 100 });
    });

    it('lets an explicit total fill in what the text lacks', () => {
        expect(parseProgress('Ch 30', 200)).toEqual({ current: 30, total: 200 });
        expect(parseProgress(undefined, 200)).toEqual({ current: 0, total: 200 });
    });

    it('returns undefined when there is nothing to read', () => {
        expect(parseProgress(undefined)).toBeUndefined();
        expect(parseProgress('')).toBeUndefined();
        expect(parseProgress('not started')).toBeUndefined();
    });
});

describe('progressPercent / isProgressComplete', () => {
    it('needs a total to compute a ratio', () => {
        expect(progressPercent({ current: 5, total: 10 })).toBe(50);
        expect(progressPercent({ current: 5 })).toBeUndefined();
        expect(progressPercent(undefined)).toBeUndefined();
    });

    it('clamps past 100%', () => {
        expect(progressPercent({ current: 15, total: 10 })).toBe(100);
    });

    it('detects completion only against a known total', () => {
        expect(isProgressComplete({ current: 12, total: 12 })).toBe(true);
        expect(isProgressComplete({ current: 12 })).toBe(false);
    });
});

describe('formatProgress', () => {
    it('renders with and without a total', () => {
        expect(formatProgress({ current: 88, total: 320 }, 'pages')).toBe('88 / 320 pages');
        expect(formatProgress({ current: 30 }, 'chapters')).toBe('30 chapters');
    });

    it('abbreviates units in the short form', () => {
        expect(formatProgress({ current: 5, total: 12 }, 'episodes', { short: true })).toBe('5 / 12 ep');
        expect(shortUnit('pages')).toBe('p');
        expect(shortUnit(undefined)).toBe('units');
    });
});

describe('statusForProgress', () => {
    it('pulls a started item out of the backlog', () => {
        expect(statusForProgress({ current: 1, total: 12 }, 'backlog')).toBe('in-progress');
    });

    it('completes an item that reached its total', () => {
        expect(statusForProgress({ current: 12, total: 12 }, 'in-progress')).toBe('completed');
    });

    it('leaves dropped items alone and needs a total to complete', () => {
        expect(statusForProgress({ current: 12, total: 12 }, 'dropped')).toBe('dropped');
        expect(statusForProgress({ current: 999 }, 'in-progress')).toBe('in-progress');
    });

    it('is a no-op with no progress at all', () => {
        expect(statusForProgress(undefined, 'backlog')).toBe('backlog');
        expect(statusForProgress({ current: 0, total: 12 }, 'backlog')).toBe('backlog');
    });
});
