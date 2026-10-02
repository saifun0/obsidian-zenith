import { describe, it, expect, beforeEach } from 'vitest';
import { Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
    isRecurrenceUnderstood,
    nextRecurrenceDate,
    parseRecurrence,
} from '../src/modules/tasks/services/recurrence';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import { getTodayString } from '../src/core/dateUtils';

// Reference days: 2025-01-31 is a Friday, 2025-02-03 a Monday.

describe('simple steps', () => {
    it('counts days, weeks, months and years', () => {
        expect(nextRecurrenceDate('every day', '2025-01-01')).toBe('2025-01-02');
        expect(nextRecurrenceDate('daily', '2025-12-31')).toBe('2026-01-01');
        expect(nextRecurrenceDate('every 3 days', '2025-01-01')).toBe('2025-01-04');
        expect(nextRecurrenceDate('every week', '2025-01-01')).toBe('2025-01-08');
        expect(nextRecurrenceDate('every other week', '2025-01-01')).toBe('2025-01-15');
        expect(nextRecurrenceDate('every 2 months', '2025-01-15')).toBe('2025-03-15');
        expect(nextRecurrenceDate('yearly', '2025-03-01')).toBe('2026-03-01');
    });

    it('brings the 31st back on the last day of a shorter month, not in the next one', () => {
        // `setMonth` turned this into the 3rd of March, skipping February.
        expect(nextRecurrenceDate('every month', '2025-01-31')).toBe('2025-02-28');
        expect(nextRecurrenceDate('every month', '2024-01-31')).toBe('2024-02-29');
        expect(nextRecurrenceDate('every month', '2025-03-31')).toBe('2025-04-30');
        expect(nextRecurrenceDate('every year', '2024-02-29')).toBe('2025-02-28');
    });

    it('does not move a day across a clock change', () => {
        expect(nextRecurrenceDate('every day', '2025-03-29')).toBe('2025-03-30');
        expect(nextRecurrenceDate('every day', '2025-03-30')).toBe('2025-03-31');
        expect(nextRecurrenceDate('every week', '2025-10-23')).toBe('2025-10-30');
    });
});

describe('the Tasks plugin rules that used to end a series', () => {
    it('skips the weekend for every weekday', () => {
        expect(nextRecurrenceDate('every weekday', '2025-01-30')).toBe('2025-01-31');
        expect(nextRecurrenceDate('every weekday', '2025-01-31')).toBe('2025-02-03');
    });

    it('lands on the named days of the week', () => {
        expect(nextRecurrenceDate('every week on Sunday', '2025-01-31')).toBe('2025-02-02');
        expect(nextRecurrenceDate('every monday', '2025-01-31')).toBe('2025-02-03');
        expect(nextRecurrenceDate('every Monday and Thursday', '2025-02-03')).toBe('2025-02-06');
        expect(nextRecurrenceDate('every week on Tuesday, Friday', '2025-02-07')).toBe('2025-02-11');
        expect(nextRecurrenceDate('every mondays', '2025-02-03')).toBe('2025-02-10');
    });

    it('skips whole weeks between the named days', () => {
        // From Monday the 3rd: Friday that week, then Monday a fortnight on.
        expect(nextRecurrenceDate('every 2 weeks on Monday, Friday', '2025-02-03')).toBe('2025-02-07');
        expect(nextRecurrenceDate('every 2 weeks on Monday, Friday', '2025-02-07')).toBe('2025-02-17');
    });

    it('lands on a day of the month', () => {
        expect(nextRecurrenceDate('every month on the 15th', '2025-01-10')).toBe('2025-01-15');
        expect(nextRecurrenceDate('every month on the 15th', '2025-01-15')).toBe('2025-02-15');
        expect(nextRecurrenceDate('every month on the 31st', '2025-01-31')).toBe('2025-02-28');
        expect(nextRecurrenceDate('every month on the last', '2025-01-31')).toBe('2025-02-28');
        expect(nextRecurrenceDate('every month on the last day', '2025-02-28')).toBe('2025-03-31');
    });

    it('lands on the nth weekday of the month', () => {
        // February 2025: Tuesdays are the 4th, 11th, 18th, 25th.
        expect(nextRecurrenceDate('every month on the 2nd Tuesday', '2025-01-31')).toBe('2025-02-11');
        expect(nextRecurrenceDate('every month on the last Friday', '2025-01-31')).toBe('2025-02-28');
        expect(nextRecurrenceDate('every month on the first monday', '2025-02-03')).toBe('2025-03-03');
        // A fifth Friday only some months have: skipped where it is missing.
        expect(nextRecurrenceDate('every month on the 5th Friday', '2025-01-31')).toBe('2025-05-30');
    });

    it('counts from the day it was finished when told to', () => {
        expect(nextRecurrenceDate('every week when done', '2025-01-01', '2025-01-20')).toBe('2025-01-27');
        expect(nextRecurrenceDate('every 3 days, when done', '2025-01-01', '2025-01-20')).toBe('2025-01-23');
        // Without a completion day it falls back to the date it carried.
        expect(nextRecurrenceDate('every week when done', '2025-01-01')).toBe('2025-01-08');
    });
});

