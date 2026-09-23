import { describe, it, expect } from 'vitest';
import { pieceKey, quickParse, type QuickParse } from '../src/modules/tasks/services/quickParse';

/** A Wednesday. */
const TODAY = '2026-09-23';

type Expect = Partial<Omit<QuickParse, 'pieces'>> & { pieces?: string[] };

function check(text: string, want: Expect) {
    const got = quickParse(text, TODAY);
    const { pieces, ...fields } = want;
    expect(got).toMatchObject(fields);
    if (pieces) expect(got.pieces.map((p) => p.text)).toEqual(pieces);
    // Nothing the phrase did not say is filled in.
    for (const key of ['dueDate', 'dueTime', 'dueEndTime', 'priority', 'recurrence'] as const) {
        if (!(key in want)) expect(got[key]).toBeUndefined();
    }
}

describe('quickParse — Russian', () => {
    it.each<[string, Expect]>([
        ['Позвонить маме завтра', { title: 'Позвонить маме', dueDate: '2026-09-24' }],
        ['сегодня купить хлеб', { title: 'купить хлеб', dueDate: TODAY }],
        ['Отчёт послезавтра', { title: 'Отчёт', dueDate: '2026-09-25' }],
        ['Встреча в пятницу', { title: 'Встреча', dueDate: '2026-09-25', pieces: ['в пятницу'] }],
        ['Встреча пт', { title: 'Встреча', dueDate: '2026-09-25' }],
        ['Бассейн во вторник', { title: 'Бассейн', dueDate: '2026-09-29' }],
        // A weekday named on that very day is next week's.
        ['Планёрка в среду', { title: 'Планёрка', dueDate: '2026-09-30' }],
        ['Сдать +3д', { title: 'Сдать', dueDate: '2026-09-26' }],
        ['Сдать +2н', { title: 'Сдать', dueDate: '2026-10-07' }],
        ['Паспорт 15.10', { title: 'Паспорт', dueDate: '2026-10-15' }],
        // Already past this year, so next year's.
        ['Паспорт 15.03', { title: 'Паспорт', dueDate: '2027-03-15' }],
        ['Паспорт 15.03.2028', { title: 'Паспорт', dueDate: '2028-03-15' }],
    ])('dates: %s', (text, want) => check(text, want));

    it.each<[string, Expect]>([
        [
            'Позвонить маме завтра в 18',
            {
                title: 'Позвонить маме',
                dueDate: '2026-09-24',
                dueTime: '18:00',
                impliedDate: false,
            },
        ],
        ['Созвон 18:30', { title: 'Созвон', dueTime: '18:30', dueDate: TODAY, impliedDate: true }],
        [
            'Спортзал в 18–19',
            {
                title: 'Спортзал',
                dueTime: '18:00',
                dueEndTime: '19:00',
                dueDate: TODAY,
                impliedDate: true,
            },
        ],
        [
            'Урок 18:00-19:30',
            {
                title: 'Урок',
                dueTime: '18:00',
                dueEndTime: '19:30',
                dueDate: TODAY,
                impliedDate: true,
            },
        ],
        [
            'Приём с 9 до 10:30',
            {
                title: 'Приём',
                dueTime: '09:00',
                dueEndTime: '10:30',
                dueDate: TODAY,
                impliedDate: true,
            },
        ],
    ])('times: %s', (text, want) => check(text, want));

    it.each<[string, Expect]>([
        ['Срочно позвонить !!', { title: 'Срочно позвонить', priority: 'urgent' }],
        ['Позвонить !', { title: 'Позвонить', priority: 'high' }],
    ])('priority: %s', (text, want) => check(text, want));

    it.each<[string, Expect]>([
        [
            'Зарядка каждый день',
            { title: 'Зарядка', recurrence: 'every day', dueDate: TODAY, impliedDate: true },
        ],
        [
            'Уборка каждую неделю',
            { title: 'Уборка', recurrence: 'every week', dueDate: TODAY, impliedDate: true },
        ],
        [
            'Счета ежемесячно',
            { title: 'Счета', recurrence: 'every month', dueDate: TODAY, impliedDate: true },
        ],
        [
            'Полив каждые 3 дня',
            { title: 'Полив', recurrence: 'every 3 days', dueDate: TODAY, impliedDate: true },
        ],
        [
            'Отчёт каждые 2 недели пт',
            { title: 'Отчёт', recurrence: 'every 2 weeks', dueDate: '2026-09-25' },
        ],
        [
            'ТО каждые 5 лет',
            { title: 'ТО', recurrence: 'every 5 years', dueDate: TODAY, impliedDate: true },
        ],
    ])('repeats: %s', (text, want) => check(text, want));
});

