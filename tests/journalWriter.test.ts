import { describe, it, expect } from 'vitest';
import { applyTemplate, withDate } from '../src/modules/journal/services/journalWriter';
import { insertUnderHeading, appendBlock } from '../src/services/markdownSections';
import { countWords } from '../src/modules/journal/services/journalParser';

describe('applyTemplate', () => {
    it('substitutes the date as ISO', () => {
        expect(applyTemplate('# {{date}}', '2026-07-28', 'x')).toBe('# 2026-07-28');
    });

    it('supports an explicit pattern', () => {
        expect(applyTemplate('{{date:MMMM D}}', '2026-07-28', 'x')).toBe('July 28');
        expect(applyTemplate('{{ date : DD.MM.YYYY }}', '2026-07-28', 'x')).toBe('28.07.2026');
    });

    it('substitutes the note title', () => {
        expect(applyTemplate('# {{title}}', '2026-07-28', '2026-07-28')).toBe('# 2026-07-28');
    });

    it('renders a time in HH:mm', () => {
        expect(applyTemplate('{{time}}', '2026-07-28', 'x')).toMatch(/^\d{2}:\d{2}$/);
    });

    it('leaves unknown placeholders alone rather than blanking them', () => {
        expect(applyTemplate('{{weather}}', '2026-07-28', 'x')).toBe('{{weather}}');
    });
});

describe('withDate', () => {
    it('adds frontmatter to a body that has none', () => {
        expect(withDate('## Notes\n', '2026-07-28')).toBe('---\ndate: 2026-07-28\n---\n\n## Notes\n');
    });

    it('merges into the template\'s existing frontmatter instead of adding a second block', () => {
        const result = withDate('---\ntags: [daily]\n---\n\n## Notes\n', '2026-07-28');
        expect(result).toBe('---\ndate: 2026-07-28\ntags: [daily]\n---\n\n## Notes\n');
        expect(result.match(/^---$/gm)).toHaveLength(2);
    });

    it('leaves a template that already sets its own date untouched', () => {
        const body = '---\ndate: 1999-01-01\n---\n\nbody\n';
        expect(withDate(body, '2026-07-28')).toContain('date: 1999-01-01');
        expect(withDate(body, '2026-07-28')).not.toContain('2026-07-28');
    });
});

describe('insertUnderHeading', () => {
    const note = [
        '# 2026-07-28',
        '',
        '## Tasks',
        '- [ ] existing',
        '',
        '## Notes',
        'some prose',
        '',
    ];

    it('appends at the end of the named section', () => {
        const result = insertUnderHeading(note, 'Tasks', ['- [ ] new']);
        expect(result).not.toBeNull();
        expect(result!.slice(2, 6)).toEqual(['## Tasks', '- [ ] existing', '- [ ] new', '']);
    });

    it('matches the heading text at any level and ignoring case', () => {
        expect(insertUnderHeading(['### tasks', ''], 'Tasks', ['x'])).not.toBeNull();
    });

    it('returns null when the heading is absent, so the caller can append', () => {
        expect(insertUnderHeading(note, 'Gratitude', ['x'])).toBeNull();
        expect(insertUnderHeading(note, '', ['x'])).toBeNull();
    });

    it('inserts at the end of the file when the section is the last one', () => {
        const result = insertUnderHeading(note, 'Notes', ['more']);
        expect(result![result!.length - 1]).toBe('');
        expect(result).toContain('more');
        expect(result!.indexOf('more')).toBeGreaterThan(result!.indexOf('some prose'));
    });

    it('does not fall through into a deeper subsection of another heading', () => {
        const lines = ['## Tasks', '- [ ] a', '### Later', '- [ ] b', '## Notes', 'x'];
        const result = insertUnderHeading(lines, 'Tasks', ['- [ ] new']);
        // The whole `## Tasks` block ends at `## Notes`, so the new line lands
        // after the nested subsection but before Notes.
        expect(result).toEqual([
            '## Tasks',
            '- [ ] a',
            '### Later',
            '- [ ] b',
            '- [ ] new',
            '## Notes',
            'x',
        ]);
    });
});

describe('appendBlock', () => {
    it('adds the missing newline between the note and the block', () => {
        expect(appendBlock('a', 'b')).toBe('a\nb\n');
        expect(appendBlock('a\n', 'b')).toBe('a\nb\n');
    });

    it('handles an empty file', () => {
        expect(appendBlock('', 'b')).toBe('b\n');
    });
});

describe('countWords', () => {
    it('counts prose words', () => {
        expect(countWords('the quick brown fox')).toBe(4);
    });

    it('reads a bare template as empty — headings are not writing', () => {
        expect(countWords('## Highlights\n\n- \n\n## Tasks\n\n## Notes\n')).toBe(0);
        expect(countWords('#\n- \n> \n')).toBe(0);
    });

    it('ignores frontmatter', () => {
        expect(countWords('---\ndate: 2026-07-28\nmood: 4\n---\n\nhello there\n')).toBe(2);
    });

    it('counts only what was written under the notes heading', () => {
        const note = [
            '## Highlights',
            '- shipped the parser rewrite',
            '## Tasks',
            '- [ ] call the dentist',
            '## Notes',
            'three words here',
        ].join('\n');
        expect(countWords(note)).toBe(3);
    });

    it('recognises the heading in every language Zenith ships', () => {
        // A note written under Russian has to keep its count when the interface
        // is switched to English, and the other way round.
        expect(countWords('## Задачи\n- одна\n## Заметки\nдва слова тут')).toBe(3);
        expect(countWords('## Notes\nfour little words here')).toBe(4);
    });

    it('stops at the next heading of the same level', () => {
        expect(countWords('## Notes\ntwo words\n## Later\nthree more words here')).toBe(2);
    });

    it('keeps going through a deeper heading inside the section', () => {
        expect(countWords('## Notes\none\n### Evening\ntwo three')).toBe(4);
    });

    it('falls back to the whole note when there is no notes heading', () => {
        // A note written without the template is all prose; reporting zero
        // words for it would break the streak it earned.
        expect(countWords('just some free writing')).toBe(4);
    });

    it('counts words with apostrophes and hyphens once', () => {
        expect(countWords("it's a well-known thing")).toBe(4);
    });

    it('counts non-Latin scripts', () => {
        expect(countWords('привет как дела')).toBe(3);
    });
});
