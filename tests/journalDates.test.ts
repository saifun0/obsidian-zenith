import { describe, it, expect } from 'vitest';
import {
    formatJournalDate,
    buildDateMatcher,
    journalNotePath,
    relativeNotePath,
    normalizeFolder,
    isoToDate,
    addDays,
    addMonths,
    sameMonth,
    monthGrid,
    weekdayLabels,
} from '../src/modules/journal/services/journalDates';

const D = (iso: string) => isoToDate(iso);

describe('formatJournalDate', () => {
    it('formats the common ISO pattern', () => {
        expect(formatJournalDate(D('2026-07-28'), 'YYYY-MM-DD')).toBe('2026-07-28');
    });

    it('supports padded and unpadded numeric tokens', () => {
        expect(formatJournalDate(D('2026-01-05'), 'D.M.YYYY')).toBe('5.1.2026');
        expect(formatJournalDate(D('2026-01-05'), 'DD.MM.YY')).toBe('05.01.26');
    });

    it('writes English month and weekday names regardless of locale', () => {
        expect(formatJournalDate(D('2026-07-28'), 'MMMM D, YYYY')).toBe('July 28, 2026');
        expect(formatJournalDate(D('2026-07-28'), 'ddd MMM DD')).toBe('Tue Jul 28');
    });

    it('keeps [bracketed] runs literal', () => {
        expect(formatJournalDate(D('2026-07-28'), '[Day] YYYY-MM-DD')).toBe('Day 2026-07-28');
    });

    it('leaves separators (including folder slashes) alone', () => {
        expect(formatJournalDate(D('2026-07-28'), 'YYYY/MM/YYYY-MM-DD')).toBe('2026/07/2026-07-28');
    });
});

describe('journalNotePath', () => {
    it('joins the folder, the formatted name and the extension', () => {
        expect(journalNotePath('11 Journal', 'YYYY-MM-DD', D('2026-07-28'))).toBe(
            '11 Journal/2026-07-28.md'
        );
    });

    it('creates nested paths when the pattern contains slashes', () => {
        expect(journalNotePath('Journal', 'YYYY/MM/DD', D('2026-07-28'))).toBe(
            'Journal/2026/07/28.md'
        );
    });

    it('handles a vault-root journal', () => {
        expect(journalNotePath('', 'YYYY-MM-DD', D('2026-07-28'))).toBe('2026-07-28.md');
        expect(journalNotePath('/Journal/', 'YYYY-MM-DD', D('2026-07-28'))).toBe(
            'Journal/2026-07-28.md'
        );
    });
});

describe('buildDateMatcher', () => {
    it('recovers the date from an ISO filename', () => {
        const match = buildDateMatcher('YYYY-MM-DD');
        expect(match('2026-07-28')).toBe('2026-07-28');
    });

    it('recovers the date from a nested pattern', () => {
        const match = buildDateMatcher('YYYY/MM/DD');
        expect(match('2026/07/28')).toBe('2026-07-28');
    });

    it('pads unpadded numeric tokens back into ISO form', () => {
        const match = buildDateMatcher('D.M.YYYY');
        expect(match('5.1.2026')).toBe('2026-01-05');
    });

    it('reads back the English month names it writes', () => {
        const match = buildDateMatcher('MMMM D, YYYY');
        expect(match('July 28, 2026')).toBe('2026-07-28');
    });

    it('expands a two-digit year into the 2000s', () => {
        expect(buildDateMatcher('YY-MM-DD')('26-07-28')).toBe('2026-07-28');
    });

    it('rejects a name that does not match the pattern', () => {
        const match = buildDateMatcher('YYYY-MM-DD');
        expect(match('Index')).toBeNull();
        expect(match('2026-07-28 backup')).toBeNull();
    });

    it('rejects impossible calendar fields', () => {
        expect(buildDateMatcher('YYYY-MM-DD')('2026-13-28')).toBeNull();
    });

    it('gives up on patterns that cannot pin down a day', () => {
        // Nothing to invert — the parser falls back to `date:` frontmatter.
        expect(buildDateMatcher('MMMM YYYY')('July 2026')).toBeNull();
        expect(buildDateMatcher('[Daily]')('Daily')).toBeNull();
    });

    it('treats regex metacharacters in the pattern as literals', () => {
        const match = buildDateMatcher('YYYY.MM.DD');
        expect(match('2026.07.28')).toBe('2026-07-28');
        expect(match('2026x07y28')).toBeNull();
    });
});

describe('relativeNotePath', () => {
    it('strips the journal folder and the extension', () => {
        expect(relativeNotePath('11 Journal/2026-07-28.md', '11 Journal')).toBe('2026-07-28');
    });

    it('keeps subfolders inside the journal', () => {
        expect(relativeNotePath('J/2026/07/28.md', 'J')).toBe('2026/07/28');
    });

    it('returns null for a file outside the journal', () => {
        expect(relativeNotePath('Notes/2026-07-28.md', '11 Journal')).toBeNull();
    });

    it('handles a vault-root journal', () => {
        expect(relativeNotePath('2026-07-28.md', '')).toBe('2026-07-28');
    });
});

describe('normalizeFolder', () => {
    it('trims whitespace and surrounding slashes', () => {
        expect(normalizeFolder('  /11 Journal/ ')).toBe('11 Journal');
        expect(normalizeFolder('')).toBe('');
    });
});

describe('calendar arithmetic', () => {
    it('shifts days across month and year boundaries', () => {
        expect(addDays('2026-07-28', 5)).toBe('2026-08-02');
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('clamps a month shift to the end of a shorter month', () => {
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
        expect(addMonths('2026-03-15', -1)).toBe('2026-02-15');
    });

    it('compares calendar months', () => {
        expect(sameMonth('2026-07-01', '2026-07-31')).toBe(true);
        expect(sameMonth('2026-07-31', '2026-08-01')).toBe(false);
    });

    it('builds a six-week grid starting on the configured weekday', () => {
        const monday = monthGrid('2026-07-15', 'mon');
        expect(monday).toHaveLength(42);
        // 1 July 2026 is a Wednesday, so a Monday-first grid opens on 29 June.
        expect(monday[0]).toBe('2026-06-29');
        expect(monday).toContain('2026-07-01');

        const sunday = monthGrid('2026-07-15', 'sun');
        expect(sunday[0]).toBe('2026-06-28');
    });

    it('keeps the grid a constant height so the panel below never jumps', () => {
        expect(monthGrid('2026-02-10', 'mon')).toHaveLength(42);
        expect(monthGrid('2026-08-10', 'sun')).toHaveLength(42);
    });

    it('rotates weekday labels to match the week start', () => {
        expect(weekdayLabels('en-US', 'sun')[0]).toBe('Sun');
        expect(weekdayLabels('en-US', 'mon')[0]).toBe('Mon');
        expect(weekdayLabels('en-US', 'mon')[6]).toBe('Sun');
    });
});
