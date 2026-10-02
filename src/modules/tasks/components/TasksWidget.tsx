import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
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
import type { WidgetSize } from '../../dashboard/grid/gridTypes';
import { useTranslation, type Translator } from '../../../core/i18n';
import {
    METRICS,
    NOMINAL_H,
    dayProgress,
    planWidget,
    splitTasks,
    type Line,
} from '../services/widgetLayout';
import { marginText } from '../services/taskMargin';
import { isClosingOf, useClosingTasks, type Closing } from '../services/closingTasks';
import { undoClosing, useTaskActions } from './useTaskActions';
import { ProgressArc } from './TaskItem';
import { withFigures } from './inkFigures';

/**
 * The tasks card, as a page of a diary: what is burning, what is running,
 * what is next.
 *
 * It opens on a sentence, set in the planner's hand and built from the data
 * — "One overdue, two for today" — then the tasks in the list's own rows: the
 * day in the margin, the ink circle, the title. Along the bottom, the day's
 * progress as a single line of ink.
 *
 * `sm` is the three most urgent tasks. `md` and `lg` are named groups over the
 * day's progress, `md` stopping at five tasks. Subtasks stay folded behind
 * their tally, which opens them one task at a time.
 */

/** The opening sentence: its parts, the overdue one in the page's one colour. */
function sentenceOf(
    split: ReturnType<typeof splitTasks>,
    hasTasks: boolean,
    t: Translator
): Array<{ text: string; tone?: 'danger' }> {
    if (!hasTasks) return [{ text: t('tasks.widget.noTasks') }];
    if (split.active.length === 0) return [{ text: t('tasks.widget.noActive') }];
    const parts: Array<{ text: string; tone?: 'danger' }> = [];
    if (split.overdue > 0)
        parts.push({ text: t.plural('tasks.widget.say.overdue', split.overdue), tone: 'danger' });
    if (split.dueToday > 0)
        parts.push({ text: t.plural('tasks.widget.say.today', split.dueToday) });
    if (parts.length === 0)
        parts.push({ text: t.plural('tasks.widget.say.ahead', split.active.length) });
    // A sentence starts with a capital, whichever part begins it.
    const first = parts[0].text;
    parts[0] = { ...parts[0], text: first.charAt(0).toLocaleUpperCase(t.locale) + first.slice(1) };
    return parts;
}

interface RowProps {
    task: Task;
    closing?: Closing;
    size: WidgetSize;
    height: number;
    /** Under "Today", where the margin need not say so. */
    grouped: boolean;
    expanded: boolean;
    onToggle: () => void;
    onOpenList: () => void;
}

/** One task on the card — the list's row, smaller. */
const WidgetRow: FC<RowProps> = ({
    task,
    closing,
    size,
    height,
    grouped,
    expanded,
    onToggle,
    onOpenList,
}) => {
    const t = useTranslation();
    const { changeStatus, reload } = useTaskActions(task);
    const m = METRICS[size];
    const today = getTodayString();
    const margin = closing ? null : marginText(task, today, t, grouped);
    const { done, total } = countSubtasks(task.subtasks);
    const tags = m.tags ? task.tags.slice(0, 2) : [];

    return (
        <div
            className={`zenith-tw__row ${closing ? `is-closing is-${closing.phase}` : ''}`}
            style={{ height }}
        >
            <span className={`zenith-tw__margin ${margin ? `is-${margin.tone}` : ''}`}>
                {closing
                    ? closing.phase === 'held' &&
                      closing.undo && (
                          <button
                              type="button"
                              className="zenith-tw__undo"
                              onClick={() =>
                                  void undoClosing(
                                      closing.key,
                                      reload,
                                      () => new Notice(t('tasks.undo.failed'))
                                  )
                              }
                              aria-label={t('tasks.undo.label', { name: task.title })}
                          >
                              {t('tasks.undo')}
                          </button>
                      )
                    : margin?.text}
            </span>
            <TaskStatusControl
                status={closing ? closing.snapshot.status : task.status}
                size={m.box}
                onChange={(s) => {
                    if (!closing) void changeStatus(s);
                }}
            />
            <span
                className={`zenith-tw__title is-p-${task.priority}`}
                onClick={onOpenList}
                role="button"
                title={task.title}
            >
                <span className="zenith-tw__ink">{task.title}</span>
            </span>
            {!closing && (tags.length > 0 || total > 0) && (
                <span className="zenith-tw__info">
                    {tags.length > 0 && (
                        <span className="zenith-tw__tags">
                            {tags.map((x) => `#${x}`).join(' ')}
                        </span>
                    )}
                    {total > 0 && (
                        <button
                            type="button"
                            className={`zenith-tw__fold ${expanded ? 'is-open' : ''}`}
                            aria-expanded={expanded}
                            aria-label={t('tasks.subtasks.progress', { done, total })}
                            onClick={onToggle}
                        >
                            <ProgressArc done={done} total={total} size={11} />
                            {done}/{total}
                        </button>
                    )}
                </span>
            )}
        </div>
    );
};

