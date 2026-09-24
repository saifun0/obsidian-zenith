import { addDays } from '../../../core/calendarDates';
import type { JournalTracker } from '../../../core/journalConfig';
import type { ContentItem } from '../../../store/contentSlice';
import type { JournalEntry } from '../../../store/journalSlice';
import type { Task } from '../../../store/taskSlice';
import { readingsOf } from '../../content/services/readings';
import { fastsByDate, type FastKind } from '../../prayer/fasting';
import { PRAYERS } from '../../prayer/prayerConfig';
import { readPrayerDay } from '../../prayer/prayerStats';
import { dayState } from './habitMonth';
import type { SummarySection } from './reviewPeriods';

/**
 * What a stretch of days added up to, section by section — the numbers under
 * a `zenith-summary` block, a frozen snapshot and the year in review.
 *
 * A fixed set of sections rather than a query language: each is one question
 * the plugin already knows how to answer about a day, asked of every day in
 * the range. Days after today are left out of every count — a week under way
 * is reported as far as it has got, never as a week of misses.
 */

export interface SummaryData {
    tasks: ReadonlyArray<Task>;
    entries: ReadonlyArray<JournalEntry>;
    trackers: ReadonlyArray<JournalTracker>;
    content: ReadonlyArray<ContentItem>;
}

export interface TasksSummary {
    done: number;
    cancelled: number;
    /** Due in the range and still open. */
    open: number;
    /** Tags of the tasks done, most used first. */
    tags: Array<{ tag: string; count: number }>;
}

export interface HabitLine {
    id: string;
    name: string;
    /** Days the goal was met. */
    kept: number;
    /** Days that could have counted: the range up to today, rest days aside. */
    days: number;
    /** Longest unbroken run of kept days inside the range. */
    bestRun: number;
}

export interface ContentSummary {
    finished: Array<{ title: string; type: string; filePath: string }>;
    started: number;
}

export interface PrayerSummary {
    ontime: number;
    late: number;
    missed: number;
    /** Days with any prayer recorded. */
    days: number;
}

export interface WordsSummary {
    total: number;
    /** Days something was written. */
    days: number;
}

export interface Summary {
    start: string;
    end: string;
    /** Days counted: the range, cut at today. */
    days: number;
    tasks?: TasksSummary;
    habits?: HabitLine[];
    content?: ContentSummary;
    prayer?: PrayerSummary;
    fasting?: Partial<Record<FastKind, number>>;
    words?: WordsSummary;
}

/** Every date from `start` to `end`, both included. */
export function datesIn(start: string, end: string): string[] {
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
}

const within = (date: string | undefined, start: string, end: string): date is string =>
    !!date && date >= start && date <= end;

