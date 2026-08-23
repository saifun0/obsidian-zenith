import { describe, it, expect } from 'vitest';
import {
    attachmentLine,
    buildDetailLines,
    detailLines,
    detailRange,
    detailsEqual,
    hasDetails,
    parseDetails,
    writeDetails,
    type TaskDetails,
} from '../src/modules/tasks/services/taskDetails';
import {
    buildTaskBody,
    formatDuration,
    normalizeTimeOfDay,
    parseDuration,
    parseTaskText,
} from '../src/modules/tasks/services/taskFormat';

const NO_DEFAULTS = { priority: 'none' as const, tags: [] as string[] };

/**
 * The storage format for the four new fields: an hour, two durations, a
 * description and attachments. Everything is written the way a person would
 * write it by hand, so everything here is really one question — does the line
 * still mean the same thing after a round trip through the plugin?
 */

describe('durations on the task line', () => {
    it('reads the way a person writes them', () => {
        expect(parseDuration('45m')).toBe(45);
        expect(parseDuration('2h')).toBe(120);
        expect(parseDuration('1h25m')).toBe(85);
        expect(parseDuration('90')).toBe(90);
    });

    it('writes them back the same way', () => {
        expect(formatDuration(45)).toBe('45m');
        expect(formatDuration(120)).toBe('2h');
        expect(formatDuration(85)).toBe('1h25m');
    });

    it('round-trips every value it can produce', () => {
        for (const minutes of [1, 7, 45, 59, 60, 61, 85, 120, 599, 1440]) {
            expect(parseDuration(formatDuration(minutes))).toBe(minutes);
        }
    });

    it('refuses what is not a duration', () => {
        for (const bad of ['', 'soon', '-5m', 'h', 'm', '0m']) {
            expect(parseDuration(bad)).toBeUndefined();
        }
    });
});

describe('the hour a task is due', () => {
    it('pads a single-digit hour', () => {
        expect(normalizeTimeOfDay('9:05')).toBe('09:05');
        expect(normalizeTimeOfDay(' 18:00 ')).toBe('18:00');
    });

    it('refuses an hour that does not exist', () => {
        for (const bad of ['24:00', '12:60', '18', '18:0', 'noon', '']) {
            expect(normalizeTimeOfDay(bad)).toBeUndefined();
        }
    });
});

describe('markers on the line', () => {
    it('parses the hour, the time spent and the countdown', () => {
        const parsed = parseTaskText(
            'Zenith 0.1.0 ⏫ 📅 2026-09-01 ⏰ 18:00 ⏱ 1h25m ⏲ 25m #work',
            NO_DEFAULTS
        );
        expect(parsed.title).toBe('Zenith 0.1.0');
        expect(parsed.dueDate).toBe('2026-09-01');
        expect(parsed.dueTime).toBe('18:00');
        expect(parsed.spentMinutes).toBe(85);
        expect(parsed.timerMinutes).toBe(25);
        expect(parsed.priority).toBe('urgent');
        expect(parsed.tags).toEqual(['work']);
    });

    it('keeps none of them in the title', () => {
        const parsed = parseTaskText('Купить хлеб ⏰ 09:30 ⏱ 15m ⏲ 5m', NO_DEFAULTS);
        expect(parsed.title).toBe('Купить хлеб');
    });

    it('round-trips through the body builder', () => {
        const body = buildTaskBody({
            title: 'Zenith 0.1.0',
            priority: 'high',
            tags: ['zenith'],
            dueDate: '2026-09-01',
            dueTime: '18:00',
            spentMinutes: 85,
            timerMinutes: 25,
        });
        const parsed = parseTaskText(body, NO_DEFAULTS);
        expect(parsed).toMatchObject({
            title: 'Zenith 0.1.0',
            dueDate: '2026-09-01',
            dueTime: '18:00',
            spentMinutes: 85,
            timerMinutes: 25,
            priority: 'high',
        });
    });

    it('leaves a task without them unchanged', () => {
        const parsed = parseTaskText('Просто задача 📅 2026-09-01', NO_DEFAULTS);
        expect(parsed.dueTime).toBeUndefined();
        expect(parsed.spentMinutes).toBeUndefined();
        expect(parsed.timerMinutes).toBeUndefined();
    });

    it('does not let a recurrence rule swallow the markers after it', () => {
        const parsed = parseTaskText('Отчёт 🔁 every week ⏰ 10:00 ⏱ 30m', NO_DEFAULTS);
        expect(parsed.recurrence?.trim()).toBe('every week');
        expect(parsed.dueTime).toBe('10:00');
        expect(parsed.spentMinutes).toBe(30);
    });
});