describe('quickParse — English', () => {
    it.each<[string, Expect]>([
        [
            'Call mom tomorrow at 6pm',
            { title: 'Call mom', dueDate: '2026-09-24', dueTime: '18:00' },
        ],
        ['Pay rent today', { title: 'Pay rent', dueDate: TODAY }],
        ['Standup on friday 9:30', { title: 'Standup', dueDate: '2026-09-25', dueTime: '09:30' }],
        ['Gym mon at 7', { title: 'Gym', dueDate: '2026-09-28', dueTime: '07:00' }],
        ['Review +1w', { title: 'Review', dueDate: '2026-09-30' }],
        [
            'Lunch at 12:30am',
            { title: 'Lunch', dueTime: '00:30', dueDate: TODAY, impliedDate: true },
        ],
        [
            'Class 18:00–19:30',
            {
                title: 'Class',
                dueTime: '18:00',
                dueEndTime: '19:30',
                dueDate: TODAY,
                impliedDate: true,
            },
        ],
        [
            'Water plants every 2 days',
            {
                title: 'Water plants',
                recurrence: 'every 2 days',
                dueDate: TODAY,
                impliedDate: true,
            },
        ],
        [
            'Backup weekly',
            { title: 'Backup', recurrence: 'every week', dueDate: TODAY, impliedDate: true },
        ],
        ['Ship it !!', { title: 'Ship it', priority: 'urgent' }],
    ])('%s', (text, want) => check(text, want));
});

describe('quickParse — what stays words', () => {
    it.each<[string, Expect]>([
        // A bare number is never a time.
        ['Купить 2 хлеба', { title: 'Купить 2 хлеба' }],
        ['Прочитать главы 3-5', { title: 'Прочитать главы 3-5' }],
        // "!" glued to a word is punctuation.
        ['Позвонить!', { title: 'Позвонить!' }],
        // Words that merely contain a keyword.
        ['Завтрак с командой', { title: 'Завтрак с командой' }],
        ['Buy sun cream', { title: 'Buy sun cream' }],
        ['Satellite launch', { title: 'Satellite launch' }],
        // Not a real date or time: left as typed.
        ['Отчёт 31.02', { title: 'Отчёт 31.02' }],
        ['Встреча в 25:00', { title: 'Встреча в 25:00' }],
        // A range that runs backwards.
        ['Смена 22:00-06:00', { title: 'Смена 22:00-06:00' }],
        // #tags are the task's own syntax and stay put.
        ['Купить молоко #дом завтра', { title: 'Купить молоко #дом', dueDate: '2026-09-24' }],
    ])('%s', (text, want) => check(text, want));

    it('keeps a second date as words, where it can be seen not to count', () => {
        check('Перенести с завтра на пятницу', {
            title: 'Перенести с на пятницу',
            dueDate: '2026-09-24',
            pieces: ['завтра'],
        });
    });
});

describe('quickParse — chips taken away', () => {
    it('leaves an ignored piece in the title as words', () => {
        const got = quickParse(
            'Купить билеты завтра',
            TODAY,
            new Set([pieceKey('date', 'завтра')])
        );
        expect(got.title).toBe('Купить билеты завтра');
        expect(got.dueDate).toBeUndefined();
        expect(got.pieces).toEqual([]);
    });

    it('does not let part of an ignored piece come back as a chip of its own', () => {
        const got = quickParse('Созвон в 18:00', TODAY, new Set([pieceKey('time', 'в 18:00')]));
        expect(got.title).toBe('Созвон в 18:00');
        expect(got.dueTime).toBeUndefined();
    });

    it('keys a piece by its words, whatever the case or spacing', () => {
        expect(pieceKey('date', 'В  Пятницу')).toBe(pieceKey('date', 'в пятницу'));
    });

    it('reports where each piece was, in order', () => {
        const got = quickParse('Отчёт завтра в 18 !', TODAY);
        expect(got.pieces.map((p) => [p.kind, p.text])).toEqual([
            ['date', 'завтра'],
            ['time', 'в 18'],
            ['priority', '!'],
        ]);
    });
});