export const TasksWidget: FC<DashboardWidgetProps> = ({ size = 'lg' }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const stored = useZenithStore((s) => s.tasks);
    const closings = useClosingTasks((s) => s.items);
    // With subtasks switched off the card is planned as if there were none:
    // no tally, no rows to open.
    const subtasksOn = useFeature('tasks.subtasks');

    /**
     * The tasks as the card plans them. A task in its moment of closing is
     * planned as it was, so it stays where it was on the card while that
     * lasts — `held` says which ones, and how to draw them.
     */
    const { tasks, held } = useMemo(() => {
        const entries = Object.entries(closings);
        const heldBy = new Map<string, Closing>();
        const list: Task[] = stored.map((task) => {
            const hit = entries.find(([, c]) => isClosingOf(c, task));
            if (!hit) return task;
            const shown = { ...task, status: hit[1].prev, completed: false };
            heldBy.set(shown.id, hit[1]);
            return shown;
        });
        for (const [id, closing] of entries) {
            if ([...heldBy.values()].includes(closing)) continue;
            const ghost = {
                ...closing.snapshot,
                id: `closing:${id}`,
                status: closing.prev,
                completed: false,
            };
            list.push(ghost);
            heldBy.set(ghost.id, closing);
        }
        return {
            tasks: subtasksOn ? list : list.map((task) => ({ ...task, subtasks: [] })),
            held: heldBy,
        };
    }, [stored, closings, subtasksOn]);

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
    const progress = dayProgress(split);

    /** `sm` has no room for the day's progress; the others end on it. */
    const showFoot = size !== 'sm' && split.active.length > 0;

    // ── Layout ───────────────────────────────────────

    /**
     * What the card's own furniture actually costs — the sentence at the top
     * and the line along the bottom depend on the theme's font and the
     * language, so they are measured rather than assumed. Safe because
     * neither height answers to the plan. See `Chrome` in `widgetLayout`.
     */
    const headRef = useRef<HTMLDivElement>(null);
    const footRef = useRef<HTMLDivElement>(null);
    const [chrome, setChrome] = useState({ head: 0, stats: 0 });

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return;
        const read = () => {
            const head = headRef.current?.offsetHeight ?? 0;
            const stats = footRef.current?.offsetHeight ?? 0;
            setChrome((prev) =>
                Math.abs(prev.head - head) > 1 || Math.abs(prev.stats - stats) > 1
                    ? { head, stats }
                    : prev
            );
        };
        const ro = new ResizeObserver(read);
        if (headRef.current) ro.observe(headRef.current);
        if (footRef.current) ro.observe(footRef.current);
        read();
        return () => ro.disconnect();
        // Re-attached when the strip appears or disappears, since the element
        // it observes is mounted and unmounted with it.
    }, [showFoot]);

    const layout = useMemo(
        () => planWidget({ split, size, available, expanded, chrome }),
        [split, size, available, expanded, chrome]
    );

    // ── Rendering ────────────────────────────────────

    const renderLine = (line: Line, grouped: boolean): React.ReactNode => {
        if (line.kind === 'more') {
            return (
                <div
                    key={line.key}
                    className="zenith-tw__row zenith-tw__row--more"
                    style={{ height: line.height }}
                >
                    <button type="button" className="zenith-tw__link" onClick={openTasks}>
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
                    <span className="zenith-tw__margin" />
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
                        <span className="zenith-tw__ink">{sub.title}</span>
                    </span>
                </div>
            );
        }
        const { task } = line;
        return (
            <WidgetRow
                key={line.key}
                task={task}
                closing={held.get(task.id)}
                size={size}
                height={line.height}
                grouped={grouped}
                expanded={expanded === task.id}
                onToggle={() => setExpanded((v) => (v === task.id ? null : task.id))}
                onOpenList={openTasks}
            />
        );
    };

    // The small card says the one thing that matters most; there is no room for a second.
    const sentence = sentenceOf(split, stored.length > 0, t).slice(
        0,
        size === 'sm' ? 1 : undefined
    );
    const quiet = split.active.length === 0;

    return (
        <div className={`zenith-tw zenith-tw--${size}`} ref={rootRef}>
            <div className="zenith-tw__head" ref={headRef} style={{ minHeight: m.head }}>
                <p className={`zenith-tw__say ${quiet ? 'is-quiet' : ''}`}>
                    {sentence.map((part, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && ', '}
                            <span className={part.tone === 'danger' ? 'is-danger' : undefined}>
                                {withFigures(part.text, 'zenith-tw__figure')}
                            </span>
                        </React.Fragment>
                    ))}
                </p>
                {!showFoot && (
                    <button type="button" className="zenith-tw__link" onClick={openTasks}>
                        {t(size === 'sm' ? 'tasks.widget.allShort' : 'tasks.widget.allTasks')}
                    </button>
                )}
            </div>

            {layout.groups ? (
                <div className="zenith-tw__groups">
                    {layout.groups.map((g) => (
                        <div key={g.label} className="zenith-tw__group" style={{ gap: layout.gap }}>
                            <div className="zenith-tw__group-head">
                                <span className="zenith-tw__group-count">{g.count}</span>
                                <span className="zenith-tw__group-label">
                                    {t(`tasks.widget.group.${g.label}`)}
                                </span>
                            </div>
                            {g.lines.map((line) => renderLine(line, g.label === 'today'))}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="zenith-tw__body" style={{ gap: layout.gap }}>
                    {layout.lines.map((line) => renderLine(line, false))}
                </div>
            )}

            {layout.hidden > 0 && (
                <button
                    type="button"
                    className="zenith-tw__link zenith-tw__more"
                    onClick={openTasks}
                >
                    {t('tasks.widget.moreN', { count: layout.hidden })}
                </button>
            )}

            {showFoot && (
                <div className="zenith-tw__foot" ref={footRef}>
                    {progress && (
                        <div
                            className="zenith-tw__progress"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={progress.total}
                            aria-valuenow={progress.done}
                            aria-label={t('tasks.widget.dayProgress', progress)}
                        >
                            <span
                                className="zenith-tw__progress-ink"
                                style={{ width: `${(progress.done / progress.total) * 100}%` }}
                            />
                        </div>
                    )}
                    <div className="zenith-tw__foot-line">
                        <span className="zenith-tw__foot-say">
                            {progress
                                ? withFigures(
                                      t('tasks.widget.dayProgress', progress),
                                      'zenith-tw__figure'
                                  )
                                : t.plural('tasks.widget.say.ahead', split.active.length)}
                        </span>
                        <button type="button" className="zenith-tw__link" onClick={openTasks}>
                            {t('tasks.widget.allTasks')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
