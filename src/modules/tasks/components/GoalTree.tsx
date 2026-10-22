import React, {
    createContext,
    useContext,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { Menu, Notice } from 'obsidian';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useLongPress } from '../../../core/useLongPress';
import { useFeature } from '../../../core/useFeature';
import { openFileAtLine } from '../../../core/openInVault';
import { confirmDelete } from '../../../core/ConfirmModal';
import type { TaskStatus } from '../../../core/constants';
import type { Task } from '../../../store/taskSlice';
import type { Project } from '../../projects/projectsTypes';
import { buildGoals, habitsUnder, quietWeeks, type GoalNode } from '../services/goalTree';
import { addGoal, linkStep, moveStep, setGoal, unlinkStep } from '../services/goalActions';
import { TaskWriter } from '../services/taskWriter';
import { marginText, subtaskWhen } from '../services/taskMargin';
import { quickParse } from '../services/quickParse';
import { countSubtasks } from '../services/taskStats';
import { amountTowards, formatHours, quotaShown } from '../services/taskHours';
import { isRunningFor } from '../services/taskTimer';
import { TimerService } from '../services/timerService';
import { TaskStatusControl } from './taskStatusUi';
import { TaskEditorModal } from './TaskEditorModal';
import { SubtaskEditorModal } from './SubtaskEditorModal';
import { GoalLinkPicker } from './GoalLinkPicker';
import { GoalProjectPicker } from './GoalProjectPicker';
import { projectSteps } from '../../projects/services/projectGoals';
import { GoalMovePicker } from './GoalMovePicker';
import { QuotaTally } from './QuotaTally';
import { TaskTimerButton } from './TaskTimerButton';
import { TaskTitle } from './TaskTitle';

const NONE: readonly string[] = [];

/** The whole tree, for whatever row needs to name a place in it — "move under…". */
const GoalsContext = createContext<GoalNode[]>([]);

const isClosed = (status: TaskStatus) => status === 'done' || status === 'cancelled';
/** What was put in under a node, in the kind its target asks for. */
const putIn = (node: GoalNode) => (node.target?.count ? node.countUnder : node.hoursUnder);

interface Folds {
    isFolded: (node: GoalNode) => boolean;
    toggle: (node: GoalNode) => void;
}

/**
 * What is folded. By default what is open is open and what is closed is
 * folded to its one line; the settings keep only what was turned the other
 * way, by the node's `foldKey`.
 */
function useFolds(): Folds {
    // The default outside the selector: a `[]` made inside it is a new value
    // on every read, and the store would re-render the tree without end.
    const flipped = useZenithStore((s) => s.settings.taskView.goalsFlipped) ?? NONE;
    const updateSettings = useZenithStore((s) => s.updateSettings);
    return {
        isFolded: (node) => isClosed(node.status) !== flipped.includes(node.foldKey),
        toggle: (node) => {
            const view = useZenithStore.getState().settings.taskView;
            const now = view.goalsFlipped ?? [];
            const key = node.foldKey;
            updateSettings({
                taskView: {
                    ...view,
                    goalsFlipped: now.includes(key) ? now.filter((k) => k !== key) : [...now, key],
                },
            });
        },
    };
}

/** Items with a dot between them, as the tally under the day has. */
function dotted(items: ReactNode[]): ReactNode[] {
    return items.flatMap((item, i) =>
        i === 0
            ? [item]
            : [
                  <span key={`dot${i}`} className="zenith-goal__dot" aria-hidden="true">
                      ·
                  </span>,
                  item,
              ]
    );
}

/**
 * The goals, as a tree: what the Tasks page turns to from its tally.
 *
 * Each goal is a heading in the planner's hand, with a line under it — how
 * many of its steps are closed, when it is due — and a line of ink for how
 * far along it is, everything under it counted. Under it, what it takes: its
 * subtasks and the tasks its `⛔` names, each with its own steps in turn
 * (`goalTree`). A step with steps of its own is a stage, set in bold with its
 * own count; the rest are the list's rows cut down. The first thing still to
 * do is marked "next".
 *
 * Every row has a plus for the next step — a subtask under it, in its note —
 * and a menu: tie an existing task under it, untie one that was tied, open
 * the line in its note. A line at the top writes a new goal. The goals that
 * are done wait at the bottom, behind one line.
 */
