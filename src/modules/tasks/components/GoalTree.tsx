import React, { useMemo, useRef, useState, type FC } from 'react';
import { Menu, Notice } from 'obsidian';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useLongPress } from '../../../core/useLongPress';
import { openFileAtLine } from '../../../core/openInVault';
import type { TaskStatus } from '../../../core/constants';
import type { Task } from '../../../store/taskSlice';
import { buildGoals, type GoalNode } from '../services/goalTree';
import { linkStep, unlinkStep } from '../services/goalActions';
import { TaskWriter } from '../services/taskWriter';
import { resolveTaskTarget } from '../services/taskTarget';
import { marginText } from '../services/taskMargin';
import { detailKey } from '../services/taskViewState';
import { TaskStatusControl } from './taskStatusUi';
import { SubtaskTally } from './TaskItem';
import { TaskEditorModal } from './TaskEditorModal';
import { SubtaskEditorModal } from './SubtaskEditorModal';
import { GoalLinkPicker } from './GoalLinkPicker';

const NONE: readonly string[] = [];

/** The goals that start folded: none — but a folded one is remembered by its note and title. */
function useFolded() {
    // The default outside the selector: a `[]` made inside it is a new value
    // on every read, and the store would re-render the tree without end.
    const folded = useZenithStore((s) => s.settings.taskView.goalsClosed) ?? NONE;
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const toggle = (key: string) => {
        const view = useZenithStore.getState().settings.taskView;
        const now = view.goalsClosed ?? [];
        updateSettings({
            taskView: {
                ...view,
                goalsClosed: now.includes(key) ? now.filter((k) => k !== key) : [...now, key],
            },
        });
    };
    return { folded, toggle };
}

/**
 * The goals, as a tree: what the Tasks page turns to from its tally.
 *
 * Each goal is named in the planner's hand, with how far along it is as a line
 * of ink under it; under it, what it takes — its subtasks, and the tasks its
 * `⛔` names, each with its own steps in turn (`goalTree`). The steps are the
 * list's own rows, cut down: the checkbox, the name, the date in the margin.
 * A step that is done stays, struck through, because what has been done is
 * part of how far along a goal is.
 *
 * Every row has a plus for the next step — a subtask under it, in its note —
 * and a menu: tie an existing task under it, untie one that was tied, open
 * the line in its note. A line at the top writes a new goal.
 */
export const GoalTree: FC<{ tasks: Task[]; goalTag: string }> = ({ tasks, goalTag }) => {
    const t = useTranslation();
    const goals = useMemo(() => buildGoals(tasks, goalTag), [tasks, goalTag]);
    const { folded, toggle } = useFolded();

    return (
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
                goals.map((goal) => {
                    const key = detailKey(goal);
                    return (
                        <GoalSection
                            key={goal.key}
                            goal={goal}
                            tasks={tasks}
                            folded={folded.includes(key)}
                            onFold={() => toggle(key)}
                        />
                    );
                })
            )}
        </div>
    );
};

/** One goal: its head, the line of ink, and what hangs under it. */
const GoalSection: FC<{ goal: GoalNode; tasks: Task[]; folded: boolean; onFold: () => void }> = ({
    goal,
    tasks,
    folded,
    onFold,
}) => {
    const t = useTranslation();
    const closed = goal.status === 'done' || goal.status === 'cancelled';
    const allDone = goal.total > 0 && goal.done === goal.total && !closed;

    return (
        <section className={`zenith-goal${closed ? ' is-closed' : ''}`}>
            <NodeRow node={goal} parent={null} tasks={tasks} head>
                <button
                    type="button"
                    className="zenith-goal__fold"
                    aria-expanded={!folded}
                    title={t(folded ? 'tasks.goals.unfold' : 'tasks.goals.fold')}
                    onClick={onFold}
                >
                    {goal.total > 0 ? `${goal.done}/${goal.total}` : ''}
                </button>
            </NodeRow>
            {goal.total > 0 && (
                <div className="zenith-goal__meter">
                    <div
                        className="zenith-goal__progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={goal.total}
                        aria-valuenow={goal.done}
                    >
                        <span style={{ width: `${(goal.done / goal.total) * 100}%` }} />
                    </div>
                    {/* The goal is not closed by its steps: that is the reader's
                        call. It says the steps are all done, quietly. */}
                    {allDone && (
                        <span className="zenith-goal__ready">{t('tasks.goals.allDone')}</span>
                    )}
                </div>
            )}
            {!folded && goal.children.length > 0 && (
                <ul className="zenith-goal__steps">
                    {goal.children.map((child) => (
                        <Branch key={child.key} node={child} parent={goal} tasks={tasks} />
                    ))}
                </ul>
            )}
        </section>
    );
};

