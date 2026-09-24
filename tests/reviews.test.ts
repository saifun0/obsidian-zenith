import { describe, it, expect } from 'vitest';
import {
    DEFAULT_REVIEW_NOTES,
    formatPeriodName,
    normalizeReviewNotes,
    parseSummaryParams,
    periodRange,
    reviewNotePath,
    SUMMARY_SECTIONS,
} from '../src/modules/journal/services/reviewPeriods';
import {
    summarize,
    summaryMarkdown,
    type SnapshotLabels,
} from '../src/modules/journal/services/summary';
import {
    defaultReviewYear,
    moodByMonth,
    reviewAvailable,
    yearCardSvg,
    yearReview,
} from '../src/modules/journal/services/yearReview';
import {
    insertAfterLine,
    summaryBlock,
    withReviewProps,
} from '../src/modules/journal/services/reviewNotes';
import type { JournalTracker } from '../src/core/journalConfig';
import type { JournalEntry } from '../src/store/journalSlice';
import type { Task } from '../src/store/taskSlice';
import type { ContentItem } from '../src/store/contentSlice';

const TODAY = '2026-09-24'; // a Thursday, ISO week 39

describe('periodRange', () => {
    it('finds each period around a date', () => {
        expect(periodRange('week', TODAY, 'mon')).toMatchObject({
            start: '2026-09-21',
            end: '2026-09-27',
        });
        expect(periodRange('week', TODAY, 'sun')).toMatchObject({
            start: '2026-09-20',
            end: '2026-09-26',
        });
        expect(periodRange('month', TODAY, 'mon')).toMatchObject({
            start: '2026-09-01',
            end: '2026-09-30',
        });
        expect(periodRange('quarter', TODAY, 'mon')).toMatchObject({
            start: '2026-07-01',
            end: '2026-09-30',
        });
        expect(periodRange('year', TODAY, 'mon')).toMatchObject({
            start: '2026-01-01',
            end: '2026-12-31',
        });
    });
});

describe('formatPeriodName', () => {
    const name = (
        period: 'week' | 'month' | 'quarter' | 'year',
        date: string,
        weekStart: 'mon' | 'sun' = 'mon'
    ) =>
        formatPeriodName(DEFAULT_REVIEW_NOTES[period].format, periodRange(period, date, weekStart));

    it('names each period by the default patterns', () => {
        expect(name('week', TODAY)).toBe('2026-W39');
        expect(name('month', TODAY)).toBe('2026-09');
        expect(name('quarter', TODAY)).toBe('2026-Q3');
        expect(name('year', TODAY)).toBe('2026');
    });

    it('gives a week across the new year to the year its Thursday is in', () => {
        // 2026 began on a Thursday, so it has a 53rd week, running into 2027.
        expect(name('week', '2027-01-01')).toBe('2026-W53');
        expect(name('week', '2027-01-04')).toBe('2027-W01');
    });

    it('numbers a Sunday week by the ISO week it mostly is', () => {
        expect(name('week', '2026-09-20', 'sun')).toBe('2026-W39');
    });

    it('keeps literals literal, and the daily tokens working', () => {
        const range = periodRange('month', TODAY, 'mon');
        expect(formatPeriodName('[Q is not a token here] MMMM YYYY', range)).toBe(
            'Q is not a token here September 2026'
        );
    });
});

describe('review notes', () => {
    it('put a note in its own folder, or the journal’s', () => {
        const notes = normalizeReviewNotes({ week: { folder: 'Reviews/Weekly' } });
        expect(reviewNotePath(notes, 'Journal', periodRange('week', TODAY, 'mon'))).toBe(
            'Reviews/Weekly/2026-W39.md'
        );
        expect(reviewNotePath(notes, 'Journal', periodRange('year', TODAY, 'mon'))).toBe(
            'Journal/2026.md'
        );
    });

    it('repair a broken setting to the defaults', () => {
        expect(normalizeReviewNotes('nonsense')).toEqual(DEFAULT_REVIEW_NOTES);
        expect(normalizeReviewNotes({ month: { format: '  ' } }).month.format).toBe('YYYY-MM');
    });
});