export const GoalTree: FC<{ tasks: Task[]; goalTag: string }> = ({ tasks, goalTag }) => {
    const t = useTranslation();
    const projects = useZenithStore((s) => s.projects);
    const goals = useMemo(
        () => buildGoals(tasks, goalTag, projectSteps(projects, tasks)),
        [tasks, goalTag, projects]
    );
    const folds = useFolds();
    const [showDone, setShowDone] = useState(false);
    const open = goals.filter((goal) => !isClosed(goal.status));
    const finished = goals.filter((goal) => isClosed(goal.status));

    const section = (goal: GoalNode) => (
        <GoalSection key={goal.key} goal={goal} tasks={tasks} folds={folds} goalTag={goalTag} />
    );

    return (
        <GoalsContext.Provider value={goals}>
            <div className="zenith-goals">
                <GoalLine goalTag={goalTag} />
                {goals.length === 0 ? (
                    <div className="zenith-tempty">
                        <p className="zenith-tempty__lead">{t('tasks.goals.empty')}</p>
                        <p className="zenith-tempty__hint">
                            {t('tasks.goals.emptyHint', { tag: `#${goalTag.replace(/^#/, '')}` })}
                        </p>
                    </div>
                ) : (
                    open.map(section)
                )}
                {finished.length > 0 && (
                    <>
                        <button
                            type="button"
                            className="zenith-goals__done"
                            aria-expanded={showDone}
                            onClick={() => setShowDone((v) => !v)}
                        >
                            {t('tasks.goals.done', { count: finished.length })}
                        </button>
                        {showDone && finished.map(section)}
                    </>
                )}
            </div>
        </GoalsContext.Provider>
    );
};

/** One goal: its head, the line under it, the line of ink, and what hangs under it. */
const GoalSection: FC<{ goal: GoalNode; tasks: Task[]; folds: Folds; goalTag: string }> = ({
    goal,
    tasks,
    folds,
    goalTag,
}) => {
    const t = useTranslation();
    const timerOn = useFeature('tasks.timer');
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const [adding, setAdding] = useState(false);
    const folded = folds.isFolded(goal);
    const today = getTodayString();
    const when = goal.task?.dueDate ? marginText(goal.task, today, t, false) : null;
    const habits = habitsUnder(goal).filter((habit) => quotaShown(habit.target, timerOn));
    // Hours or times in all, its own — or nothing to measure yet, and no line for it.
    const inAll = !!goal.target && !goal.target.weekly;
    const measured = goal.children.length > 0 || inAll;

    const meta: ReactNode[] = [];
    if (goal.total > 0) {
        meta.push(
            <button
                key="count"
                type="button"
                className="zenith-goal__count"
                aria-expanded={!folded}
                title={t(folded ? 'tasks.goals.unfold' : 'tasks.goals.fold')}
                onClick={() => folds.toggle(goal)}
            >
                {goal.done}/{goal.total}
            </button>
        );
    }
    if (quotaShown(goal.target, timerOn)) {
        meta.push(<QuotaTally key="hours" item={goal} towards={inAll ? putIn(goal) : undefined} />);
    }
    if (when?.text) {
        meta.push(
            <span key="when" className={`zenith-goal__when is-${when.tone}`}>
                {when.text}
            </span>
        );
    }
    // The week of the habits under it, which its line does not count: the
    // hours and the times, each summed with its own kind.
    for (const count of [false, true]) {
        const kind = habits.filter((h) => !!h.target?.count === count);
        if (kind.length === 0) continue;
        const done = kind.reduce((sum, h) => sum + amountTowards(h, today, weekStart), 0);
        const target = kind.reduce((sum, h) => sum + (h.target?.amount ?? 0), 0);
        meta.push(
            <span key={count ? 'week-count' : 'week'} className="zenith-goal__week">
                {count
                    ? t('tasks.goals.weekCount', { done, target })
                    : t('tasks.goals.week', {
                          done: formatHours(done, t.locale),
                          target: formatHours(target, t.locale),
                      })}
            </span>
        );
    }
    // Nothing done towards it for a fortnight or more: said once, quietly.
    const quiet = quietWeeks(goal, today);
    if (quiet) {
        meta.push(
            <span key="quiet" className="zenith-goal__quiet">
                {t.plural('tasks.goals.quiet', quiet)}
            </span>
        );
    }
    // Folded, the goal still says what to do next.
    if (folded && goal.next) {
        meta.push(
            <span key="next" className="zenith-goal__nextis">
                {t('tasks.goals.nextIs', { name: goal.next.title })}
            </span>
        );
    }

    return (
        <section className={`zenith-goal${isClosed(goal.status) ? ' is-closed' : ''}`}>
            <NodeRow
                node={goal}
                parent={null}
                tasks={tasks}
                goalTag={goalTag}
                head
                onAdd={() => {
                    if (folded) folds.toggle(goal);
                    setAdding(true);
                }}
            />
            {meta.length > 0 && <div className="zenith-goal__meta">{dotted(meta)}</div>}
            {/* A goal that is closed has nothing left to measure, and one
                with no steps and no hours has nothing to measure yet. */}
            {!isClosed(goal.status) && measured && (
                <div
                    className="zenith-goal__progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(goal.progress * 100)}
                >
                    <span style={{ width: `${goal.progress * 100}%` }} />
                </div>
            )}
            {!folded && (goal.children.length > 0 || adding) && (
                <Steps
                    node={goal}
                    tasks={tasks}
                    folds={folds}
                    goalTag={goalTag}
                    nextKey={goal.next?.key}
                    adding={adding}
                    onAdded={() => setAdding(false)}
                />
            )}
        </section>
    );
};

