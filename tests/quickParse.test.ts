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
        ['Отпуск 19 октября', { title: 'Отпуск', dueDate: '2026-10-19', pieces: ['19 октября'] }],
        ['Отпуск 19 окт', { title: 'Отпуск', dueDate: '2026-10-19' }],
        ['Паспорт 15 марта', { title: 'Паспорт', dueDate: '2027-03-15' }],
        ['Свадьба 12 июня 2028 года', { title: 'Свадьба', dueDate: '2028-06-12' }],
        ['Продлить через год', { title: 'Продлить', dueDate: '2027-09-23', pieces: ['через год'] }],
        ['через 3 дня позвонить', { title: 'позвонить', dueDate: '2026-09-26' }],
        ['Отчёт через неделю', { title: 'Отчёт', dueDate: '2026-09-30' }],
        ['ТО через 2 месяца', { title: 'ТО', dueDate: '2026-11-23' }],
        ['Анализы через полгода', { title: 'Анализы', dueDate: '2027-03-23' }],
        [
            'Созвон через неделю в 18',
            { title: 'Созвон', dueDate: '2026-09-30', dueTime: '18:00' },
        ],
    ])('dates: %s', (text, want) => check(text, want));

    it('takes a month on from the 31st to the next month’s last day', () => {
        expect(quickParse('через месяц', '2027-01-31').dueDate).toBe('2027-02-28');
        expect(quickParse('через год', '2028-02-29').dueDate).toBe('2029-02-28');
    });

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
        ['Trip Oct 19', { title: 'Trip', dueDate: '2026-10-19' }],
        ['Trip on October 19th, 2027', { title: 'Trip', dueDate: '2027-10-19' }],
        ['Trip 19 October', { title: 'Trip', dueDate: '2026-10-19' }],
        ['Renew in a year', { title: 'Renew', dueDate: '2027-09-23' }],
        ['Call back in 3 days', { title: 'Call back', dueDate: '2026-09-26' }],
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

describe('quickParse — Chinese', () => {
    it.each<[string, Expect]>([
        // The placeholder the Chinese interface shows.
        [
            '明天 18:00 给妈妈打电话 !',
            { title: '给妈妈打电话', dueDate: '2026-09-24', dueTime: '18:00', priority: 'high' },
        ],
        // No spaces at all, and the pieces anywhere in the phrase.
        [
            '明天下午6点给妈妈打电话',
            { title: '给妈妈打电话', dueDate: '2026-09-24', dueTime: '18:00', pieces: ['明天', '下午6点'] },
        ],
        ['给妈妈明天打电话', { title: '给妈妈打电话', dueDate: '2026-09-24' }],
        ['明天18:00打电话', { title: '打电话', dueDate: '2026-09-24', dueTime: '18:00' }],
        ['后天交报告', { title: '交报告', dueDate: '2026-09-25' }],
        ['大后天交报告', { title: '交报告', dueDate: '2026-09-26' }],
        ['周五开会', { title: '开会', dueDate: '2026-09-25' }],
        // Named on that very day, it is next week's, as in Russian.
        ['星期三开会', { title: '开会', dueDate: '2026-09-30' }],
        ['下周五开会', { title: '开会', dueDate: '2026-10-02' }],
        ['10月15号办护照', { title: '办护照', dueDate: '2026-10-15' }],
        // Already past this year, so next year's.
        ['9月12日交报告', { title: '交报告', dueDate: '2027-09-12' }],
        ['3天后给妈妈打电话', { title: '给妈妈打电话', dueDate: '2026-09-26' }],
        ['两周后交报告', { title: '交报告', dueDate: '2026-10-07' }],
        ['一年后体检', { title: '体检', dueDate: '2027-09-23' }],
        ['早上7点半跑步', { title: '跑步', dueDate: '2026-09-23', dueTime: '07:30', impliedDate: true }],
        ['晚上8点15分看书', { title: '看书', dueDate: '2026-09-23', dueTime: '20:15', impliedDate: true }],
    ])('dates and times: %s', (text, want) => check(text, want));

    it.each<[string, Expect]>([
        ['每天喝水', { title: '喝水', recurrence: 'every day', dueDate: '2026-09-23', impliedDate: true }],
        ['每月交房租', { title: '交房租', recurrence: 'every month', dueDate: '2026-09-23', impliedDate: true }],
        ['每2周汇报', { title: '汇报', recurrence: 'every 2 weeks', dueDate: '2026-09-23', impliedDate: true }],
        ['每周五打扫', { title: '打扫', recurrence: 'every week', dueDate: '2026-09-25' }],
    ])('repeats: %s', (text, want) => check(text, want));

    it.each<[string, Expect]>([
        // Punctuation, not a mark: it touches the word.
        ['打电话！', { title: '打电话！' }],
        ['打电话 ！', { title: '打电话', priority: 'high' }],
        ['打电话 ！！', { title: '打电话', priority: 'urgent' }],
        // A bare number is still never a time, and a clock time ends where its digits do.
        ['买2个面包', { title: '买2个面包' }],
        ['编号12:345', { title: '编号12:345' }],
    ])('marks and words: %s', (text, want) => check(text, want));
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
        ['Отчёт 31 февраля', { title: 'Отчёт 31 февраля' }],
        // A month's short name inside a word, and a number before a word that is not a month.
        ['Купить 3 марки', { title: 'Купить 3 марки' }],
        ['Read 3 decks', { title: 'Read 3 decks' }],
        ['через пару дней', { title: 'через пару дней' }],
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
