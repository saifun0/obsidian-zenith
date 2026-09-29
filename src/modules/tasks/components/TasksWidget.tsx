import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import type { SubTask, Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useFeature } from '../../../core/useFeature';
import { countSubtasks } from '../services/taskStats';
import { TaskWriter } from '../services/taskWriter';
import { getTodayString } from '../../../core/dateUtils';
import { TaskStatusControl } from './taskStatusUi';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { useTranslation } from '../../../core/i18n';
import { translateNow } from '../../../core/i18n';
import {
    FIGURE_GAP,
    METRICS,
    NOMINAL_H,
    daysUntil,
    fitFigures,
    planWidget,
    splitTasks,
    type Line,
} from '../services/widgetLayout';

/**
 * The tasks card: what is burning, what is running, what is next.
 *
 * Hierarchy is carried by type size and rhythm rather than by boxes — there is
 * no badge, no pill and no section chrome inside the card. The first line
 * answers the question ("2 overdue", "3 active"); the rest is the list, and
 * along the bottom three figures: active, overdue, closed today.
 *
 * `sm` is the three most urgent tasks. `md` and `lg` are labelled groups over
 * the figures, `md` stopping at five tasks. Subtasks stay folded behind their
 * tally, which opens them one task at a time.
 */

export const TasksWidget: FC<DashboardWidgetProps> = ({ size = 'lg' }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const stored = useZenithStore((s) => s.tasks);
    // With subtasks switched off the card is planned as if there were none:
    // no tally, no rows to open, nothing in the summary strip.
    const subtasksOn = useFeature('tasks.subtasks');
    const tasks = useMemo(
        () => (subtasksOn ? stored : stored.map((task) => ({ ...task, subtasks: [] }))),
        [stored, subtasksOn]
    );
    const today = getTodayString();
    const m = METRICS[size];

    /**
     * The one task whose subtasks are open. One at a time: the row budget is
     * what makes the card fit, and two expansions would spend it all on one task.
     */
    const [expanded, setExpanded] = useState<string | null>(null);

    const rootRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ h: 0, w: 0 });

    // The card is sized by the grid, whose row height the user can change, so
    // what fits is measured rather than assumed.
    //
    // It is the card's body that gets measured, not this widget: the body is a
    // flex child of a cell the grid has already sized, so its height is settled
    // before the list is planned and cannot move in response to what the plan
    // decides to draw. Measuring our own box would risk exactly that loop.
    useEffect(() => {
        const host = rootRef.current?.parentElement;
        if (!host || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            const { height: h, width: w } = entry.contentRect;
            setBox((prev) =>
                Math.abs(prev.h - h) > 1 || Math.abs(prev.w - w) > 1 ? { h, w } : prev
            );
        });
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    const available = box.h > 60 ? box.h : NOMINAL_H[size];

    const openTasks = useCallback(() => {
        void plugin.moduleManager.get('tasks')?.activateView();
    }, [plugin]);

    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);

    const changeStatus = async (task: Task, status: TaskStatus) => {
        const prev = task.status;
        setTaskStatus(task.id, status);
        if (!task.filePath) return;
        try {
            const ok = await new TaskWriter(app).setStatusInFile(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
            if (!ok) {
                setTaskStatus(task.id, prev);
                new Notice(translateNow('notice.taskUpdateFailed'));
            } else if (status === 'done' && task.recurrence) {
                void plugin.dataService.reloadTasks();
            }
        } catch (err) {
            // Said out loud, like the `!ok` branch above. A thrown write was
            // the quieter of the two failures, which is backwards: the
            // checkbox flipped back with no word about why.
            console.error('Zenith: failed to update the task:', err);
            setTaskStatus(task.id, prev);
            new Notice(translateNow('notice.taskUpdateFailed'));
        }
    };

    const changeSubStatus = async (filePath: string, sub: SubTask, status: TaskStatus) => {
        try {
            if (
                await new TaskWriter(app).setStatusInFile(
                    filePath,
                    sub.lineNumber,
                    status,
                    sub.title
                )
            ) {
                void plugin.dataService.reloadTasks();
            }
        } catch (err) {
            console.error('Zenith: failed to set subtask status:', err);
        }
    };

    const split = useMemo(() => splitTasks(tasks, today), [tasks, today]);

    /** `sm` has no room for the strip of figures; the others end on it. */
    const showStats = size !== 'sm' && split.active.length > 0;

    // ── Layout ───────────────────────────────────────

    /**
     * What the card's own furniture actually costs.
     *
     * The heading is a 34px number beside 22px words sharing a baseline, and
     * the bottom strip is a rule, a week and a row of figures — both taller
     * than the constants that stood in for them, and both dependent on the
     * theme's font and the language. The difference came out of the list's
     * budget, and what it cost was the strip: pinned to the bottom, pushed
     * past it, clipped away.
     *
     * Safe to measure because neither height answers to the plan. See
     * `Chrome` in `widgetLayout`.
     */
    const headRef = useRef<HTMLDivElement>(null);
    /** Also the element the figure-fitting measures its width on, below. */
    const statsRef = useRef<HTMLDivElement>(null);
    const [chrome, setChrome] = useState({ head: 0, stats: 0 });

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return;
        const read = () => {
            const head = headRef.current?.offsetHeight ?? 0;
            const stats = statsRef.current?.offsetHeight ?? 0;
            setChrome((prev) =>
                Math.abs(prev.head - head) > 1 || Math.abs(prev.stats - stats) > 1
                    ? { head, stats }
                    : prev
            );
        };
        const ro = new ResizeObserver(read);
        if (headRef.current) ro.observe(headRef.current);
        if (statsRef.current) ro.observe(statsRef.current);
        read();
        return () => ro.disconnect();
        // Re-attached when the strip appears or disappears, since the element
        // it observes is mounted and unmounted with it.
    }, [showStats]);

    const layout = useMemo(
        () => planWidget({ split, size, available, expanded, chrome }),
        [split, size, available, expanded, chrome]
    );

    // ── Rendering ────────────────────────────────────

    const dueOf = (task: Task): { text: string; tone: string } | null => {
        if (!task.dueDate) return null;
        const date = new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(t.locale, {
            month: 'short',
            day: 'numeric',
        });
        if (task.status === 'done' || task.status === 'cancelled')
            return { text: date, tone: 'past' };
        const d = daysUntil(task.dueDate, today);
        if (d < 0)
            return { text: t('tasks.widget.due.overdueDays', { count: -d }), tone: 'overdue' };
        if (d === 0) return { text: t('tasks.widget.due.today'), tone: 'today' };
        if (d === 1) return { text: t('tasks.widget.due.tomorrow'), tone: 'soon' };
        return { text: date, tone: 'later' };
    };

    /**
     * The quiet right-hand note: what the task is made of — on the wide preset
     * its tags and a repeat, and everywhere the subtask tally, which is also
     * the control that opens them.
     */
    const infoOf = (task: Task): { text: string; toggles: boolean } | null => {
        const parts: string[] = [];
        if (m.tags) {
            for (const tag of task.tags.slice(0, 2)) parts.push(`#${tag}`);
            if (task.recurrence) parts.push('↻');
        }
        const { done, total } = countSubtasks(task.subtasks);
        const toggles = total > 0;
        if (total > 0) parts.push(`${done}/${total}${expanded === task.id ? ' ⌄' : ' ›'}`);
        if (parts.length === 0) return null;
        return { text: parts.join(' · '), toggles };
    };

    const renderLine = (line: Line): React.ReactNode => {
        if (line.kind === 'more') {
            return (
                <div
                    key={line.key}
                    className="zenith-tw__row zenith-tw__row--more"
                    style={{ height: line.height }}
                >
                    <button
                        type="button"
                        className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-btn--flush zenith-tw__link"
                        onClick={openTasks}
                    >
                        {t('tasks.widget.moreInList', { count: line.count })}
                    </button>
                </div>
            );
        }
        if (line.kind === 'sub') {
            const { sub, task } = line;
            return (
                <div
                    key={line.key}
                    className="zenith-tw__row zenith-tw__row--sub"
                    style={{ height: line.height }}
                >
                    <TaskStatusControl
                        status={sub.status}
                        size={13}
                        onChange={(s) => void changeSubStatus(task.filePath, sub, s)}
                    />
                    <span
                        className={`zenith-tw__title is-sub ${sub.status === 'done' || sub.status === 'cancelled' ? 'is-struck' : ''}`}
                        onClick={openTasks}
                        role="button"
                    >
                        {sub.title}
                    </span>
                </div>
            );
        }

        const { task } = line;
        const due = dueOf(task);
        const info = infoOf(task);
        const struck = task.status === 'done' || task.status === 'cancelled';
        return (
            <div key={line.key} className="zenith-tw__row" style={{ height: line.height }}>
                <TaskStatusControl
                    status={task.status}
                    size={m.box}
                    onChange={(s) => void changeStatus(task, s)}
                />
                <span
                    className={`zenith-tw__title ${struck ? 'is-struck' : ''}`}
                    onClick={openTasks}
                    role="button"
                    title={task.title}
                >
                    {task.title}
                </span>
                {info && (
                    <span
                        className={`zenith-tw__info ${info.toggles ? 'is-toggle' : ''} ${expanded === task.id ? 'is-open' : ''}`}
                        onClick={
                            info.toggles
                                ? () => setExpanded((v) => (v === task.id ? null : task.id))
                                : undefined
                        }
                        role={info.toggles ? 'button' : undefined}
                    >
                        {info.text}
                    </span>
                )}
                {due && <span className={`zenith-tw__due is-${due.tone}`}>{due.text}</span>}
            </div>
        );
    };

    /**
     * The heading is a sentence built from the data, and it always leads with a
     * number.
     *
     * Which number is the whole point: what is late, else what is due, else what
     * is on you. It used to announce "Nothing burning" in the largest type on
     * the card — a negation, taking the most prominent line to report the
     * absence of news. What the day produced is a number too, but it belongs to
     * the summary strip below rather than here; saying it in both places is how
     * the old "in progress" badge earned its removal.
     */
    const heading: Array<{ text: string; cls: string }> = [];
    const say = (text: string, cls: string) => heading.push({ text, cls });
    if (tasks.length === 0) {
        say(t('tasks.widget.noTasks'), 'is-strong is-dim');
    } else if (split.overdue > 0) {
        say(String(split.overdue), 'is-big is-danger');
        say(t('tasks.widget.overdue'), 'is-strong is-danger');
        if (split.dueToday > 0) {
            say('·', 'is-sep');
            say(t('tasks.widget.todayN', { count: split.dueToday }), 'is-mid');
        }
        say('·', 'is-sep');
        say(t('tasks.widget.activeN', { count: split.active.length }), 'is-faint');
    } else if (split.dueToday > 0) {
        say(String(split.dueToday), 'is-big is-danger');
        say(t('tasks.widget.dueToday'), 'is-strong is-danger');
        say('·', 'is-sep');
        say(t('tasks.widget.activeN', { count: split.active.length }), 'is-faint');
    } else if (split.active.length > 0) {
        say(String(split.active.length), 'is-big');
        say(t('tasks.widget.active'), 'is-strong');
        if (split.inProgress > 0 && size !== 'sm') {
            say('·', 'is-sep');
            say(t('tasks.widget.doingN', { count: split.inProgress }), 'is-faint');
        }
    } else {
        // Nothing active and nothing closed today — the heading is the whole
        // report, so the list below adds no line of its own.
        say(t('tasks.widget.noActive'), 'is-strong is-dim');
    }

    // Where the strip of figures is, it carries the link; the heading doesn't repeat it.
    const headLink = showStats
        ? ''
        : size === 'sm'
          ? t('tasks.widget.allShort')
          : t('tasks.widget.allTasks');

    /**
     * Three figures, always the same three: what is on you, what is late, and
     * what the day closed. A nought is a number too — the strip keeps its shape.
     */
    const figures = useMemo(() => {
        if (!showStats) return [];
        return [
            { key: 'active', value: String(split.active.length), cls: '' },
            { key: 'overdue', value: String(split.overdue), cls: split.overdue > 0 ? 'is-danger' : 'is-faint' },
            { key: 'done', value: String(split.doneToday), cls: split.doneToday > 0 ? 'is-done' : 'is-faint' },
        ];
    }, [showStats, split]);

    /**
     * The bottom strip at a width the design didn't draw: each figure is
     * measured as drawn, and the ones there is no room for are dropped rather
     * than clipped in place.
     */
    const figuresRef = useRef<HTMLDivElement>(null);
    const figureWidths = useRef(new Map<string, number>());
    const [shownFigures, setShownFigures] = useState<string[] | null>(null);

    const figureKeys = useMemo(() => [...figures.map((f) => f.key), 'link'], [figures]);

    useLayoutEffect(() => {
        if (!showStats) {
            if (shownFigures !== null) setShownFigures(null);
            return;
        }
        const stats = statsRef.current;
        const figs = figuresRef.current;
        if (!stats || !figs) return;

        // Widths are per label and per language, and they don't change when a
        // neighbour is dropped, so measuring once each is enough to settle.
        for (const child of Array.from(figs.children) as HTMLElement[]) {
            const key = child.dataset.figure;
            if (key) figureWidths.current.set(`${t.locale}:${key}`, child.offsetWidth);
        }
        const widths: Record<string, number> = {};
        for (const key of figureKeys) {
            const w = figureWidths.current.get(`${t.locale}:${key}`);
            if (w !== undefined) widths[key] = w;
        }

        const kept = fitFigures(figureKeys, widths, stats.clientWidth);
        setShownFigures((prev) =>
            prev && prev.length === kept.length && prev.every((k, i) => k === kept[i]) ? prev : kept
        );
    }, [showStats, figureKeys, shownFigures, t.locale, box.w]);

    const visible = (key: string): boolean => shownFigures === null || shownFigures.includes(key);

    return (
        <div className={`zenith-tw zenith-tw--${size}`} ref={rootRef}>
            <div className="zenith-tw__head" ref={headRef} style={{ minHeight: m.head }}>
                <div className="zenith-tw__head-line">
                    {heading.map((part, i) => (
                        <span key={i} className={`zenith-tw__say ${part.cls}`}>
                            {part.text}
                        </span>
                    ))}
                </div>
                {headLink && (
                    <button
                        type="button"
                        className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-btn--flush zenith-tw__link"
                        onClick={openTasks}
                    >
                        {headLink}
                    </button>
                )}
            </div>

            {layout.groups ? (
                <div className="zenith-tw__groups">
                    {layout.groups.map((g) => (
                        <div key={g.label} className="zenith-tw__group" style={{ gap: layout.gap }}>
                            <div className="zenith-tw__group-head">
                                <span className="zenith-tw__group-label">
                                    {t(`tasks.widget.group.${g.label}`)}
                                </span>
                                <span className="zenith-tw__group-count">{g.count}</span>
                            </div>
                            {g.lines.map(renderLine)}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="zenith-tw__body" style={{ gap: layout.gap }}>
                    {layout.lines.map(renderLine)}
                </div>
            )}

            {layout.hidden > 0 && (
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-btn--flush zenith-tw__link zenith-tw__foot"
                    onClick={openTasks}
                >
                    {t('tasks.widget.moreN', { count: layout.hidden })}
                </button>
            )}

            {showStats && (
                <div className="zenith-tw__stats" ref={statsRef}>
                    <div
                        className="zenith-tw__figures"
                        ref={figuresRef}
                        style={{ gap: FIGURE_GAP }}
                    >
                        {figures
                            .filter((f) => visible(f.key))
                            .map((f) => (
                                <div key={f.key} className="zenith-tw__figure" data-figure={f.key}>
                                    <span className={`zenith-tw__figure-num ${f.cls}`}>
                                        {f.value}
                                    </span>
                                    <span className="zenith-tw__figure-lab">
                                        {t(`tasks.widget.stat.${f.key}`)}
                                    </span>
                                </div>
                            ))}
                        <button
                            type="button"
                            className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-btn--flush zenith-tw__link"
                            data-figure="link"
                            onClick={openTasks}
                        >
                            {t('tasks.widget.allTasks')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