/** What hangs under a node, and the field for one more at the end. */
const Steps: FC<{
    node: GoalNode;
    tasks: Task[];
    folds: Folds;
    goalTag: string;
    nextKey?: string;
    adding: boolean;
    onAdded: () => void;
}> = ({ node, tasks, folds, goalTag, nextKey, adding, onAdded }) => (
    <ul className="zenith-goal__steps">
        {node.children.map((child) => (
            <Branch
                key={child.key}
                node={child}
                parent={node}
                tasks={tasks}
                folds={folds}
                goalTag={goalTag}
                nextKey={nextKey}
            />
        ))}
        {adding && (
            <li>
                <StepField node={node} onDone={onAdded} />
            </li>
        )}
    </ul>
);

/** A step and, under it, its own steps. */
const Branch: FC<{
    node: GoalNode;
    parent: GoalNode;
    tasks: Task[];
    folds: Folds;
    goalTag: string;
    nextKey?: string;
}> = ({ node, parent, tasks, folds, goalTag, nextKey }) => {
    const [adding, setAdding] = useState(false);
    const stage = node.children.length > 0;
    const folded = stage && folds.isFolded(node);

    return (
        <li className="zenith-goal__branch">
            <NodeRow
                node={node}
                parent={parent}
                tasks={tasks}
                goalTag={goalTag}
                next={node.key === nextKey}
                folded={folded}
                onFold={stage ? () => folds.toggle(node) : undefined}
                onAdd={() => {
                    if (folded) folds.toggle(node);
                    setAdding(true);
                }}
            />
            {((stage && !folded) || adding) && (
                <Steps
                    node={node}
                    tasks={tasks}
                    folds={folds}
                    goalTag={goalTag}
                    nextKey={nextKey}
                    adding={adding}
                    onAdded={() => setAdding(false)}
                />
            )}
        </li>
    );
};

/**
 * One line of the tree: a goal's head or a step. The checkbox closes it, the
 * name opens its editor, the plus writes the next step under it, and the
 * menu — or a right-click, or a long press — does the rest. A stage carries
 * its count after its name, which folds it.
 */
