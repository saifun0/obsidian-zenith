import { describe, expect, it } from 'vitest';
import {
    countRecords,
    noteLine,
    withHighlight,
} from '../src/modules/journal/services/todayCapture';

/**
 * The "Today" card's line: a note with its time, a highlight into its
 * section, and the count of what the day's note holds.
 */

const NOTE = [
    '# 2026-10-21',
    '',
    '## Highlights',
    '',
    '- ',
    '',
    '## Tasks',
    '- [ ] Buy milk',
    '',
    '## Notes',
    '',
].join('\n');

describe('a note', () => {
    it('is written with the hour and minute it was said', () => {
        expect(noteLine('  called the bank ', new Date(2026, 9, 21, 9, 5))).toBe(
            '09:05 — called the bank'
        );
    });
});

describe('a highlight', () => {
    it('fills the template’s empty bullet', () => {
        const out = withHighlight(NOTE.split('\n'), 'Highlights', 'Finished the draft');
        expect(out?.slice(2, 6)).toEqual(['## Highlights', '', '- Finished the draft', '']);
    });

    it('goes after the last one when there is no empty bullet left', () => {
        const once = withHighlight(NOTE.split('\n'), 'highlights', 'One') ?? [];
        const twice = withHighlight(once, 'Highlights', 'Two') ?? [];
        expect(twice.slice(2, 7)).toEqual(['## Highlights', '', '- One', '- Two', '']);
        expect(twice[7]).toBe('## Tasks');
    });

    it('is nothing to place in a note without the heading', () => {
        expect(withHighlight(['# Day', 'text'], 'Highlights', 'x')).toBeNull();
    });
});

describe('what the day holds', () => {
    it('counts notes by the hour, filled highlights and the tasks written in', () => {
        const body = [
            '## Highlights',
            '- ',
            '- Finished the draft',
            '- [ ] not a highlight',
            '## Notes',
            '09:05 — called the bank',
            '14:30 — lunch with Anna',
            'a line without a time',
        ].join('\n');
        expect(countRecords(body, 'Highlights', 2)).toBe(5);
        expect(countRecords('', 'Highlights', 0)).toBe(0);
    });
});