describe('parseSummaryParams', () => {
    it('reads one line or several, with = or :', () => {
        expect(parseSummaryParams('period=month date=2026-08-01')).toEqual({
            period: 'month',
            date: '2026-08-01',
        });
        expect(parseSummaryParams('period: year\nshow: tasks, words,  words')).toEqual({
            period: 'year',
            show: ['tasks', 'words'],
        });
        expect(parseSummaryParams('show=habits, prayer period=month')).toEqual({
            show: ['habits', 'prayer'],
            period: 'month',
        });
        expect(parseSummaryParams('show=tasks,words,nonsense')).toEqual({
            show: ['tasks', 'words'],
        });
    });

    it('ignores what it does not know', () => {
        expect(parseSummaryParams('period=decade date=yesterday colour=red')).toEqual({});
    });
});

// ── The numbers ──────────────────────────────────────

const run: JournalTracker = {
    id: 'run',
    label: 'Run',
    icon: 'footprints',
    color: '#0a0',
    kind: 'check',
};
const mood: JournalTracker = {
    id: 'mood',
    label: 'Mood',
    icon: 'smile',
    color: '#fa0',
    kind: 'scale',
};

function entry(date: string, over: Partial<JournalEntry> = {}): JournalEntry {
    return {
        date,
        filePath: `Journal/${date}.md`,
        values: {},
        texts: {},
        tags: [],
        body: 'x',
        words: 0,
        mtime: 0,
        ...over,
    };
}

const ENTRIES = [
    entry('2026-09-21', {
        values: { run: true, mood: 4 },
        words: 120,
        texts: { fajr: 'ontime', dhuhr: 'late', fast: 'nafl' },
    }),
    entry('2026-09-22', { values: { run: true, mood: 2 }, words: 0, texts: { fajr: 'missed' } }),
    entry('2026-09-23', { values: { mood: 3 }, words: 40 }),
    entry('2026-09-24', { values: { run: true } }),
    // After today: never counted.
    entry('2026-09-25', { values: { run: true }, words: 999 }),
];

const task = (over: Partial<Task>): Task =>
    ({
        id: over.title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'T.md',
        lineNumber: 0,
        createdAt: '',
        ...over,
    }) as Task;

const TASKS = [
    task({ title: 'a', status: 'done', doneDate: '2026-09-22', tags: ['#work', '#home'] }),
    task({ title: 'b', status: 'done', doneDate: '2026-09-23', tags: ['#work'] }),
    task({ title: 'old', status: 'done', doneDate: '2026-09-01', tags: ['#work'] }),
    task({ title: 'c', status: 'cancelled', cancelledDate: '2026-09-21' }),
    task({ title: 'd', dueDate: '2026-09-26' }),
];

const CONTENT = [
    {
        id: 'x',
        title: 'Dune',
        type: 'book',
        status: 'completed',
        rating: 0,
        tags: [],
        filePath: 'Library/Dune.md',
        started: '2026-09-01',
        finished: '2026-09-23',
    },
    {
        id: 'y',
        title: 'Solaris',
        type: 'book',
        status: 'in-progress',
        rating: 0,
        tags: [],
        filePath: 'Library/Solaris.md',
        started: '2026-09-24',
    },
] as ContentItem[];

const DATA = { tasks: TASKS, entries: ENTRIES, trackers: [run, mood], content: CONTENT };

describe('summarize', () => {
    const week = summarize(DATA, '2026-09-21', '2026-09-27', TODAY, SUMMARY_SECTIONS);

    it('counts only up to today', () => {
        expect(week.days).toBe(4);
        expect(week.words).toEqual({ total: 160, days: 2 });
    });

    it('counts tasks done, given up and still due, and the tags done', () => {
        expect(week.tasks).toEqual({
            done: 2,
            cancelled: 1,
            open: 1,
            tags: [
                { tag: '#work', count: 2 },
                { tag: '#home', count: 1 },
            ],
        });
    });

    it('counts each habit’s kept days and its best run', () => {
        expect(week.habits?.find((h) => h.id === 'run')).toMatchObject({
            kept: 3,
            days: 4,
            bestRun: 2,
        });
    });

    it('finds what was finished and started', () => {
        expect(week.content?.finished.map((c) => c.title)).toEqual(['Dune']);
        expect(week.content?.started).toBe(1);
    });

    it('counts prayers and fasts', () => {
        expect(week.prayer).toEqual({ ontime: 1, late: 1, missed: 1, days: 2 });
        expect(week.fasting).toEqual({ nafl: 1 });
    });

    it('leaves out the sections not asked for', () => {
        const only = summarize(DATA, '2026-09-21', '2026-09-27', TODAY, ['words']);
        expect(Object.keys(only).sort()).toEqual(['days', 'end', 'start', 'words']);
    });
});