const NodeRow: FC<{
    node: GoalNode;
    parent: GoalNode | null;
    tasks: Task[];
    goalTag: string;
    head?: boolean;
    next?: boolean;
    folded?: boolean;
    onFold?: () => void;
    onAdd: () => void;
}> = ({
    node,
    parent,
    tasks,
    goalTag,
    head = false,
    next = false,
    folded = false,
    onFold,
    onAdd,
}) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const goals = useContext(GoalsContext);
    const [editing, setEditing] = useState(false);
    const [picking, setPicking] = useState(false);
    const [moving, setMoving] = useState(false);
    const [tyingProject, setTyingProject] = useState(false);
    const projects = useZenithStore((s) => s.projects);
    const reload = () => plugin.dataService.reloadTasks();
    const timerOn = useFeature('tasks.timer');
    const running = useZenithStore((s) =>
        isRunningFor(s.settings.activeTimer, node.filePath, node.lineNumber)
    );
    const closed = isClosed(node.status);
    const stage = !head && node.children.length > 0;
    // A goal's day is under its name; a step's is in the margin — a subtask's
    // own, or the hour it has of its task's day.
    const today = getTodayString();
    const when = head
        ? null
        : node.task
          ? node.task.dueDate
              ? marginText(node.task, today, t, false)
              : null
          : subtaskWhen(node, today, t);

    /**
     * Delete the line and what is written under it — asked first, by name and
     * by how many, when there is something under it, as in the list. A task
     * tied in from another note goes from that note; its id comes out of the
     * `⛔` above it first, while the lines are still where they were read.
     */
    const remove = async () => {
        const under = countSubtasks(node.task?.subtasks ?? node.sub?.subtasks ?? []).total;
        if (under > 0) {
            const question = t.plural('tasks.delete.withSubtasks', under, { name: node.title });
            if (!(await confirmDelete(app, question))) return;
        }
        try {
            if (parent && node.via === 'link' && node.ref) {
                await unlinkStep(app, parent, node.ref);
            }
            const ok = await new TaskWriter(app).deleteTaskInFile(
                node.filePath,
                node.lineNumber,
                node.title
            );
            if (!ok) new Notice(t('tasks.error.delete'));
        } catch (err) {
            console.error('Zenith: failed to delete from the goals tree:', err);
            new Notice(t('tasks.error.delete'));
        }
        await reload();
    };

    /** A step that stands for the project: its title, a link to the project's note. */
    const tieProject = async (project: Project) => {
        const name = project.filePath.replace(/\.md$/i, '').split('/').pop() ?? project.title;
        const link = name === project.title ? `[[${name}]]` : `[[${name}|${project.title}]]`;
        const ok = await new TaskWriter(app).addSubtaskInFile(node.filePath, node.lineNumber, link, {
            createdDate: getTodayString(),
        });
        if (ok) await reload();
        else new Notice(t('tasks.error.update'));
    };

    const setStatus = async (status: TaskStatus) => {
        try {
            const ok = await new TaskWriter(app).setStatusInFile(
                node.filePath,
                node.lineNumber,
                status,
                node.title
            );
            if (ok) await reload();
            else new Notice(t('tasks.error.update'));
        } catch (err) {
            console.error('Zenith: failed to set the status:', err);
        }
    };

    const menu = (at: { x: number; y: number } | MouseEvent) => {
        const m = new Menu();
        m.addItem((item) =>
            item.setTitle(t('tasks.goals.addStep')).setIcon('list-plus').onClick(onAdd)
        );
        m.addItem((item) =>
            item
                .setTitle(t('tasks.goals.link'))
                .setIcon('link')
                .onClick(() => setPicking(true))
        );
        if (projects.length > 0) {
            m.addItem((item) =>
                item
                    .setTitle(t('tasks.goals.linkProject'))
                    .setIcon('folder-kanban')
                    .onClick(() => setTyingProject(true))
            );
        }
        if (parent) {
            m.addItem((item) =>
                item
                    .setTitle(t('tasks.goals.move'))
                    .setIcon('corner-down-right')
                    .onClick(() => setMoving(true))
            );
        }
        if (parent && node.via === 'link' && node.ref) {
            const ref = node.ref;
            m.addItem((item) =>
                item
                    .setTitle(t('tasks.goals.unlink'))
                    .setIcon('unlink')
                    .onClick(
                        () =>
                            void unlinkStep(app, parent, ref).then((ok) => {
                                if (ok) void reload();
                            })
                    )
            );
        }
        if (timerOn && !closed) {
            m.addItem((item) =>
                item
                    .setTitle(t(running ? 'tasks.timer.stop' : 'tasks.timer.start'))
                    .setIcon(running ? 'square' : 'timer')
                    .onClick(() => {
                        const service = new TimerService(app);
                        void (running
                            ? service.stopRunning()
                            : service.startFor({
                                  filePath: node.filePath,
                                  lineNumber: node.lineNumber,
                                  title: node.title,
                                  countdownMinutes: node.timerMinutes,
                              }));
                    })
            );
        }
        m.addSeparator();
        m.addItem((item) =>
            item
                .setTitle(t('common.edit'))
                .setIcon('pencil')
                .onClick(() => setEditing(true))
        );
        m.addItem((item) =>
            item
                .setTitle(t('common.openInFile'))
                .setIcon('file-text')
                .onClick(() => void openFileAtLine(app, node.filePath, node.lineNumber - 1))
        );
        // The list does not show a goal, so it stops being one here.
        const task = node.task;
        if (head && task) {
            m.addItem((item) =>
                item
                    .setTitle(t('tasks.goals.unmake'))
                    .setIcon('target')
                    .onClick(
                        () =>
                            void setGoal(app, task, goalTag, false).then((ok) => {
                                if (ok) void reload();
                            })
                    )
            );
        }
        m.addSeparator();
        m.addItem((item) =>
            item
                .setTitle(t('common.delete'))
                .setIcon('trash-2')
                .setWarning(true)
                .onClick(() => void remove())
        );
        if (at instanceof MouseEvent) m.showAtMouseEvent(at);
        else m.showAtPosition(at);
    };
    const press = useLongPress(
        (x, y) => menu({ x, y }),
        (e) => {
            e.preventDefault();
            menu(e.nativeEvent);
        }
    );

    const rowClass = [
        'zenith-goal__row',
        head && 'is-head',
        stage && 'is-stage',
        closed && 'is-closed',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <>
            <div className={rowClass} onContextMenu={press.onContextMenu}>
                <TaskStatusControl
                    status={node.status}
                    size={head ? 18 : 16}
                    ready={node.ready}
                    onChange={(s) => void setStatus(s)}
                />
                <span className="zenith-goal__title">
                    <span
                        className="zenith-goal__name"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            if (!press.swallowClick()) setEditing(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditing(true);
                        }}
                        onPointerDown={press.onPointerDown}
                        onPointerMove={press.onPointerMove}
                        onPointerUp={press.onPointerUp}
                        onPointerCancel={press.onPointerCancel}
                    >
                        <TaskTitle title={node.title} sourcePath={node.filePath} />
                    </span>
                    {stage && onFold && node.total > 0 && (
                        <button
                            type="button"
                            className="zenith-goal__count"
                            aria-expanded={!folded}
                            title={t(folded ? 'tasks.goals.unfold' : 'tasks.goals.fold')}
                            onClick={onFold}
                        >
                            {node.done}/{node.total}
                        </button>
                    )}
                    {node.target && quotaShown(node.target, timerOn) && !head && (
                        <QuotaTally
                            item={node}
                            towards={stage && !node.target.weekly ? putIn(node) : undefined}
                        />
                    )}
                    {node.project && (
                        <span
                            className="zenith-tally zenith-goal__project"
                            title={node.project.title}
                        >
                            {t('tasks.goals.projectTally', {
                                done: node.project.done,
                                total: node.project.total,
                            })}
                            <span className="zenith-tally__line" aria-hidden="true">
                                <i style={{ width: `${node.progress * 100}%` }} />
                            </span>
                        </span>
                    )}
                </span>
                {when?.text ? (
                    <span className={`zenith-goal__when is-${when.tone}${next ? ' is-next' : ''}`}>
                        {when.text}
                    </span>
                ) : (
                    next && (
                        <span className="zenith-goal__when is-next">{t('tasks.goals.next')}</span>
                    )
                )}
                {timerOn && !closed && (
                    <span className={`zenith-goal__timer${running ? ' is-running' : ''}`}>
                        <TaskTimerButton
                            filePath={node.filePath}
                            lineNumber={node.lineNumber}
                            title={node.title}
                            timerMinutes={node.timerMinutes}
                            size={13}
                        />
                    </span>
                )}
                <button
                    type="button"
                    className="zenith-goal__act is-add"
                    aria-label={t('tasks.goals.addStep')}
                    title={t('tasks.goals.addStep')}
                    onClick={onAdd}
                >
                    <Plus size={14} />
                </button>
                <button
                    type="button"
                    className="zenith-goal__act"
                    aria-label={t('tasks.goals.menu')}
                    title={t('tasks.goals.menu')}
                    onClick={(e) => menu(e.nativeEvent)}
                >
                    <MoreHorizontal size={14} />
                </button>
            </div>

            {editing && node.task && (
                <TaskEditorModal
                    editTask={node.task}
                    onClose={() => setEditing(false)}
                    onSaved={reload}
                />
            )}
            {editing && !node.task && node.sub && (
                <SubtaskEditorModal
                    filePath={node.filePath}
                    subtask={node.sub}
                    onClose={() => setEditing(false)}
                    onSaved={reload}
                />
            )}
            {moving && parent && (
                <GoalMovePicker
                    node={node}
                    parent={parent}
                    goals={goals}
                    onClose={() => setMoving(false)}
                    onPick={(target) => {
                        setMoving(false);
                        void moveStep(app, tasks, node, parent, target).then((ok) => {
                            if (ok) void reload();
                        });
                    }}
                />
            )}
            {tyingProject && (
                <GoalProjectPicker
                    node={node}
                    projects={projects}
                    onClose={() => setTyingProject(false)}
                    onPick={(project) => {
                        setTyingProject(false);
                        void tieProject(project);
                    }}
                />
            )}
            {picking && (
                <GoalLinkPicker
                    node={node}
                    tasks={tasks}
                    onClose={() => setPicking(false)}
                    onPick={(child) => {
                        setPicking(false);
                        void linkStep(app, tasks, node, child).then((ok) => {
                            if (ok) void reload();
                        });
                    }}
                />
            )}
        </>
    );
};

