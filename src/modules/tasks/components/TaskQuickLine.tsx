import React, { forwardRef, useMemo, useState } from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { getTodayString } from '../../../core/dateUtils';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../services/taskWriter';
import { resolveTaskTarget } from '../services/taskTarget';
import { quickParse, type QuickParse } from '../services/quickParse';
import { marginText } from '../services/taskMargin';
import { StatusBox } from './taskStatusUi';

/** What the line hands the full editor when asked for more than a line. */
export interface TaskDraft {
    title: string;
    dueDate?: string;
    dueTime?: string;
    dueEndTime?: string;
    priority?: Task['priority'];
    recurrence?: string;
}

export function draftOf(text: string, parsed: QuickParse | null): TaskDraft {
    if (!parsed) return { title: text.trim() };
    return {
        title: parsed.title.trim(),
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        dueEndTime: parsed.dueEndTime,
        priority: parsed.priority,
        recurrence: parsed.recurrence,
    };
}

interface TaskQuickLineProps {
    /** Shift+Enter: the line so far, in the full editor. */
    onExpand: (draft: TaskDraft) => void;
}

/**
 * A task is written the way it is in a paper planner: on the next empty line.
 *
 * The line sits at the top of the list in the list's own grid — a circle, and
 * the margin to its left — and reads the phrase as it is typed: "завтра 15:00"
 * turns up in the margin, where the row will show it, before the task exists.
 * Tapping what the margin says takes the reading back, for the day the words
 * meant something else. Enter writes it and leaves the line ready for the
 * next; Shift+Enter opens the full editor with what has been typed.
 */
export const TaskQuickLine = forwardRef<HTMLInputElement, TaskQuickLineProps>(
    ({ onExpand }, ref) => {
        const { app, plugin } = useApp();
        const t = useTranslation();
        const settings = useZenithStore((s) => s.settings);
        const natural = useFeature('tasks.naturalInput');
        const [text, setText] = useState('');
        const [literal, setLiteral] = useState(false);
        const [busy, setBusy] = useState(false);

        const today = getTodayString();
        const parsed = useMemo(
            () => (natural && !literal && text.trim() ? quickParse(text, today) : null),
            [natural, literal, text, today]
        );
        const draft = draftOf(text, parsed);
        const preview = parsed?.dueDate
            ? marginText(
                  { ...EMPTY, dueDate: parsed.dueDate, dueTime: parsed.dueTime } as Task,
                  today,
                  t,
                  false
              ).text
            : '';
        const urgent = draft.priority === 'urgent';

        const submit = async () => {
            if (busy || !draft.title) return;
            setBusy(true);
            try {
                const target = await resolveTaskTarget(app, settings);
                await new TaskWriter(app).addTask(
                    settings.tasksFolderPath,
                    {
                        title: draft.title,
                        priority: draft.priority ?? 'none',
                        dueDate: draft.dueDate,
                        dueTime: draft.dueDate ? draft.dueTime : undefined,
                        dueEndTime: draft.dueDate ? draft.dueEndTime : undefined,
                        recurrence: draft.recurrence,
                        tags: [],
                    },
                    target
                );
                setText('');
                setLiteral(false);
                void plugin.dataService.reloadTasks();
            } catch (err) {
                console.error('Zenith: failed to add task:', err);
                new Notice(t('notice.taskAddFailed'));
            } finally {
                setBusy(false);
            }
        };

        return (
            <div className={`zenith-trow zenith-tquick ${text ? 'is-typing' : ''}`}>
                <div className="zenith-trow__sheet">
                    <div className="zenith-trow__line">
                        <span className="zenith-trow__margin is-plain">
                            {preview && (
                                <button
                                    type="button"
                                    className="zenith-tquick__read"
                                    title={t('tasks.quick.literal')}
                                    onClick={() => setLiteral(true)}
                                >
                                    {preview}
                                    {draft.recurrence && (
                                        <span className="zenith-trow__repeat">↻</span>
                                    )}
                                </button>
                            )}
                        </span>
                        <span className="zenith-trow__mark">{urgent && '!'}</span>
                        <span className="zenith-tquick__circle" aria-hidden="true">
                            <StatusBox status="todo" />
                        </span>
                        <input
                            ref={ref}
                            className={`zenith-tquick__input is-p-${draft.priority ?? 'none'}`}
                            value={text}
                            placeholder={t('tasks.quick.placeholder')}
                            aria-label={t('tasks.quick.label')}
                            autoComplete="off"
                            spellCheck={false}
                            enterKeyHint="done"
                            disabled={busy}
                            onChange={(e) => {
                                setText(e.target.value);
                                if (!e.target.value) setLiteral(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                        onExpand(draft);
                                        setText('');
                                        setLiteral(false);
                                    } else {
                                        void submit();
                                    }
                                } else if (e.key === 'Escape' && text) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setText('');
                                    setLiteral(false);
                                }
                            }}
                        />
                        {text && (
                            <span className="zenith-tquick__hint" aria-hidden="true">
                                {t('tasks.quick.hint')}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    }
);

TaskQuickLine.displayName = 'TaskQuickLine';

/** The fields `marginText` reads past, for a task that is only a phrase so far. */
const EMPTY: Partial<Task> = { status: 'todo', priority: 'none', tags: [], subtasks: [] };