describe('summaryMarkdown', () => {
    const labels: SnapshotLabels = {
        heading: 'Week 39',
        section: (s) => s,
        tasks: (t) => `${t.done} done`,
        habit: (h) => `${h.name} ${h.kept}/${h.days}`,
        content: (c) => `${c.finished.length} finished`,
        contentType: (id) => id,
        prayer: (p) => `${p.ontime} on time`,
        fast: (kind, n) => `${kind} ${n}`,
        words: (w) => `${w.total} words`,
        frozen: 'Frozen 2026-09-24',
    };

    it('writes a callout that reads without the plugin', () => {
        const week = summarize(DATA, '2026-09-21', '2026-09-27', TODAY, [
            'tasks',
            'content',
            'words',
        ]);
        expect(summaryMarkdown(week, ['tasks', 'content', 'words'], labels)).toBe(
            [
                '> [!summary] Week 39',
                '>',
                '> **tasks**',
                '> - 2 done',
                '>',
                '> **content**',
                '> - 1 finished',
                '> - [[Library/Dune|Dune]] · book',
                '>',
                '> **words**',
                '> - 160 words',
                '>',
                '> *Frozen 2026-09-24*',
            ].join('\n')
        );
    });

    it('leaves out a section with nothing in it', () => {
        const empty = summarize({ ...DATA, tasks: [] }, '2026-09-21', '2026-09-27', TODAY, [
            'tasks',
        ]);
        expect(summaryMarkdown(empty, ['tasks'], labels)).not.toContain('tasks');
    });
});

describe('year in review', () => {
    it('opens in December for this year, and for past years any time', () => {
        expect(reviewAvailable(2026, TODAY)).toBe(false);
        expect(reviewAvailable(2026, '2026-12-01')).toBe(true);
        expect(reviewAvailable(2025, TODAY)).toBe(true);
        expect(defaultReviewYear(TODAY)).toBe(2025);
        expect(defaultReviewYear('2026-12-05')).toBe(2026);
    });

    it('averages the mood by month', () => {
        const months = moodByMonth(ENTRIES, mood, 2026);
        expect(months[8]).toBe(3);
        expect(months[0]).toBeNull();
    });

    it('ranks the habits by their best run', () => {
        const review = yearReview(DATA, 2026, TODAY, ['habits']);
        expect(review.bestRuns.map((h) => [h.id, h.bestRun])).toEqual([['run', 2]]);
        expect(review.mood?.id).toBe('mood');
    });

    it('draws a card that escapes what it is given', () => {
        const svg = yearCardSvg(
            2026,
            'Year <in> review',
            [{ section: 'tasks', value: '312', label: 'tasks & done' }],
            {
                bg: '#fff',
                fg: '#000',
                muted: '#666',
                accent: '#07f',
            }
        );
        expect(svg).toContain('Year &lt;in&gt; review');
        expect(svg).toContain('tasks &amp; done');
        expect(svg.startsWith('<svg')).toBe(true);
    });
});

describe('review note text', () => {
    const range = periodRange('week', TODAY, 'mon');

    it('says what the note is about — never with `date:`, which marks a daily note', () => {
        const body = withReviewProps('## Notes\n', range);
        expect(body).toBe(
            '---\nreview: week\nstart: 2026-09-21\nend: 2026-09-27\n---\n\n## Notes\n'
        );
        expect(body).not.toMatch(/^date:/m);
    });

    it('joins a template’s own frontmatter, and keeps what it set', () => {
        const body = withReviewProps('---\ntags: [review]\nend: 2026-09-28\n---\nBody', range);
        expect(body).toBe(
            '---\nreview: week\nstart: 2026-09-21\ntags: [review]\nend: 2026-09-28\n---\n\nBody'
        );
    });

    it('writes the block with its period, so a renamed note still knows it', () => {
        expect(summaryBlock(range)).toBe('```zenith-summary\nperiod: week\ndate: 2026-09-21\n```');
    });

    it('puts a snapshot under the block and changes nothing else', () => {
        const text = ['# Week', '```zenith-summary', 'period: week', '```', 'After'].join('\n');
        expect(insertAfterLine(text, 3, '> [!summary] Week 39')).toBe(
            [
                '# Week',
                '```zenith-summary',
                'period: week',
                '```',
                '',
                '> [!summary] Week 39',
                'After',
            ].join('\n')
        );
    });
});