describe('rules it cannot read', () => {
    it('says so instead of guessing', () => {
        for (const rule of ['whenever', 'every 0 days', 'every fortnight', 'every day on Monday', 'every month on the 32nd']) {
            expect(isRecurrenceUnderstood(rule), rule).toBe(false);
            expect(nextRecurrenceDate(rule, '2025-01-01'), rule).toBeNull();
        }
        expect(parseRecurrence('every week on Mon')).toMatchObject({ unit: 'week', weekdays: [1] });
    });
});

// ── Through the writer ───────────────────────────────

function fakeApp(path: string, content: string) {
    const file = new TFile();
    file.path = path;
    const store = { text: content };
    const app = {
        vault: {
            getAbstractFileByPath: (p: string) => (p === path ? file : null),
            process: (_f: unknown, fn: (data: string) => string) => {
                store.text = fn(store.text);
                return Promise.resolve(store.text);
            },
        },
    } as unknown as App;
    return { app, store };
}

describe('completing a recurring task', () => {
    beforeEach(() => {
        (Notice as unknown as { shown: unknown[] }).shown = [];
    });

    it('adds the next occurrence for a Tasks plugin weekday rule', async () => {
        const { app, store } = fakeApp('a.md', '- [ ] Call mom 🔁 every week on Sunday 📅 2025-02-02\n');
        const ok = await new TaskWriter(app).setStatusInFile('a.md', 1, 'done', 'Call mom');

        expect(ok).toBe(true);
        expect(store.text).toContain('- [ ] Call mom 🔁 every week on Sunday 📅 2025-02-09');
        expect(store.text).toMatch(/- \[x\] Call mom .*📅 2025-02-02/);
    });

    it('counts a when-done rule from today', async () => {
        const { app, store } = fakeApp('a.md', '- [ ] Water 🔁 every 3 days when done 📅 2020-01-01\n');
        await new TaskWriter(app).setStatusInFile('a.md', 1, 'done', 'Water');

        const today = new Date(`${getTodayString()}T00:00:00Z`);
        const expected = new Date(today.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
        expect(store.text).toContain(`📅 ${expected}`);
    });

    it('completes the task but says so when the rule cannot be read', async () => {
        const { app, store } = fakeApp('a.md', '- [ ] Odd 🔁 every blue moon 📅 2025-02-02\n');
        const ok = await new TaskWriter(app).setStatusInFile('a.md', 1, 'done', 'Odd');

        expect(ok).toBe(true);
        expect(store.text.match(/- \[ \]/g)).toBeNull();
        const shown = (Notice as unknown as { shown: unknown[] }).shown;
        expect(shown).toHaveLength(1);
        expect(String(shown[0])).toContain('every blue moon');
    });
});