export function summarize(
    data: SummaryData,
    start: string,
    end: string,
    today: string,
    sections: readonly SummarySection[]
): Summary {
    const last = end < today ? end : today;
    const days = last >= start ? datesIn(start, last) : [];
    const byDate = new Map(data.entries.map((e) => [e.date, e]));
    const out: Summary = { start, end, days: days.length };
    const want = new Set(sections);

    if (want.has('tasks')) {
        const tags = new Map<string, number>();
        let done = 0;
        let cancelled = 0;
        let open = 0;
        for (const task of data.tasks) {
            if (task.status === 'done' && within(task.doneDate, start, last)) {
                done += 1;
                for (const tag of task.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
            } else if (task.status === 'cancelled' && within(task.cancelledDate, start, last)) {
                cancelled += 1;
            } else if (
                task.status !== 'done' &&
                task.status !== 'cancelled' &&
                within(task.dueDate, start, end)
            ) {
                open += 1;
            }
        }
        out.tasks = {
            done,
            cancelled,
            open,
            tags: [...tags]
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
                .slice(0, 5),
        };
    }

    if (want.has('habits')) {
        out.habits = data.trackers.map((tracker) => {
            let kept = 0;
            let counted = 0;
            let run = 0;
            let bestRun = 0;
            for (const date of days) {
                const state = dayState(tracker, byDate.get(date), date, today);
                if (state === 'rest') continue;
                counted += 1;
                if (state === 'done') {
                    kept += 1;
                    run += 1;
                    bestRun = Math.max(bestRun, run);
                } else {
                    run = 0;
                }
            }
            return { id: tracker.id, name: tracker.label, kept, days: counted, bestRun };
        });
    }

    if (want.has('content')) {
        const finished: ContentSummary['finished'] = [];
        let started = 0;
        for (const item of data.content) {
            for (const reading of readingsOf(item)) {
                if (within(reading.end, start, last)) {
                    finished.push({ title: item.title, type: item.type, filePath: item.filePath });
                }
                if (within(reading.start, start, last)) started += 1;
            }
        }
        out.content = { finished, started };
    }

    if (want.has('prayer')) {
        const prayer: PrayerSummary = { ontime: 0, late: 0, missed: 0, days: 0 };
        for (const date of days) {
            const entry = byDate.get(date);
            if (!entry) continue;
            const day = readPrayerDay(entry, date);
            let any = false;
            for (const id of PRAYERS) {
                const status = day.statuses[id];
                if (!status) continue;
                any = true;
                prayer[status] += 1;
            }
            if (any) prayer.days += 1;
        }
        out.prayer = prayer;
    }

    if (want.has('fasting')) {
        const fasting: Partial<Record<FastKind, number>> = {};
        for (const [date, kind] of fastsByDate([...data.entries])) {
            if (within(date, start, last)) fasting[kind] = (fasting[kind] ?? 0) + 1;
        }
        out.fasting = fasting;
    }

    if (want.has('words')) {
        let total = 0;
        let written = 0;
        for (const date of days) {
            const words = byDate.get(date)?.words ?? 0;
            total += words;
            if (words > 0) written += 1;
        }
        out.words = { total, days: written };
    }

    return out;
}

/** Whether a section has anything to say — an empty one is left out of the block. */
export function sectionHasData(summary: Summary, section: SummarySection): boolean {
    switch (section) {
        case 'tasks':
            return (
                !!summary.tasks &&
                summary.tasks.done + summary.tasks.cancelled + summary.tasks.open > 0
            );
        case 'habits':
            return !!summary.habits && summary.habits.length > 0;
        case 'content':
            return (
                !!summary.content && summary.content.finished.length + summary.content.started > 0
            );
        case 'prayer':
            return !!summary.prayer && summary.prayer.days > 0;
        case 'fasting':
            return !!summary.fasting && Object.keys(summary.fasting).length > 0;
        case 'words':
            return !!summary.words && summary.words.days > 0;
    }
}

/** The strings a snapshot needs, resolved by the caller in the user's language. */
export interface SnapshotLabels {
    heading: string;
    section: (section: SummarySection) => string;
    tasks: (t: TasksSummary) => string;
    habit: (h: HabitLine) => string;
    content: (c: ContentSummary) => string;
    contentType: (typeId: string) => string;
    prayer: (p: PrayerSummary) => string;
    fast: (kind: FastKind, count: number) => string;
    words: (w: WordsSummary) => string;
    frozen: string;
}

/**
 * The summary as plain Markdown — what "Freeze" writes under the block, so the
 * numbers stay in the note as they were, readable without the plugin.
 */
export function summaryMarkdown(
    summary: Summary,
    sections: readonly SummarySection[],
    labels: SnapshotLabels
): string {
    const lines: string[] = [`> [!summary] ${labels.heading}`];
    for (const section of sections) {
        if (!sectionHasData(summary, section)) continue;
        lines.push('>', `> **${labels.section(section)}**`);
        switch (section) {
            case 'tasks':
                lines.push(`> - ${labels.tasks(summary.tasks as TasksSummary)}`);
                break;
            case 'habits':
                for (const h of summary.habits ?? []) lines.push(`> - ${labels.habit(h)}`);
                break;
            case 'content': {
                const content = summary.content as ContentSummary;
                lines.push(`> - ${labels.content(content)}`);
                for (const item of content.finished) {
                    const name = item.filePath.replace(/\.md$/i, '');
                    lines.push(`> - [[${name}|${item.title}]] · ${labels.contentType(item.type)}`);
                }
                break;
            }
            case 'prayer':
                lines.push(`> - ${labels.prayer(summary.prayer as PrayerSummary)}`);
                break;
            case 'fasting':
                for (const [kind, count] of Object.entries(summary.fasting ?? {})) {
                    lines.push(`> - ${labels.fast(kind as FastKind, count)}`);
                }
                break;
            case 'words':
                lines.push(`> - ${labels.words(summary.words as WordsSummary)}`);
                break;
        }
    }
    lines.push('>', `> *${labels.frozen}*`);
    return lines.join('\n');
}
