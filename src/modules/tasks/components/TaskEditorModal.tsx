import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { X, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { PRIORITIES, TASK_STATUSES } from '../../../core/constants';
import type { Priority, TaskStatus } from '../../../core/constants';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../services/taskWriter';
import { useFeature } from '../../../core/useFeature';
import { resolveTaskTarget } from '../services/taskTarget';
import {
    diffTaskFields,
    formatDuration,
    normalizeTimeOfDay,
    parseDuration,
} from '../services/taskFormat';
import type { TaskAttachment, TaskDetails } from '../services/taskDetails';
import { AttachmentField } from './AttachmentField';
import { splitProjectLink, withProjectLink } from '../../projects/services/projectLink';
import { Modal } from '../../../components/shared/Modal';
import { DateField, Dropdown, TimeField } from '../../../components/ui/fields';
import { useTranslation } from '../../../core/i18n';

interface TaskEditorModalProps {
    /** When provided, edits this task; otherwise creates a new one. */
    editTask?: Task;
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

const STATUS_KEY: Record<TaskStatus, string> = {
    todo: 'status.todo',
    'in-progress': 'status.inProgress',
    done: 'status.done',
    cancelled: 'status.cancelled',
};

/**
 * TaskEditorModal — full task editor (status, priority, tags with autocomplete,
 * due/start/scheduled dates, recurrence, subtasks). Subtasks can be added on
 * create only.
 *
 * Built on the shared {@link Modal} shell, which brings Escape, the scrim, a
 * focus trap, scroll locking and the mobile bottom-sheet layout. It used to
 * carry its own overlay and panel CSS under the generic `.zenith-modal` name —
 * the same name the shared shell wanted, which is what once pinned that shell
 * to a 520px card in the corner.
 */
export const TaskEditorModal: FC<TaskEditorModalProps> = ({ editTask, onClose, onSaved }) => {
    const { app } = useApp();
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);
    const isEdit = !!editTask;
    // A hidden field keeps what it was opened with, so switching a feature off
    // never makes a save clear what that feature wrote.
    const subtasksOn = useFeature('tasks.subtasks');
    const attachmentsOn = useFeature('tasks.attachments');
    const timerOn = useFeature('tasks.timer');
    const projectLinksOn = useFeature('projects.taskLinks');

    const [title, setTitle] = useState(editTask?.title ?? '');
    const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? 'todo');
    const [priority, setPriority] = useState<Priority>(editTask?.priority ?? 'none');
    const [tags, setTags] = useState<string[]>(editTask?.tags ?? []);
    const [tagInput, setTagInput] = useState('');
    const [tagFocus, setTagFocus] = useState(false);
    const [dueDate, setDueDate] = useState(editTask?.dueDate ?? '');
    const [startDate, setStartDate] = useState(editTask?.startDate ?? '');
    const [scheduledDate, setScheduledDate] = useState(editTask?.scheduledDate ?? '');
    const [recurrence, setRecurrence] = useState(editTask?.recurrence ?? '');
    const [subtasks, setSubtasks] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [dueTime, setDueTime] = useState(editTask?.dueTime ?? '');
    const [dueEndTime, setDueEndTime] = useState(editTask?.dueEndTime ?? '');
    const [timerText, setTimerText] = useState(
        editTask?.timerMinutes ? formatDuration(editTask.timerMinutes) : ''
    );
    const [notes, setNotes] = useState(editTask?.description ?? '');
    const projects = useZenithStore((s) => s.projects);

    /**
     * The project comes out of the attachment list and into a field of its own.
     *
     * Split once, at mount, rather than on every render: while this dialog is
     * open the project is a choice in a select, and leaving its link in the
     * attachment list below would be one fact with two controls — with nothing
     * to stop somebody changing it in one of them and saving the other.
     */
    const [initial] = useState(() => splitProjectLink(editTask?.attachments ?? [], projects));
    const [attachments, setAttachments] = useState<TaskAttachment[]>(initial.rest);
    const [projectPath, setProjectPath] = useState(initial.project?.filePath ?? '');

    /**
     * The projects worth offering, by name.
     *
     * Alphabetical rather than by deadline: the grid and the widget sort by
     * what is most urgent because they are being read, and this is being
     * searched — you arrive knowing the name.
     *
     * Archived ones are left out, because a shelved project is not where a new
     * task goes. Except the one this task is already in: a select whose
     * current value is missing from its own options does not show nothing, it
     * shows the first option — and would quietly move the task on save.
     */
    const projectOptions = useMemo(
        () =>
            projects
                .filter((p) => p.status !== 'archived' || p.filePath === projectPath)
                .sort((a, b) => a.title.localeCompare(b.title)),
        [projects, projectPath]
    );

    // Existing tags with usage counts, for the autocomplete.
    const tagCounts = useMemo(() => {
        const counts = new Map<string, number>();
        tasks.forEach((t) => t.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
        return Array.from(counts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    }, [tasks]);

    const tagSuggestions = useMemo(() => {
        const q = tagInput.trim().toLowerCase();
        return tagCounts
            .filter((t) => !tags.includes(t.tag) && (!q || t.tag.toLowerCase().includes(q)))
            .slice(0, 8);
    }, [tagCounts, tagInput, tags]);

    const addTag = (tag: string) => {
        const clean = tag.replace(/^#/, '').trim();
        if (clean && !tags.includes(clean)) setTags([...tags, clean]);
        setTagInput('');
    };

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
            // field this form does not own is one its save leaves alone.
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
                    // Only what the user changed in the dialog is written, so
                    // the rest of the line stays as it was — including what
                    // the dialog has no field for.
                    diffTaskFields(editTask, input),
                    // The title as it was when the dialog opened, not the one
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

    const footer = (
        <>
            <button className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
            </button>
            <button
                className="zenith-btn zenith-btn--primary"
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
            onClose={onClose}
            size="md"
            footer={footer}
        >
            <div className="zenith-form">
                {/* Description */}
                <div className="zenith-field">
                    <label className="zenith-field__label">{t('tasks.editor.description')}</label>
                    <input
                        className="zenith-input zenith-field__input"
                        placeholder={t('tasks.editor.descriptionPlaceholder')}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className="zenith-form__grid">
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.status')}</label>
                        <Dropdown
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.status')}
                            value={status}
                            options={TASK_STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))}
                            onChange={(v) => setStatus(v as TaskStatus)}
                        />
                    </div>
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.priority')}</label>
                        <Dropdown
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.priority')}
                            value={priority}
                            options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_KEY[p]) }))}
                            onChange={(v) => setPriority(v as Priority)}
                        />
                    </div>
                </div>

                {/* Which project this belongs to.
                    A select over the projects that exist rather than a path to
                    type: attaching a note already worked here, but only by
                    writing "20 Projects/Flat Move" out by hand, which is both
                    the slowest way to say it and the only one that can be
                    misspelt. Saved as a link in the task's detail block, so the
                    task's own text stays what the user wrote. */}
                {projectLinksOn && (
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="zenith-task-project">
                            {t('tasks.editor.project')}
                        </label>
                        <Dropdown
                            id="zenith-task-project"
                            className="zenith-input zenith-field__input"
                            value={projectPath}
                            options={[
                                { value: '', label: t('tasks.editor.project.none') },
                                ...projectOptions.map((p) => ({
                                    value: p.filePath,
                                    label: p.title,
                                })),
                            ]}
                            onChange={setProjectPath}
                        />
                    </div>
                )}

                {/* Tags */}
                <div className="zenith-field">
                    <label className="zenith-field__label">{t('tasks.editor.tags')}</label>
                    {tags.length > 0 && (
                        <div className="zenith-tagchips">
                            {tags.map((tag) => (
                                <span key={tag} className="zenith-tagchip">
                                    #{tag}
                                    <button
                                        onClick={() => setTags(tags.filter((x) => x !== tag))}
                                        aria-label={t('common.remove')}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="zenith-autocomplete">
                        <input
                            className="zenith-input zenith-field__input"
                            placeholder={t('tasks.editor.tagPlaceholder')}
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onFocus={() => setTagFocus(true)}
                            onBlur={() => window.setTimeout(() => setTagFocus(false), 150)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && tagInput.trim()) {
                                    e.preventDefault();
                                    addTag(tagInput);
                                }
                            }}
                        />
                        {tagFocus && tagSuggestions.length > 0 && (
                            <div className="zenith-autocomplete__menu">
                                {tagSuggestions.map((s) => (
                                    <button
                                        key={s.tag}
                                        className="zenith-autocomplete__item"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => addTag(s.tag)}
                                    >
                                        <span>#{s.tag}</span>
                                        <span className="zenith-autocomplete__count">
                                            {s.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="zenith-field">
                    <label className="zenith-field__label">{t('tasks.editor.notes')}</label>
                    <textarea
                        className="zenith-input zenith-field__input zenith-field__textarea"
                        placeholder={t('tasks.editor.notesPlaceholder')}
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>

                {attachmentsOn && <AttachmentField value={attachments} onChange={setAttachments} />}

                <div className="zenith-form__grid">
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.due')}</label>
                        <DateField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.due')}
                            value={dueDate}
                            onChange={setDueDate}
                        />
                    </div>
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.dueTime')}</label>
                        <TimeField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.dueTime')}
                            value={dueTime}
                            // Without a day, an hour has nothing to be due on.
                            disabled={!dueDate}
                            title={!dueDate ? t('tasks.editor.dueTimeHint') : undefined}
                            onChange={setDueTime}
                        />
                    </div>
                    <div className="zenith-field">
                        <label className="zenith-field__label">
                            {t('tasks.editor.dueEndTime')}
                        </label>
                        <TimeField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.dueEndTime')}
                            value={dueEndTime}
                            // An end with no start is not a range, it's a second
                            // deadline nobody asked for.
                            disabled={!dueDate || !dueTime}
                            title={!dueTime ? t('tasks.editor.dueEndTimeHint') : undefined}
                            onChange={setDueEndTime}
                        />
                    </div>
                    {timerOn && (
                        <div className="zenith-field">
                            <label className="zenith-field__label">
                                {t('tasks.editor.timer')}
                            </label>
                            <input
                                className="zenith-input zenith-field__input"
                                placeholder={t('tasks.editor.timerPlaceholder')}
                                value={timerText}
                                onChange={(e) => setTimerText(e.target.value)}
                            />
                        </div>
                    )}
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.start')}</label>
                        <DateField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.start')}
                            value={startDate}
                            onChange={setStartDate}
                        />
                    </div>
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.scheduled')}</label>
                        <DateField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.scheduled')}
                            value={scheduledDate}
                            onChange={setScheduledDate}
                        />
                    </div>
                </div>

                <div className="zenith-field">
                    <label className="zenith-field__label">{t('tasks.editor.recurrence')}</label>
                    <input
                        className="zenith-input zenith-field__input"
                        placeholder={t('tasks.editor.recurrencePlaceholder')}
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value)}
                    />
                </div>

                {/* Subtasks — create only */}
                {!isEdit && subtasksOn && (
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.subtasks')}</label>
                        {subtasks.map((s, i) => (
                            <div key={i} className="zenith-subtask-row">
                                <input
                                    className="zenith-input zenith-field__input"
                                    placeholder={t('tasks.subtask.placeholder')}
                                    value={s}
                                    onChange={(e) => {
                                        const next = [...subtasks];
                                        next[i] = e.target.value;
                                        setSubtasks(next);
                                    }}
                                />
                                <button
                                    className="zenith-icon-ghost"
                                    onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                                    aria-label={t('common.remove')}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        <button
                            className="zenith-add-row"
                            onClick={() => setSubtasks([...subtasks, ''])}
                        >
                            <Plus size={14} /> {t('tasks.subtask.add')}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
};