/**
 * The field for the next step under a node, at the end of its steps. It stays
 * after a step is written, for the one after; Escape, or leaving it empty,
 * puts it away.
 */
const StepField: FC<{ node: GoalNode; onDone: () => void }> = ({ node, onDone }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const natural = useFeature('tasks.naturalInput');
    const [text, setText] = useState('');
    const busy = useRef(false);

    const add = async () => {
        const typed = text.trim();
        if (!typed || busy.current) return;
        // "Run 14 km tomorrow" is a step with a day, read the way quick add reads it.
        const { journalWeekStart } = useZenithStore.getState().settings;
        const read = natural
            ? quickParse(typed, getTodayString(), undefined, journalWeekStart)
            : null;
        const title = read?.title.trim() || typed;
        // Stamped with the day: a step added is a goal moving (`lastMoved`).
        const fields = {
            createdDate: getTodayString(),
            ...(read?.dueDate
                ? { dueDate: read.dueDate, dueTime: read.dueTime, dueEndTime: read.dueEndTime }
                : {}),
        };
        busy.current = true;
        try {
            if (
                await new TaskWriter(app).addSubtaskInFile(
                    node.filePath,
                    node.lineNumber,
                    title,
                    fields
                )
            ) {
                setText('');
                await plugin.dataService.reloadTasks();
            } else {
                new Notice(t('tasks.error.save'));
            }
        } finally {
            busy.current = false;
        }
    };

    return (
        <div className="zenith-goal__add">
            <span className="zenith-goal__ring" aria-hidden="true" />
            <input
                className="zenith-goal__input"
                value={text}
                placeholder={t('tasks.goals.stepPlaceholder')}
                aria-label={t('tasks.goals.addStep')}
                enterKeyHint="done"
                autoFocus
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                    if (!text.trim()) onDone();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        void add();
                    } else if (e.key === 'Escape') {
                        setText('');
                        onDone();
                    }
                }}
            />
        </div>
    );
};

/** The line a new goal is written on, at the top of the tree — into the goals' note. */
const GoalLine: FC<{ goalTag: string }> = ({ goalTag }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const title = text.trim();
        if (!title || busy) return;
        setBusy(true);
        try {
            const settings = useZenithStore.getState().settings;
            if (await addGoal(app, settings, title, goalTag)) {
                setText('');
                void plugin.dataService.reloadTasks();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`zenith-goal__new${text ? ' is-typing' : ''}`}>
            <span className="zenith-goal__ring" aria-hidden="true" />
            <input
                className="zenith-goal__input zenith-goal__input--new"
                value={text}
                placeholder={t('tasks.goals.newPlaceholder')}
                aria-label={t('tasks.goals.newPlaceholder')}
                enterKeyHint="done"
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        void submit();
                    }
                }}
            />
        </div>
    );
};
