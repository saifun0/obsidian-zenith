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
    STATS_GAP,
    WEEK_CELL,
    WEEK_OVERDUE,
    WEEK_TODAY,
    daysUntil,
    fitFigures,
    isoOf,
    planWidget,
    splitTasks,
    weekWidth,
    type Line,
} from '../services/widgetLayout';

/**
 * The tasks card: what is burning, what is running, what is next.
 *
 * Hierarchy is carried by type size and rhythm rather than by boxes — there is
 * no badge, no pill and no section chrome inside the card, because on three
 * task rows those cost more attention than the rows themselves. The first line
 * answers the question ("2 overdue", "Nothing burning"); a 3px bar under it
 * shows what the day is made of; the rest is the list.
 *
 * Each preset is a different composition, not the same one cropped: `sm` is a
 * flat urgency-ordered list, `md` splits it into two labelled columns, `lg`
 * adds subtasks, group labels and a summary strip along the bottom.
 */

export const TasksWidget: FC<DashboardWidgetProps> = ({ size = 'lg' }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const tasks = useZenithStore((s) => s.tasks);
    const today = getTodayString();
    const m = METRICS[size];

    /**
     * The one task whose subtasks are open, on the presets that don't show them
     * outright. One at a time: the row budget is what makes the card fit, and
     * two expansions would spend it all on one task.
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
        } catch {
            setTaskStatus(task.id, prev);
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

    /** Only the detailed preset has the height for the bottom strip. */
    const showStats = size === 'lg' && split.active.length > 0;

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
     * The quiet right-hand note: what the task is made of.
     *
     * On the detailed preset that means its tags and recurrence; everywhere else
     * only the subtask tally, which doubles as the control that opens them.
     */
    const infoOf = (task: Task): { text: string; toggles: boolean } | null => {
        const parts: string[] = [];
        if (m.detailed) {
            for (const tag of task.tags.slice(0, 2)) parts.push(`#${tag}`);
            if (task.recurrence) parts.push(`↻ ${task.recurrence}`);
        }
        const { done, total } = countSubtasks(task.subtasks);
        const toggles = !m.detailed && total > 0;
        if (total > 0)
            parts.push(`${done}/${total}${toggles ? (expanded === task.id ? ' ⌄' : ' ›') : ''}`);
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
            <div
                key={line.key}
                className={`zenith-tw__row is-prio-${task.priority}`}
                style={{ height: line.height }}
            >
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

    // On `lg` the summary strip carries the link, so the heading doesn't repeat it.
    const headLink = showStats
        ? ''
        : size === 'sm'
          ? t('tasks.widget.allShort')
          : t('tasks.widget.allTasks');

    /** Proportions of the day: overdue, due today, running, waiting. */
    const load = [
        { n: split.overdue, cls: 'is-overdue' },
        { n: split.dueToday, cls: 'is-today' },
        { n: split.doing.length, cls: 'is-doing' },
        { n: split.next.length, cls: 'is-next' },
    ].filter((s) => s.n > 0);

    const week = useMemo(() => {
        if (!showStats) return [];
        return Array.from({ length: 7 }, (_, i) => {
            const iso = isoOf(today, i);
            const due = split.active.filter((task) => task.dueDate === iso);
            return {
                iso,
                isToday: i === 0,
                label:
                    i === 0
                        ? t('tasks.widget.week.today')
                        : new Date(`${iso}T00:00:00`).toLocaleDateString(t.locale, {
                              weekday: 'short',
                          }),
                bars: due.slice(0, 3).map((task) => task.status),
            };
        });
    }, [showStats, split.active, today, t]);

    const figures = useMemo(() => {
        if (!showStats) return [];
        let subDone = 0;
        let subTotal = 0;
        for (const task of split.active) {
            const { done, total } = countSubtasks(task.subtasks);
            subDone += done;
            subTotal += total;
        }
        const dues = split.active
            .map((task) => task.dueDate)
            .filter((d): d is string => d !== undefined)
            .sort();
        // No "in progress" figure: the heading states it a few pixels above,
        // and the same number twice on one card is a number you stop reading.
        const out = [
            { key: 'active', value: String(split.active.length), cls: '' },
            {
                key: 'overdue',
                value: String(split.overdue),
                cls: split.overdue > 0 ? 'is-danger' : 'is-faint',
            },
        ];
        // The day's outcome, only on a day that had one: a nought here would
        // spend the width of a whole figure to report that nothing happened.
        if (split.doneToday > 0) {
            out.push({ key: 'done', value: String(split.doneToday), cls: 'is-done' });
        }
        if (split.cancelledToday > 0) {
            out.push({ key: 'cancelled', value: String(split.cancelledToday), cls: 'is-faint' });
        }
        if (subTotal > 0) out.push({ key: 'subtasks', value: `${subDone}/${subTotal}`, cls: '' });
        out.push({
            key: 'nextDue',
            value: dues.length
                ? new Date(`${dues[0]}T00:00:00`).toLocaleDateString(t.locale, {
                      month: 'short',
                      day: 'numeric',
                  })
                : '—',
            cls: 'is-date',
        });
        return out;
    }, [showStats, split, t]);

    /**
     * The bottom strip at a width the design didn't draw.
     *
     * `lg` is "full grid width", which is 886px on the default canvas but far
     * less in a narrow pane or on a re-sized grid — and the strip is the one
     * part of the card laid out in fixed pixels, so it is the part that runs
     * off the edge. Each figure is measured as drawn and the ones there is no
     * room for are dropped, rather than clipped in place.
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

        const room = stats.clientWidth - weekWidth(split.overdue > 0) - STATS_GAP;
        const kept = fitFigures(figureKeys, widths, room);
        setShownFigures((prev) =>
            prev && prev.length === kept.length && prev.every((k, i) => k === kept[i]) ? prev : kept
        );
    }, [showStats, figureKeys, shownFigures, t.locale, box.w, split.overdue]);

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

            {load.length > 0 && (
                <div className="zenith-tw__load" aria-hidden="true">
                    {load.map((seg) => (
                        <i
                            key={seg.cls}
                            className={`zenith-tw__load-seg ${seg.cls}`}
                            style={{ flexGrow: seg.n }}
                        />
                    ))}
                </div>
            )}

            {layout.groups ? (
                <div className="zenith-tw__groups">
                    {layout.groups.map((g) => (
                        <div key={g.label} className="zenith-tw__group" style={{ gap: layout.gap }}>
                            <div className="zenith-tw__group-head">
                                <span className="zenith-tw__group-num">
                                    {String(g.count).padStart(2, '0')}
                                </span>
                                <span className="zenith-tw__group-label">
                                    {t(`tasks.widget.group.${g.label}`)}
                                </span>
                                <i className="zenith-tw__group-rule" />
                            </div>
                            {g.lines.map(renderLine)}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="zenith-tw__body">
                    <div className="zenith-tw__col" style={{ gap: layout.gap }}>
                        {layout.columns?.[0] && (
                            <span className="zenith-tw__col-label">
                                {t(`tasks.widget.group.${layout.columns[0]}`)}
                            </span>
                        )}
                        {layout.lines.map(renderLine)}
                    </div>
                    {layout.lines2.length > 0 && (
                        <div className="zenith-tw__col" style={{ gap: layout.gap }}>
                            {/* An empty label still occupies its line: the two
                                columns have to start at the same height. */}
                            <span className="zenith-tw__col-label">
                                {layout.columns?.[1]
                                    ? t(`tasks.widget.group.${layout.columns[1]}`)
                                    : ' '}
                            </span>
                            {layout.lines2.map(renderLine)}
                        </div>
                    )}
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
                <div className="zenith-tw__stats" ref={statsRef} style={{ gap: STATS_GAP }}>
                    {/* The width the fitting maths reserved, stated. Without
                        it the strip sized itself to its content — the cells
                        are shrinkable, so a flex container measuring its own
                        max-content ignores their bases entirely — and came out
                        at 174px where 268 had been set aside for it. Two
                        consequences, both visible: the overdue cell arrived at
                        34px with a label that needs 42, ellipsised to
                        "просроч…", and ninety pixels the figures could have
                        used sat empty between the two halves of the strip. */}
                    <div
                        className="zenith-tw__week"
                        style={{ flexBasis: weekWidth(split.overdue > 0) }}
                    >
                        {split.overdue > 0 && (
                            <div
                                className="zenith-tw__week-cell is-overdue"
                                style={{ flexBasis: WEEK_OVERDUE }}
                            >
                                <span className="zenith-tw__week-num">−{split.overdue}</span>
                                <i className="zenith-tw__week-rule" />
                                <span className="zenith-tw__week-label">
                                    {t('tasks.widget.week.overdue')}
                                </span>
                            </div>
                        )}
                        {week.map((day) => (
                            <div
                                key={day.iso}
                                className={`zenith-tw__week-cell ${day.isToday ? 'is-today' : ''}`}
                                style={{ flexBasis: day.isToday ? WEEK_TODAY : WEEK_CELL }}
                            >
                                <span className="zenith-tw__week-bars">
                                    {day.bars.map((status, i) => (
                                        <i
                                            key={i}
                                            className={`zenith-tw__week-bar is-${status}`}
                                            style={{ height: 5 + i * 4 }}
                                        />
                                    ))}
                                </span>
                                <i className="zenith-tw__week-rule" />
                                <span className="zenith-tw__week-label">{day.label}</span>
                            </div>
                        ))}
                    </div>
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
