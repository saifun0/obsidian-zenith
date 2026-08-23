import { describe, it, expect } from 'vitest';
import {
    coerceTrackerValue,
    uniqueTrackerId,
    trackerIdProblem,
    slugifyTracker,
    trackerColor,
    migrateHabits,
    SCALE_COLORS,
    DEFAULT_TRACKERS,
    type JournalTracker,
} from '../src/core/journalConfig';
import { readTrackerValues } from '../src/modules/journal/services/journalParser';

const tracker = (over: Partial<JournalTracker> = {}): JournalTracker => ({
    id: 'x',
    label: 'X',
    icon: 'circle',
    color: '#8b5cf6',
    kind: 'check',
    ...over,
});

describe('coerceTrackerValue', () => {
    it('reads a check from the ways YAML spells a boolean', () => {
        expect(coerceTrackerValue('check', true)).toBe(true);
        expect(coerceTrackerValue('check', 'yes')).toBe(true);
        expect(coerceTrackerValue('check', 'TRUE')).toBe(true);
        expect(coerceTrackerValue('check', 1)).toBe(true);
    });

    it('treats a false check as unrecorded, so an untouched day looks untouched', () => {
        expect(coerceTrackerValue('check', false)).toBeUndefined();
        expect(coerceTrackerValue('check', 'no')).toBeUndefined();
    });

    it('clamps a scale into 1–5 and rounds it', () => {
        expect(coerceTrackerValue('scale', 3)).toBe(3);
        expect(coerceTrackerValue('scale', '4')).toBe(4);
        expect(coerceTrackerValue('scale', 9)).toBe(5);
        expect(coerceTrackerValue('scale', 3.4)).toBe(3);
    });

    it('treats a zero or negative scale as unrecorded', () => {
        expect(coerceTrackerValue('scale', 0)).toBeUndefined();
        expect(coerceTrackerValue('scale', -2)).toBeUndefined();
    });

    it('keeps a number as written, including zero and fractions', () => {
        expect(coerceTrackerValue('number', 0)).toBe(0);
        expect(coerceTrackerValue('number', 7.5)).toBe(7.5);
        expect(coerceTrackerValue('number', '12')).toBe(12);
        expect(coerceTrackerValue('number', -3)).toBe(-3);
    });

    it('rejects what is not a value at all', () => {
        for (const kind of ['check', 'scale', 'number'] as const) {
            expect(coerceTrackerValue(kind, null)).toBeUndefined();
            expect(coerceTrackerValue(kind, undefined)).toBeUndefined();
            expect(coerceTrackerValue(kind, '')).toBeUndefined();
        }
        expect(coerceTrackerValue('number', 'later')).toBeUndefined();
    });
});

describe('trackerColor', () => {
    it('gives a scale the colour of its own step', () => {
        expect(trackerColor(tracker({ kind: 'scale' }), 5)).toBe(SCALE_COLORS[5]);
        expect(trackerColor(tracker({ kind: 'scale' }), 1)).toBe(SCALE_COLORS[1]);
    });

    it('keeps the tracker colour for everything else', () => {
        expect(trackerColor(tracker({ color: '#abcdef' }), true)).toBe('#abcdef');
        expect(trackerColor(tracker({ kind: 'number', color: '#abcdef' }), 4)).toBe('#abcdef');
    });
});

describe('tracker ids', () => {
    it('slugifies a label into a frontmatter-safe key', () => {
        expect(slugifyTracker('  Deep Work ')).toBe('deep-work');
        expect(slugifyTracker('Steps/day')).toBe('steps-day');
    });

    it('avoids ids already taken or reserved', () => {
        const existing = [tracker({ id: 'sport' })];
        expect(uniqueTrackerId('sport', existing)).toBe('sport-2');
        expect(uniqueTrackerId('tags', [])).toBe('tags-2');
        expect(uniqueTrackerId('walk', existing)).toBe('walk');
    });

    it('flags the ways an id can be unusable', () => {
        const self = tracker({ id: 'a' });
        const all = [self, tracker({ id: 'b' })];
        expect(trackerIdProblem('a', self, all)).toBeNull();
        expect(trackerIdProblem('', self, all)).toBe('empty');
        expect(trackerIdProblem('date', self, all)).toBe('reserved');
        expect(trackerIdProblem('b', self, all)).toBe('duplicate');
        expect(trackerIdProblem('Deep Work', self, all)).toBe('charset');
    });
});

describe('readTrackerValues', () => {
    it('takes every numeric and boolean property', () => {
        expect(readTrackerValues({ mood: 4, sport: true, water: 6 })).toEqual({
            mood: 4,
            sport: true,
            water: 6,
        });
    });

    it('skips the journal\'s and Obsidian\'s own keys', () => {
        const values = readTrackerValues({ date: 2026, tags: 1, aliases: true, mood: 3 });
        expect(values).toEqual({ mood: 3 });
    });

    it('drops a false check rather than recording it', () => {
        expect(readTrackerValues({ sport: false, walk: true })).toEqual({ walk: true });
    });

    it('keeps a recorded zero', () => {
        expect(readTrackerValues({ water: 0 })).toEqual({ water: 0 });
    });

    it('ignores text properties — a tracker value is a number or a tick', () => {
        expect(readTrackerValues({ weather: 'rain', mood: 2 })).toEqual({ mood: 2 });
    });

    it('folds the legacy habits list in as ticks', () => {
        expect(readTrackerValues({ habits: ['sport', 'reading'], mood: 5 })).toEqual({
            mood: 5,
            sport: true,
            reading: true,
        });
    });

    it('lets an explicit property win over the legacy list', () => {
        expect(readTrackerValues({ habits: ['water'], water: 3 })).toEqual({ water: 3 });
    });
});

describe('migrateHabits', () => {
    it('turns old habits into check trackers, keeping mood and energy', () => {
        const migrated = migrateHabits([
            { id: 'sport', label: 'Exercise', icon: 'dumbbell', color: '#ef4444' },
        ]);
        expect(migrated.map((t) => t.id)).toEqual(['mood', 'energy', 'sport']);
        expect(migrated.find((t) => t.id === 'sport')?.kind).toBe('check');
        expect(migrated.find((t) => t.id === 'mood')?.kind).toBe('scale');
    });
});

describe('DEFAULT_TRACKERS', () => {
    it('covers all three kinds, so each is discoverable out of the box', () => {
        const kinds = new Set(DEFAULT_TRACKERS.map((t) => t.kind));
        expect(kinds).toEqual(new Set(['check', 'scale', 'number']));
    });

    it('has unique, safe ids', () => {
        const ids = DEFAULT_TRACKERS.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of DEFAULT_TRACKERS) {
            expect(trackerIdProblem(t.id, t, DEFAULT_TRACKERS)).toBeNull();
        }
    });
});