describe('the block under the task', () => {
    it('separates prose from links', () => {
        const details = parseDetails([
            'доделать перенос функций и выложить',
            '![[скрин.png]]',
            '[[Заметки/План релиза]]',
            '→ [[Задачи#Публикация на GitHub]]',
        ]);
        expect(details.description).toBe('доделать перенос функций и выложить');
        expect(details.attachments).toEqual([
            { kind: 'image', target: 'скрин.png', label: undefined },
            { kind: 'note', target: 'Заметки/План релиза', label: undefined },
            { kind: 'task', target: 'Задачи#Публикация на GitHub', label: undefined },
        ]);
    });

    it('keeps a multi-line description as one text', () => {
        const details = parseDetails(['первая строка', 'вторая строка', '[[Заметка]]']);
        expect(details.description).toBe('первая строка\nвторая строка');
        expect(details.attachments).toHaveLength(1);
    });

    it('tells an embedded picture from an embedded note by its extension', () => {
        expect(parseDetails(['![[фото.jpg]]']).attachments[0].kind).toBe('image');
        expect(parseDetails(['![[Заметка]]']).attachments[0].kind).toBe('note');
    });

    it('takes a picture from the web as well as from the vault', () => {
        const details = parseDetails([
            '![подпись](https://example.com/a.png)',
            'https://example.com/b.jpg',
            'https://example.com/article',
        ]);
        expect(details.attachments.map((a) => a.kind)).toEqual(['image', 'image', 'link']);
        expect(details.attachments[0].label).toBe('подпись');
    });

    it('reads a link alias as the label', () => {
        const [attachment] = parseDetails(['[[Заметки/План релиза|План]]']).attachments;
        expect(attachment).toEqual({ kind: 'note', target: 'Заметки/План релиза', label: 'План' });
    });

    it('ignores blank lines', () => {
        expect(parseDetails(['', '   ', 'текст'])).toEqual({
            description: 'текст',
            attachments: [],
        });
    });

    it('round-trips every kind of attachment', () => {
        const details: TaskDetails = {
            description: 'описание\nвторая строка',
            attachments: [
                { kind: 'image', target: 'скрин.png' },
                { kind: 'image', target: 'https://example.com/a.png', label: 'подпись' },
                { kind: 'note', target: 'Заметки/План релиза', label: 'План' },
                { kind: 'task', target: 'Задачи#Публикация' },
                { kind: 'link', target: 'https://example.com/article', label: 'статья' },
            ],
        };
        const lines = buildDetailLines(details, '    ');
        expect(lines.every((l) => l.startsWith('    '))).toBe(true);
        expect(detailsEqual(parseDetails(lines), details)).toBe(true);
    });

    it('writes a task link with the arrow that identifies it', () => {
        expect(attachmentLine({ kind: 'task', target: 'Задачи#Публикация' })).toBe(
            '→ [[Задачи#Публикация]]'
        );
        expect(attachmentLine({ kind: 'note', target: 'Заметка' })).toBe('[[Заметка]]');
    });

    it('leaves no lines behind when there is nothing to say', () => {
        expect(buildDetailLines({ description: '', attachments: [] }, '    ')).toEqual([]);
        expect(buildDetailLines({ description: '   \n  ', attachments: [] }, '    ')).toEqual([]);
        expect(hasDetails({ description: '', attachments: [] })).toBe(false);
        expect(hasDetails({ description: 'x', attachments: [] })).toBe(true);
    });

    it('finds the block a task owns, and stops where it ends', () => {
        const lines = [
            '- [ ] Zenith 0.1.0 📅 2026-09-01',
            '    описание задачи',
            '    ![[скрин.png]]',
            '    - [x] Перенести функции',
            '- [ ] Другая задача',
        ];
        expect(detailRange(lines, 0)).toEqual({ start: 1, end: 3 });
        expect(detailLines(lines, 0)).toEqual(['описание задачи', '![[скрин.png]]']);
        // The next task owns nothing; its block is empty and sits where one
        // would be inserted.
        expect(detailRange(lines, 4)).toEqual({ start: 5, end: 5 });
    });

    it('stops at a blank line and at a dedent', () => {
        expect(detailLines(['- [ ] A', '    описание', '', '    не моё'], 0)).toEqual(['описание']);
        expect(detailLines(['  - [ ] A', '      описание', '  текст'], 0)).toEqual(['описание']);
    });

    it('gives a task its first block, indented one step in', () => {
        const before = ['- [ ] Задача', '- [ ] Другая'];
        const after = writeDetails(before, 0, {
            description: 'что сделать',
            attachments: [{ kind: 'note', target: 'Заметка' }],
        });
        expect(after).toEqual([
            '- [ ] Задача',
            '    что сделать',
            '    [[Заметка]]',
            '- [ ] Другая',
        ]);
    });

    it('keeps the indent the file already used', () => {
        const before = ['\t- [ ] Задача', '\t\tстарое описание'];
        const after = writeDetails(before, 0, { description: 'новое', attachments: [] });
        expect(after).toEqual(['\t- [ ] Задача', '\t\tновое']);
    });

    it('indents with a tab when the task line does', () => {
        const after = writeDetails(['\t- [ ] Задача'], 0, { description: 'x', attachments: [] });
        expect(after[1]).toBe('\t\tx');
    });

    it('replaces the block rather than adding a second one', () => {
        const before = ['- [ ] Задача', '    первое', '    [[Старая]]', '    - [ ] Подзадача'];
        const after = writeDetails(before, 0, { description: 'второе', attachments: [] });
        expect(after).toEqual(['- [ ] Задача', '    второе', '    - [ ] Подзадача']);
    });

    it('clears the block when there is nothing left to say', () => {
        const before = ['- [ ] Задача', '    описание', '    - [ ] Подзадача'];
        const after = writeDetails(before, 0, { description: '', attachments: [] });
        expect(after).toEqual(['- [ ] Задача', '    - [ ] Подзадача']);
    });

    it('round-trips a file: read the block, write it back unchanged', () => {
        const file = [
            '# Задачи',
            '',
            '- [ ] Zenith 0.1.0 ⏫ 📅 2026-09-01 ⏰ 18:00',
            '    доделать перенос функций',
            '    ![[скрин.png]]',
            '    → [[Задачи#Публикация]]',
            '    - [x] Перенести функции',
            '- [ ] Другая',
        ];
        const read = parseDetails(detailLines(file, 2));
        expect(writeDetails(file, 2, read)).toEqual(file);
    });

    it('leaves a subtask block alone when the parent block is rewritten', () => {
        const file = [
            '- [ ] Родитель',
            '    описание родителя',
            '    - [ ] Ребёнок',
            '        описание ребёнка',
        ];
        const after = writeDetails(file, 0, { description: 'новое', attachments: [] });
        expect(after).toEqual([
            '- [ ] Родитель',
            '    новое',
            '    - [ ] Ребёнок',
            '        описание ребёнка',
        ]);
        // And the child's own block is still readable at its own line.
        expect(detailLines(after, 2)).toEqual(['описание ребёнка']);
    });

    it('compares two blocks by what they say', () => {
        const a: TaskDetails = { description: 'x', attachments: [{ kind: 'note', target: 'A' }] };
        expect(detailsEqual(a, { description: 'x', attachments: [{ kind: 'note', target: 'A' }] })).toBe(true);
        expect(detailsEqual(a, { description: 'y', attachments: [{ kind: 'note', target: 'A' }] })).toBe(false);
        expect(detailsEqual(a, { description: 'x', attachments: [{ kind: 'task', target: 'A' }] })).toBe(false);
        expect(detailsEqual(a, { description: 'x', attachments: [] })).toBe(false);
    });
});
