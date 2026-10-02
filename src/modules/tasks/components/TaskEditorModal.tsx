import React, { useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { PRIORITIES, TASK_STATUSES } from '../../../core/constants';
import type { Priority, TaskStatus } from '../../../core/constants';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../services/taskWriter';
import { useFeature } from '../../../core/useFeature';
import { getTodayString } from '../../../core/dateUtils';
import { ConfirmModal } from '../../../core/ConfirmModal';
import { resolveTaskTarget } from '../services/taskTarget';
import {
    diffTaskFields,
    formatDuration,
    isRecurrenceUnderstood,
    normalizeTimeOfDay,
    parseDuration,
} from '../services/taskFormat';
import type { TaskAttachment, TaskDetails } from '../services/taskDetails';
import { addDays } from '../services/taskBuckets';
import { shortDate } from '../services/taskMargin';
import { AttachmentField } from './AttachmentField';
import { splitProjectLink, withProjectLink } from '../../projects/services/projectLink';
import { Modal } from '../../../components/shared/Modal';
import { DateField, TimeField } from '../../../components/ui/fields';
import { useTranslation, type Translator } from '../../../core/i18n';
import type { TaskDraft } from './TaskQuickLine';
import { STATUS_I18N, StatusBox } from './taskStatusUi';
import { SubtaskTree, flattenSubtasks } from './SubtaskList';
import { useSortableRows } from './useSortableRows';

interface TaskEditorModalProps {
    /** When provided, edits this task; otherwise creates a new one. */
    editTask?: Task;
    /** For a new task: what has been written so far, from the list's line. */
    initial?: TaskDraft;
    onClose: () => void;
    onSaved?: () => void | Promise<void>;
}

const PRIORITY_KEY: Record<Priority, string> = {
    none: 'priority.none',
    low: 'priority.low',
    medium: 'priority.medium',
    high: 'priority.high',
    urgent: 'priority.urgent',
};

/** Repeats the engine reads, offered as words; anything else is typed. */
const REPEATS = ['every day', 'every week', 'every month', 'every year'] as const;

/** The properties a click on the line opens, one at a time. */
type Panel = 'status' | 'due' | 'priority' | 'repeat' | 'project' | 'start' | 'scheduled' | 'timer';

/** A day as the property line says it: "Today", "Tomorrow", "Oct 12". */
function dayWord(iso: string, t: Translator): string {
    const today = getTodayString();
    if (iso === today) return t('date.today');
    if (iso === addDays(today, 1)) return t('date.tomorrow');
    if (iso === addDays(today, -1)) return t('date.yesterday');
    return shortDate(iso, today, t);
}

/**
 * The task, opened as a page.
 *
 * At the top, the task's own words, large, with no box around them. Under them,
 * one line of what it is — "○ To do · Oct 31, 15:00 · High · ↻ every week ·
 * Zenith" — where each word is the control for itself: a click opens just that
 * question under the line. What has not been set waits at the end of the line
 * as a faint "+ due", "+ repeat"; what is rarely set (a start, a schedule, a
 * timer) waits there too, and joins the line once it has a value. Then the
 * tags, the note — written in the planner's hand, without a box — the
 * subtasks, live, and the attachments.
 *
 * It replaced a form of fourteen labelled fields, every one of them shown
 * every time, half of them used once a month.
 *
 * Saved by "Save" or Ctrl/⌘+Enter. Escape, the scrim and the ✕ close it — and
 * ask first, when something has been changed and would be lost.
 */
export const TaskEditorModal: FC<TaskEditorModalProps> = ({
    editTask,
    initial,
    onClose,
    onSaved,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);
    const isEdit = !!editTask;
    // A hidden control keeps what it was opened with, so switching a feature
    // off never makes a save clear what that feature wrote.
    const subtasksOn = useFeature('tasks.subtasks');
    const attachmentsOn = useFeature('tasks.attachments');
    const timerOn = useFeature('tasks.timer');
    const projectLinksOn = useFeature('projects.taskLinks');
    const projects = useZenithStore((s) => s.projects);

    // The task as the store has it now, for the subtasks, which are written as
    // they are ticked rather than on Save.
    const live = useZenithStore((s) =>
        editTask ? s.tasks.find((x) => x.id === editTask.id) : undefined
    );

    const [title, setTitle] = useState(editTask?.title ?? initial?.title ?? '');
    const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? 'todo');
    const [priority, setPriority] = useState<Priority>(
        editTask?.priority ?? initial?.priority ?? 'none'
    );
    const [tags, setTags] = useState<string[]>(editTask?.tags ?? []);
    const [tagInput, setTagInput] = useState('');
    const [dueDate, setDueDate] = useState(editTask?.dueDate ?? initial?.dueDate ?? '');
    const [dueTime, setDueTime] = useState(editTask?.dueTime ?? initial?.dueTime ?? '');
    const [dueEndTime, setDueEndTime] = useState(editTask?.dueEndTime ?? initial?.dueEndTime ?? '');
    const [startDate, setStartDate] = useState(editTask?.startDate ?? '');
    const [scheduledDate, setScheduledDate] = useState(editTask?.scheduledDate ?? '');
    const [recurrence, setRecurrence] = useState(editTask?.recurrence ?? initial?.recurrence ?? '');
    const [timerText, setTimerText] = useState(
        editTask?.timerMinutes ? formatDuration(editTask.timerMinutes) : ''
    );
    const [notes, setNotes] = useState(editTask?.description ?? '');
    const [subtasks, setSubtasks] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [panel, setPanel] = useState<Panel | null>(null);
    const tagRef = useRef<HTMLInputElement>(null);

    /**
     * The project comes out of the attachment list and into a property of its
     * own. Split once, at mount: while this sheet is open the project is a
     * choice, and leaving its link in the attachment list below would be one
     * fact with two controls.
     */
    const [split] = useState(() => splitProjectLink(editTask?.attachments ?? [], projects));
    const [attachments, setAttachments] = useState<TaskAttachment[]>(split.rest);
    const [projectPath, setProjectPath] = useState(split.project?.filePath ?? '');

    /**
     * The projects worth offering, by name — alphabetical, because this is
     * searched, not read. Archived ones are left out, except the one this task
     * is already in: a choice whose current value is missing from its own
     * options would quietly move the task on save.
     */
    const projectOptions = useMemo(
        () =>
            projects
                .filter((p) => p.status !== 'archived' || p.filePath === projectPath)
                .sort((a, b) => a.title.localeCompare(b.title)),
        [projects, projectPath]
    );

    // Existing tags by use, for the suggestions.
    const tagCounts = useMemo(() => {
        const counts = new Map<string, number>();
        tasks.forEach((x) => x.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }, [tasks]);

    const tagSuggestions = useMemo(() => {
        const q = tagInput.trim().replace(/^#/, '').toLowerCase();
        return tagCounts
            .map(([tag]) => tag)
            .filter((tag) => !tags.includes(tag) && (!q || tag.toLowerCase().includes(q)))
            .slice(0, 6);
    }, [tagCounts, tagInput, tags]);

    const addTag = (tag: string) => {
        const clean = tag.replace(/^#/, '').trim();
        if (clean && !tags.includes(clean)) setTags([...tags, clean]);
        setTagInput('');
        tagRef.current?.focus();
    };

    // ── What has changed ─────────────────────────────

    const snapshot = () =>
        JSON.stringify([
            title.trim(),
            status,
            priority,
            tags,
            dueDate,
            dueTime,
            dueEndTime,
            startDate,
            scheduledDate,
            recurrence.trim(),
            timerText.trim(),
            notes.trim(),
            subtasks.filter((s) => s.trim()),
            attachments,
            projectPath,
        ]);
    const [opened] = useState(snapshot);
    const dirty = snapshot() !== opened;

    const requestClose = async () => {
        if (!dirty || submitting) {
            onClose();
            return;
        }
        const discard = await new ConfirmModal(app, {
            title: t('tasks.editor.discardTitle'),
            body: t('tasks.editor.discardBody'),
            confirmText: t('tasks.editor.discard'),
            cancelText: t('tasks.editor.keepEditing'),
        }).ask();
        if (discard) onClose();
    };

    // ── Saving ───────────────────────────────────────

    const handleSubmit = async () => {
        const trimmed = title.trim();
        if (!trimmed || submitting) {
            if (!trimmed) new Notice(t('tasks.error.titleRequired'));
            return;
        }

        const input = {
            title: trimmed,
            status,
            priority,
            tags,
            dueDate: dueDate || undefined,
            // An hour with no day is an hour of nothing in particular, so it is
            // dropped rather than written against a date that isn't there. The
            // end follows the start for the same reason — and the writer drops
            // it again if it isn't actually later.
            dueTime: dueDate ? normalizeTimeOfDay(dueTime) : undefined,
            dueEndTime: dueDate && dueTime ? normalizeTimeOfDay(dueEndTime) : undefined,
            timerMinutes: parseDuration(timerText),
            // No `spentMinutes`: time already spent belongs to the timer, and a
            // field this sheet does not own is one its save leaves alone.
            startDate: startDate || undefined,
            scheduledDate: scheduledDate || undefined,
            recurrence: recurrence.trim() || undefined,
            subtasks: isEdit ? undefined : subtasks.filter((s) => s.trim()),
        };
        // The chosen project goes back in beside the attachments the user
        // keeps for their own reasons; `withProjectLink` rewrites only the
        // one line that ever named a project.
        const details: TaskDetails = {
            description: notes.trim(),
            attachments: withProjectLink(
                attachments,
                projects.find((p) => p.filePath === projectPath)
            ),
        };

        setSubmitting(true);
        try {
            const writer = new TaskWriter(app);
            if (isEdit && editTask) {
                const ok = await writer.updateTaskInFile(
                    editTask.filePath,
                    editTask.lineNumber,
                    // Only what the user changed is written, so the rest of the
                    // line stays as it was — including what this sheet has no
                    // control for.
                    diffTaskFields(editTask, input),
                    // The title as it was when the sheet opened, not the one
                    // being saved: the check is that the line is still the
                    // task the user opened, and renaming it is the commonest
                    // edit there is.
                    editTask.title,
                    details
                );
                // Status last, and against the new title: marking done may
                // insert the next occurrence above, which moves the line.
                const settled =
                    ok &&
                    (status === editTask.status ||
                        (await writer.setStatusInFile(
                            editTask.filePath,
                            editTask.lineNumber,
                            status,
                            trimmed
                        )));
                if (!settled) {
                    new Notice(t('tasks.error.update'));
                    return;
                }
            } else {
                // With journal capture on this is today's daily note; otherwise
                // null, and the writer falls back to the tasks inbox.
                const target = await resolveTaskTarget(app, settings);
                await writer.addTask(settings.tasksFolderPath, input, target, details);
            }
            await onSaved?.();
            onClose();
        } catch (err) {
            console.error('Zenith: failed to save task:', err);
            new Notice(t('tasks.error.save'));
        } finally {
            setSubmitting(false);
        }
    };

    // ── The live subtasks of a task being edited ─────

    const liveSubs = useMemo(() => live?.subtasks ?? editTask?.subtasks ?? [], [live, editTask]);
    const subtaskRows = useMemo(
        () => (editTask ? flattenSubtasks(liveSubs, editTask.filePath) : []),
        [liveSubs, editTask]
    );
    // Ticking and adding only: putting subtasks in order is the list's to do.
    const subtaskSortable = useSortableRows({
        rows: subtaskRows,
        onMove: async () => {},
        disabled: true,
    });
    const [addSubSignal, setAddSubSignal] = useState(0);

    // ── The property line ────────────────────────────

    const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
    const today = getTodayString();

    const dueText = dueDate
        ? [dayWord(dueDate, t), dueTime && (dueEndTime ? `${dueTime}–${dueEndTime}` : dueTime)]
              .filter(Boolean)
              .join(', ')
        : '';
    const projectName = projects.find((p) => p.filePath === projectPath)?.title ?? '';
    const overdue = !!dueDate && dueDate < today && status !== 'done' && status !== 'cancelled';

    interface Prop {
        id: Panel;
        text: string;
        set: boolean;
        danger?: boolean;
    }
    const props: Prop[] = [
        { id: 'status', text: t(STATUS_I18N[status]), set: true },
        { id: 'due', text: dueText || t('tasks.editor.add.due'), set: !!dueDate, danger: overdue },
        {
            id: 'priority',
            text: priority === 'none' ? t('tasks.editor.add.priority') : t(PRIORITY_KEY[priority]),
            set: priority !== 'none',
            danger: priority === 'urgent',
        },
        {
            id: 'repeat',
            text: recurrence.trim() ? `↻ ${recurrence.trim()}` : t('tasks.editor.add.repeat'),
            set: !!recurrence.trim(),
        },
        ...(projectLinksOn
            ? [
                  {
                      id: 'project' as const,
                      text: projectName || t('tasks.editor.add.project'),
                      set: !!projectName,
                  },
              ]
            : []),
        {
            id: 'start',
            text: startDate
                ? t('tasks.editor.startOn', { date: dayWord(startDate, t) })
                : t('tasks.editor.add.start'),
            set: !!startDate,
        },
        {
            id: 'scheduled',
            text: scheduledDate
                ? t('tasks.editor.scheduledOn', { date: dayWord(scheduledDate, t) })
                : t('tasks.editor.add.scheduled'),
            set: !!scheduledDate,
        },
        ...(timerOn
            ? [
                  {
                      id: 'timer' as const,
                      text: timerText.trim()
                          ? `⏲ ${timerText.trim()}`
                          : t('tasks.editor.add.timer'),
                      set: !!timerText.trim(),
                  },
              ]
            : []),
    ];
    // What is set reads as a sentence first; what is not waits at the end.
    const shownProps = [...props.filter((p) => p.set), ...props.filter((p) => !p.set)];

    const choice = (active: boolean, label: React.ReactNode, onPick: () => void, key: string) => (
        <button
            key={key}
            type="button"
            className={`zenith-tsheet__choice ${active ? 'is-on' : ''}`}
            aria-pressed={active}
            onClick={onPick}
        >
            {label}
        </button>
    );

    const renderPanel = (): React.ReactNode => {
        switch (panel) {
            case 'status':
                return (
                    <div className="zenith-tsheet__choices">
                        {TASK_STATUSES.map((s) =>
                            choice(
                                s === status,
                                <>
                                    <StatusBox status={s} size={14} />
                                    {t(STATUS_I18N[s])}
                                </>,
                                () => {
                                    setStatus(s);
                                    setPanel(null);
                                },
                                s
                            )
                        )}
                    </div>
                );
            case 'due':
                return (
                    <>
                        <div className="zenith-tsheet__choices">
                            {choice(
                                dueDate === today,
                                t('date.today'),
                                () => setDueDate(today),
                                'today'
                            )}
                            {choice(
                                dueDate === addDays(today, 1),
                                t('date.tomorrow'),
                                () => setDueDate(addDays(today, 1)),
                                'tomorrow'
                            )}
                            {choice(
                                dueDate === addDays(today, 7),
                                t('tasks.editor.inAWeek'),
                                () => setDueDate(addDays(today, 7)),
                                'week'
                            )}
                            {dueDate &&
                                choice(
                                    false,
                                    t('tasks.menu.nodate'),
                                    () => {
                                        setDueDate('');
                                        setDueTime('');
                                        setDueEndTime('');
                                    },
                                    'clear'
                                )}
                        </div>
                        <div className="zenith-tsheet__fields">
                            <DateField
                                className="zenith-tsheet__field"
                                aria-label={t('tasks.editor.due')}
                                value={dueDate}
                                onChange={setDueDate}
                            />
                            <TimeField
                                className="zenith-tsheet__field is-time"
                                aria-label={t('tasks.editor.dueTime')}
                                value={dueTime}
                                disabled={!dueDate}
                                title={!dueDate ? t('tasks.editor.dueTimeHint') : undefined}
                                onChange={setDueTime}
                            />
                            <span className="zenith-tsheet__dash" aria-hidden="true">
                                –
                            </span>
                            <TimeField
                                className="zenith-tsheet__field is-time"
                                aria-label={t('tasks.editor.dueEndTime')}
                                value={dueEndTime}
                                disabled={!dueDate || !dueTime}
                                title={!dueTime ? t('tasks.editor.dueEndTimeHint') : undefined}
                                onChange={setDueEndTime}
                            />
                        </div>
                    </>
                );
            case 'priority':
                return (
                    <div className="zenith-tsheet__choices">
                        {PRIORITIES.map((p) =>
                            choice(
                                p === priority,
                                <span className={`zenith-tsheet__prio is-p-${p}`}>
                                    {t(PRIORITY_KEY[p])}
                                </span>,
                                () => {
                                    setPriority(p);
                                    setPanel(null);
                                },
                                p
                            )
                        )}
                    </div>
                );
            case 'repeat':
                return (
                    <>
                        <div className="zenith-tsheet__choices">
                            {REPEATS.map((rule) =>
                                choice(
                                    recurrence.trim() === rule,
                                    t(`tasks.editor.repeat.${rule.split(' ')[1]}`),
                                    () => setRecurrence(rule),
                                    rule
                                )
                            )}
                            {recurrence.trim() &&
                                choice(
                                    false,
                                    t('tasks.editor.repeat.none'),
                                    () => setRecurrence(''),
                                    'none'
                                )}
                        </div>
                        <input
                            className="zenith-input zenith-tsheet__field is-wide"
                            placeholder={t('tasks.editor.recurrencePlaceholder')}
                            aria-label={t('tasks.editor.recurrence')}
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value)}
                        />
                        {recurrence.trim() && !isRecurrenceUnderstood(recurrence) && (
                            <span className="zenith-field__hint">
                                {t('tasks.editor.recurrenceUnread')}
                            </span>
                        )}
                    </>
                );
            case 'project':
                return (
                    <div className="zenith-tsheet__choices">
                        {choice(
                            !projectPath,
                            t('tasks.editor.project.none'),
                            () => setProjectPath(''),
                            '·none'
                        )}
                        {projectOptions.map((p) =>
                            choice(
                                p.filePath === projectPath,
                                p.title,
                                () => setProjectPath(p.filePath),
                                p.filePath
                            )
                        )}
                    </div>
                );
            case 'start':
            case 'scheduled': {
                const value = panel === 'start' ? startDate : scheduledDate;
                const set = panel === 'start' ? setStartDate : setScheduledDate;
                return (
                    <div className="zenith-tsheet__fields">
                        <DateField
                            className="zenith-tsheet__field"
                            aria-label={t(
                                panel === 'start' ? 'tasks.editor.start' : 'tasks.editor.scheduled'
                            )}
                            value={value}
                            onChange={set}
                        />
                    </div>
                );
            }
            case 'timer':
                return (
                    <input
                        className="zenith-input zenith-tsheet__field"
                        placeholder={t('tasks.editor.timerPlaceholder')}
                        aria-label={t('tasks.editor.timer')}
                        value={timerText}
                        onChange={(e) => setTimerText(e.target.value)}
                    />
                );
            default:
                return null;
        }
    };

    const footer = (
        <>
            <span className="zenith-tsheet__keys" aria-hidden="true">
                {t('tasks.editor.saveKeys')}
            </span>
            <button
                type="button"
                className="zenith-tsheet__cancel"
                onClick={() => void requestClose()}
            >
                {t('common.cancel')}
            </button>
            <button
                type="button"
                className="zenith-btn zenith-btn--primary zenith-tsheet__save"
                onClick={() => void handleSubmit()}
                disabled={!title.trim() || submitting}
            >
                {submitting
                    ? t(isEdit ? 'tasks.editor.saving' : 'tasks.editor.creating')
                    : t(isEdit ? 'common.save' : 'common.create')}
            </button>
        </>
    );

    return (
        <Modal
            title={t(isEdit ? 'tasks.editor.editTask' : 'tasks.editor.newTask')}
            header={null}
            onClose={() => void requestClose()}
            size="md"
            className="zenith-tsheet-dialog"
            footer={footer}
        >
            <div
                className="zenith-tsheet"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleSubmit();
                    }
                }}
            >
                <span className="zenith-tsheet__kicker">
                    {t(isEdit ? 'tasks.editor.editTask' : 'tasks.editor.newTask')}
                </span>
                <textarea
                    className="zenith-tsheet__title"
                    placeholder={t('tasks.editor.descriptionPlaceholder')}
                    aria-label={t('tasks.editor.description')}
                    value={title}
                    rows={1}
                    autoFocus={!isEdit}
                    onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
                    onKeyDown={(e) => {
                        // A task is one line of a note: Enter is not a new line here.
                        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) e.preventDefault();
                    }}
                />

                {/* The property line: each word is its own control. */}
                <div
                    className="zenith-tsheet__props"
                    role="group"
                    aria-label={t('tasks.editor.properties')}
                >
                    {shownProps.map((p, i) => (
                        <React.Fragment key={p.id}>
                            {i > 0 && p.set && (
                                <span className="zenith-tsheet__sep" aria-hidden="true">
                                    ·
                                </span>
                            )}
                            <button
                                type="button"
                                className={[
                                    'zenith-tsheet__prop',
                                    p.set ? 'is-set' : 'is-unset',
                                    panel === p.id ? 'is-open' : '',
                                    p.danger ? 'is-danger' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                aria-expanded={panel === p.id}
                                onClick={() => toggle(p.id)}
                            >
                                {p.id === 'status' && <StatusBox status={status} size={14} />}
                                {p.set ? p.text : `+ ${p.text}`}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                {panel && (
                    <div className="zenith-tsheet__panel" key={panel}>
                        {renderPanel()}
                    </div>
                )}

                {/* Tags: each a word that can be taken away; a new one typed in place. */}
                <div className="zenith-tsheet__tags" onClick={() => tagRef.current?.focus()}>
                    {tags.map((tag) => (
                        <span key={tag} className="zenith-tagchip">
                            <span className="zenith-tagchip__text">#{tag}</span>
                            <button
                                type="button"
                                className="zenith-tagchip__remove"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setTags(tags.filter((x) => x !== tag));
                                }}
                                aria-label={t('tasks.editor.removeTag', { name: tag })}
                                title={t('tasks.editor.removeTag', { name: tag })}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                    <input
                        ref={tagRef}
                        className="zenith-tsheet__tag-input"
                        placeholder={
                            tags.length
                                ? t('tasks.editor.tagMore')
                                : t('tasks.editor.tagPlaceholder')
                        }
                        aria-label={t('tasks.editor.tags')}
                        value={tagInput}
                        onChange={(e) => {
                            // A space or a comma finishes a tag: tags have neither.
                            const v = e.target.value;
                            if (/[\s,]$/.test(v) && v.trim()) addTag(v.trim().replace(/,$/, ''));
                            else setTagInput(v);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && tagInput.trim()) {
                                e.preventDefault();
                                addTag(tagInput);
                            } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                                setTags(tags.slice(0, -1));
                            }
                        }}
                    />
                </div>
                {tagSuggestions.length > 0 && (
                    <div
                        className="zenith-tsheet__suggest"
                        role="group"
                        aria-label={t('tasks.quickAdd.tagSuggestions')}
                    >
                        {tagSuggestions.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className="zenith-tsheet__suggest-item"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => addTag(tag)}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}

                <textarea
                    className="zenith-tsheet__note"
                    placeholder={t('tasks.editor.notesPlaceholder')}
                    aria-label={t('tasks.editor.notes')}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />

                {subtasksOn && (
                    <section className="zenith-tsheet__section">
                        <h3 className="zenith-tsheet__heading">{t('tasks.editor.subtasks')}</h3>
                        {isEdit && editTask ? (
                            // Live: ticked and added straight into the note, as in the list.
                            <div className="zenith-tsheet__tree">
                                <SubtaskTree
                                    filePath={editTask.filePath}
                                    parentLine={editTask.lineNumber}
                                    subtasks={liveSubs}
                                    sortable={subtaskSortable}
                                    openAdd={addSubSignal}
                                    reorderable={false}
                                />
                                <button
                                    type="button"
                                    className="zenith-tsheet__add"
                                    onClick={() => setAddSubSignal((n) => n + 1)}
                                >
                                    <Plus size={13} /> {t('tasks.subtask.add')}
                                </button>
                            </div>
                        ) : (
                            <>
                                {subtasks.map((s, i) => (
                                    <div key={i} className="zenith-tsheet__sub">
                                        <StatusBox status="todo" size={14} />
                                        <input
                                            className="zenith-tsheet__sub-input"
                                            placeholder={t('tasks.subtask.placeholder')}
                                            value={s}
                                            autoFocus={i === subtasks.length - 1 && !s}
                                            onChange={(e) => {
                                                const next = [...subtasks];
                                                next[i] = e.target.value;
                                                setSubtasks(next);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                                    e.preventDefault();
                                                    setSubtasks([...subtasks, '']);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="zenith-tsheet__sub-remove"
                                            onClick={() =>
                                                setSubtasks(subtasks.filter((_, j) => j !== i))
                                            }
                                            aria-label={t('common.remove')}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="zenith-tsheet__add"
                                    onClick={() => setSubtasks([...subtasks, ''])}
                                >
                                    <Plus size={13} /> {t('tasks.subtask.add')}
                                </button>
                            </>
                        )}
                    </section>
                )}

                {attachmentsOn && (
                    <section className="zenith-tsheet__section">
                        <AttachmentField value={attachments} onChange={setAttachments} />
                    </section>
                )}
            </div>
        </Modal>
    );
};
