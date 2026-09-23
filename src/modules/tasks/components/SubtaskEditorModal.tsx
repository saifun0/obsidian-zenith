import React, { useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import type { SubTask } from '../../../store/taskSlice';
import { TaskWriter } from '../services/taskWriter';
import { formatDuration, normalizeTimeOfDay, parseDuration } from '../services/taskFormat';
import type { TaskAttachment, TaskDetails } from '../services/taskDetails';
import { AttachmentField } from './AttachmentField';
import { Modal } from '../../../components/shared/Modal';
import { TimeField } from '../../../components/ui/fields';

/**
 * The same four extras a task has, on a subtask.
 *
 * A separate modal from the task editor rather than a shared one, because a
 * subtask genuinely has less: no status dropdown (its checkbox is right there),
 * no priority, no tags, no recurrence, and no subtasks of its own to seed. What
 * it does have is a title, an hour, a countdown, notes and attachments — and
 * those are written by exactly the same writer, into exactly the same shapes.
 *
 * The day a subtask is due is deliberately absent: it belongs to the task, and a
 * subtask with its own date is a task that has been filed in the wrong place.
 * An hour, though, is a time within the day the task already carries.
 */

interface SubtaskEditorModalProps {
    filePath: string;
    subtask: SubTask;
    onClose: () => void;
    onSaved?: () => void | Promise<void>;
}

export const SubtaskEditorModal: FC<SubtaskEditorModalProps> = ({
    filePath,
    subtask,
    onClose,
    onSaved,
}) => {
    const t = useTranslation();
    const { app } = useApp();

    const [title, setTitle] = useState(subtask.title);
    const [dueTime, setDueTime] = useState(subtask.dueTime ?? '');
    const [dueEndTime, setDueEndTime] = useState(subtask.dueEndTime ?? '');
    const [timerText, setTimerText] = useState(
        subtask.timerMinutes ? formatDuration(subtask.timerMinutes) : ''
    );
    const [notes, setNotes] = useState(subtask.description ?? '');
    const [attachments, setAttachments] = useState<TaskAttachment[]>(subtask.attachments ?? []);
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        const trimmed = title.trim();
        if (!trimmed || submitting) {
            if (!trimmed) new Notice(t('tasks.error.titleRequired'));
            return;
        }

        setSubmitting(true);
        try {
            const writer = new TaskWriter(app);
            const details: TaskDetails = { description: notes.trim(), attachments };
            // The line is rewritten from its own parsed fields plus the two the
            // form owns, so anything else on it — a tag, a marker this plugin
            // doesn't know — survives being edited here.
            const ok = await writer.updateLineExtras(filePath, subtask.lineNumber, {
                title: trimmed,
                dueTime: normalizeTimeOfDay(dueTime),
                dueEndTime: dueTime ? normalizeTimeOfDay(dueEndTime) : undefined,
                timerMinutes: parseDuration(timerText),
                details,
            });
            if (!ok) {
                new Notice(t('tasks.error.update'));
                return;
            }
            await onSaved?.();
            onClose();
        } catch (err) {
            console.error('Zenith: failed to save subtask:', err);
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
                onClick={submit}
                disabled={!title.trim() || submitting}
            >
                {submitting ? t('tasks.editor.saving') : t('common.save')}
            </button>
        </>
    );

    return (
        <Modal title={t('tasks.editor.editSubtask')} onClose={onClose} size="md" footer={footer}>
            <div className="zenith-form">
                <div className="zenith-field">
                    <label className="zenith-field__label">{t('tasks.editor.description')}</label>
                    <input
                        className="zenith-input zenith-field__input"
                        placeholder={t('tasks.subtask.placeholder')}
                        value={title}
                        autoFocus
                        onChange={(e) => setTitle(e.target.value)}
                    />
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

                <AttachmentField value={attachments} onChange={setAttachments} />

                <div className="zenith-form__grid">
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.dueTime')}</label>
                        <TimeField
                            className="zenith-input zenith-field__input"
                            aria-label={t('tasks.editor.dueTime')}
                            value={dueTime}
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
                            disabled={!dueTime}
                            title={!dueTime ? t('tasks.editor.dueEndTimeHint') : undefined}
                            onChange={setDueEndTime}
                        />
                    </div>
                    <div className="zenith-field">
                        <label className="zenith-field__label">{t('tasks.editor.timer')}</label>
                        <input
                            className="zenith-input zenith-field__input"
                            placeholder={t('tasks.editor.timerPlaceholder')}
                            value={timerText}
                            onChange={(e) => setTimerText(e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
