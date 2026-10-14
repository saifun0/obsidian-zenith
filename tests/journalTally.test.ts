import { describe, it, expect } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import { dayTitle, monthTitle } from '../src/core/calendarDates';
import { addDays } from '../src/modules/journal/services/journalDates';
import { journalStats } from '../src/modules/journal/services/journalStats';
import { journalTally, lastEntryWhen } from '../src/modules/journal/services/journalTally';
import type { JournalEntry } from '../src/store/journalSlice';

const TODAY = '2026-09-24';
const en = translatorFor('en');
const ru = translatorFor('ru');

const entry = (date: string, words = 100): JournalEntry => ({
    date,
    filePath: `J/${date}.md`,
    values: {},
    tags: [],
    body: '',
    words,
    mtime: 0,
});

/** Entries on the days that many days before today. */
const written = (...ago: number[]) => ago.map((n) => entry(addDays(TODAY, -n)));
const tally = (entries: JournalEntry[], words = true, t = en) =>
    journalTally(journalStats(entries, [], TODAY, 30), TODAY, t, { words });

describe('the line under the journal’s title', () => {
    it('says the window it counts, the streak, and the words', () => {
        expect(tally(written(0, 1, 2, 5))).toEqual([
            '4 of the last 30 days',
            'streak 3, best 3',
            '400 words',
        ]);
    });

    it('leaves the words out when the word count is switched off', () => {
        expect(tally(written(0, 1), false)).toEqual(['2 of the last 30 days', 'streak 2, best 2']);
    });

    it('names the last entry only when it was not today', () => {
        // Written today: the streak says so already.
        expect(tally(written(0)).some((part) => part.startsWith('last entry'))).toBe(false);
        expect(tally(written(1))).toContain('last entry yesterday');
        expect(tally(written(3))).toContain('last entry 3 days ago');
        // Past a week, the date says more than a count of days.
        expect(tally(written(12))).toContain('last entry Sep 12');
    });

    it('is one plain sentence for a journal with nothing in it', () => {
        expect(tally([])).toEqual(['nothing written yet']);
        // An empty note is not an entry.
        expect(tally([entry(TODAY, 0)])).toEqual(['nothing written yet']);
    });

    it('still counts what was written before the window', () => {
        const line = tally(written(40));
        expect(line[0]).toBe('0 of the last 30 days');
        expect(line[1]).toBe('streak 0, best 1');
        expect(line[2]).toBe('last entry Aug 15');
    });

    it('groups a long count the way the language does', () => {
        expect(tally([entry(TODAY, 1234)])).toContain('1,234 words');
    });

    it('reads as Russian in Russian', () => {
        const line = tally([...written(1, 2), entry(addDays(TODAY, -3), 413)], true, ru);
        expect(line).toEqual([
            '3 из последних 30 дней',
            'серия 3, рекорд 3',
            'последняя запись вчера',
            '613 слов',
        ]);
    });
});

describe('when the journal was last written in', () => {
    it('is relative within a week and a date after it', () => {
        expect(lastEntryWhen('2026-09-23', TODAY, 'en-US')).toBe('yesterday');
        expect(lastEntryWhen('2026-09-18', TODAY, 'en-US')).toBe('6 days ago');
        expect(lastEntryWhen('2026-09-17', TODAY, 'en-US')).toBe('Sep 17');
    });
});

describe('a date as the title of a page', () => {
    it('capitalises the first letter and no other', () => {
        expect(monthTitle('2026-09-24', 'en-US')).toBe('September 2026');
        expect(dayTitle('2026-09-24', 'en-US')).toBe('Thursday, September 24');
        // CSS `capitalize` made these "Сентябрь 2026 Г." and "Четверг, 24 Сентября".
        expect(monthTitle('2026-09-24', 'ru-RU')).toBe('Сентябрь 2026');
        expect(dayTitle('2026-09-24', 'ru-RU')).toBe('Четверг, 24 сентября');
    });

    it('leaves a language without capitals as it is', () => {
        expect(monthTitle('2026-09-24', 'zh-CN')).toBe('2026年9月');
    });
});
