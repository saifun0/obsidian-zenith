import { describe, it, expect } from 'vitest';
import {
    BUILTIN_PROMPTS,
    parsePrompts,
    pickPrompt,
} from '../src/modules/journal/services/dailyPrompt';
import { applyTemplate } from '../src/modules/journal/services/journalWriter';

describe('parsePrompts', () => {
    it('takes one question a line, without markers, headings or frontmatter', () => {
        const note = [
            '---',
            'tags: [prompts]',
            '---',
            '# Questions',
            '',
            '- What went well?',
            '* [ ] What went badly?',
            '3. What next?',
            '> Why?',
            '```',
        ].join('\n');
        expect(parsePrompts(note)).toEqual([
            'What went well?',
            'What went badly?',
            'What next?',
            'Why?',
        ]);
    });
});

describe('pickPrompt', () => {
    it('is the same question all day, wherever it is asked', () => {
        expect(pickPrompt(['a', 'b', 'c'], '2026-09-24')).toBe(
            pickPrompt(['a', 'b', 'c'], '2026-09-24')
        );
    });

    it('walks through the list before repeating one', () => {
        const days = ['2026-09-24', '2026-09-25', '2026-09-26'].map((d) =>
            pickPrompt(['a', 'b', 'c'], d)
        );
        expect(new Set(days).size).toBe(3);
    });

    it('has nothing to say without questions', () => {
        expect(pickPrompt([], '2026-09-24')).toBeNull();
    });

    it('ships the same number of questions in both languages', () => {
        expect(BUILTIN_PROMPTS.en.length).toBe(BUILTIN_PROMPTS.ru.length);
    });
});

describe('applyTemplate — {{prompt}}', () => {
    it('puts the question where the template asks for it', () => {
        expect(applyTemplate('> {{prompt}}', '2026-09-24', 'x', 'Why?')).toBe('> Why?');
    });

    it('leaves nothing behind when there is no question', () => {
        expect(applyTemplate('> {{ prompt }}', '2026-09-24', 'x')).toBe('> ');
    });
});