/** A step and, under it, its own steps. */
const Branch: FC<{ node: GoalNode; parent: GoalNode; tasks: Task[] }> = ({
    node,
    parent,
    tasks,
}) => (
    <li className="zenith-goal__branch">
        <NodeRow node={node} parent={parent} tasks={tasks} />
        {node.children.length > 0 && (
            <ul className="zenith-goal__steps">
                {node.children.map((child) => (
                    <Branch key={child.key} node={child} parent={node} tasks={tasks} />
                ))}
            </ul>
        )}
    </li>
);

/**
 * One line of the tree: a goal's head or a step. The checkbox closes it, the
 * name opens its editor, the plus writes the next step under it, and the
 * menu — or a right-click, or a long press — does the rest.
 */
const NodeRow: FC<{
    node: GoalNode;
    parent: GoalNode | null;
    tasks: Task[];
    head?: boolean;
    children?: React.ReactNode;
}> = ({ node, parent, tasks, head = false, children }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const [adding, setAdding] = useState(false);
    const [text, setText] = useState('');
    const [editing, setEditing] = useState(false);
    const [picking, setPicking] = useState(false);
    const busy = useRef(false);
    const reload = () => plugin.dataService.reloadTasks();
    const closed = node.status === 'done' || node.status === 'cancelled';
    // Only a task has a day; a subtask's is its task's.
    const when = node.task?.dueDate ? marginText(node.task, getTodayString(), t, false) : null;

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

    const addStep = async () => {
        const title = text.trim();
        if (!title || busy.current) return;
        busy.current = true;
        try {
            if (await new TaskWriter(app).addSubtaskInFile(node.filePath, node.lineNumber, title)) {
                setText('');
                await reload();
            } else {
                new Notice(t('tasks.error.save'));
            }
        } finally {
            busy.current = false;
        }
    };

    const menu = (at: { x: number; y: number } | MouseEvent) => {
        const m = new Menu();
        m.addItem((item) =>
            item
                .setTitle(t('tasks.goals.addStep'))
                .setIcon('list-plus')
                .onClick(() => setAdding(true))
        );
        m.addItem((item) =>
            item
                .setTitle(t('tasks.goals.link'))
                .setIcon('link')
                .onClick(() => setPicking(true))
        );
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

    return (
        <>
            <div
                className={`zenith-goal__row${head ? ' is-head' : ''}${closed ? ' is-closed' : ''}`}
                onContextMenu={press.onContextMenu}
            >
                <TaskStatusControl
                    status={node.status}
                    size={head ? 18 : 16}
                    onChange={(s) => void setStatus(s)}
                />
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
                    {node.title}
                </span>
                {when?.text && (
                    <span className={`zenith-goal__when is-${when.tone}`}>{when.text}</span>
                )}
                {!head && node.children.length > 0 && (
                    <SubtaskTally done={node.done} total={node.total} />
                )}
                {children}
                <button
                    type="button"
                    className="zenith-goal__act is-add"
                    aria-label={t('tasks.goals.addStep')}
                    title={t('tasks.goals.addStep')}
                    onClick={() => setAdding(true)}
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

            {adding && (
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
                            if (!text.trim()) setAdding(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void addStep();
                            } else if (e.key === 'Escape') {
                                setText('');
                                setAdding(false);
                            }
                        }}
                    />
                </div>
            )}

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

/** The line a new goal is written on, at the top of the tree. */
const GoalLine: FC<{ goalTag: string }> = ({ goalTag }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const title = text.trim();
        if (!title || busy) return;
        setBusy(true);
        try {
            const target = await resolveTaskTarget(app, settings);
            await new TaskWriter(app).addTask(
                settings.tasksFolderPath,
                { title, priority: 'none', tags: [goalTag.replace(/^#/, '')] },
                target
            );
            setText('');
            void plugin.dataService.reloadTasks();
        } catch (err) {
            console.error('Zenith: failed to add the goal:', err);
            new Notice(t('notice.taskAddFailed'));
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
