import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Star } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../../tasks/services/taskWriter';
import { StatusBox, TaskStatusControl } from '../../tasks/components/taskStatusUi';
import type { TaskStatus } from '../../../core/constants';
import { JournalWriter, journalConfig } from '../services/journalWriter';
import {
    FOCUS_KEY,
    doneToday,
    leftovers,
    overdueTasks,
    todaysTasks,
    triagePatch,
    type RitualKind,
    type RitualStep,
    type TriageAction,
} from '../services/rituals';

/**
 * A ritual, as one scrolling page of short sections rather than a wizard:
 * every step is visible, any of them can be skipped by simply not touching
 * it, and the ones switched off in settings are not there at all.
 *
 * It is drawn as the Tasks page is: the sections named in the planner's
 * hand, the tasks on lines with the list's own circle, and what can be done
 * to one — keep it for today, move it to tomorrow, drop it, make it the day's
 * main task — said in quiet words and a star rather than a row of boxes.
 *
 * Everything written goes through the writers the rest of the plugin uses —
 * a task ticked here is ticked exactly as it would be from the list.
 */
export const RitualBody: FC<{ kind: RitualKind }> = ({ kind }) => {
    const t = useTranslation();
    const { app } = useApp();
    const tasks = useZenithStore((s) => s.tasks);
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);
    const [busy, setBusy] = useState<Set<string>>(() => new Set());
    const [tomorrow, setTomorrow] = useState('');

    const today = getTodayString();
    const entry = entries.find((e) => e.date === today);
    const notePath =
        entry?.filePath ?? new JournalWriter(app).pathFor(journalConfig(settings), today);
    const focus = entry?.texts?.[FOCUS_KEY];
    const shows = (step: RitualStep) => !settings.ritualSkip.includes(step);

    const lists = useMemo(
        () => ({
            today: todaysTasks(tasks, today, notePath),
            overdue: overdueTasks(tasks, today),
            done: doneToday(tasks, today),
            open: leftovers(tasks, today, notePath),
        }),
        [tasks, today, notePath]
    );

    const withBusy = async (task: Task, work: () => Promise<boolean>) => {
        if (busy.has(task.id)) return;
        setBusy((b) => new Set(b).add(task.id));
        try {
            if (!(await work())) new Notice(t('ritual.failed'));
        } finally {
            setBusy((b) => {
                const next = new Set(b);
                next.delete(task.id);
                return next;
            });
        }
    };

    const writer = new TaskWriter(app);
    const setStatus = (task: Task, status: TaskStatus) =>
        withBusy(task, () =>
            writer.setStatusInFile(task.filePath, task.lineNumber, status, task.title)
        );
    const triage = (task: Task, action: TriageAction) =>
        withBusy(task, () =>
            action === 'cancel'
                ? writer.setStatusInFile(task.filePath, task.lineNumber, 'cancelled', task.title)
                : writer.updateTaskInFile(
                      task.filePath,
                      task.lineNumber,
                      triagePatch(action, today),
                      task.title
                  )
        );

    const setFocus = async (task: Task) => {
        const journal = new JournalWriter(app);
        const file = await journal.ensureNote(journalConfig(settings), today);
        await journal.setValues(file, { [FOCUS_KEY]: focus === task.title ? null : task.title });
    };

    const saveTomorrow = async () => {
        const text = tomorrow.trim();
        if (!text) return;
        const journal = new JournalWriter(app);
        const file = await journal.ensureNote(journalConfig(settings), today);
        await journal.appendUnderHeading(
            file,
            t('journal.template.notes'),
            `**${t('ritual.tomorrow.label')}** ${text}\n`
        );
        setTomorrow('');
        new Notice(t('ritual.tomorrow.saved'));
    };

    const row = (task: Task, actions: React.ReactNode) => (
        <li
            key={task.id}
            className={`zenith-ritual__task${busy.has(task.id) ? ' is-busy' : ''}${
                focus === task.title ? ' is-focus' : ''
            }`}
        >
            <TaskStatusControl
                status={task.status}
                size={16}
                onChange={(status) => void setStatus(task, status)}
            />
            <span className="zenith-ritual__title">{task.title}</span>
            {actions}
        </li>
    );

    const triageButtons = (task: Task) => (
        <span className="zenith-ritual__actions">
            {(['today', 'postpone', 'cancel'] as const).map((action, i) => (
                <React.Fragment key={action}>
                    {i > 0 && (
                        <span className="zenith-ritual__dot" aria-hidden="true">
                            ·
                        </span>
                    )}
                    <button
                        type="button"
                        className={`zenith-ritual__action is-${action}`}
                        onClick={() => void triage(task, action)}
                    >
                        {t(`ritual.${action}`)}
                    </button>
                </React.Fragment>
            ))}
        </span>
    );

    const section = (step: RitualStep, title: string, body: React.ReactNode) =>
        shows(step) ? (
            <section className="zenith-ritual__section" key={step}>
                <h4 className="zenith-ritual__heading">{title}</h4>
                {body}
            </section>
        ) : null;

    const list = (items: Task[], render: (task: Task) => React.ReactNode, empty: string) =>
        items.length ? (
            <ul className="zenith-ritual__list">{items.map(render)}</ul>
        ) : (
            <p className="zenith-ritual__empty">{t(empty)}</p>
        );

    const focusButton = (task: Task) => {
        const on = focus === task.title;
        return (
            <button
                type="button"
                className={`zenith-ritual__focus${on ? ' is-on' : ''}`}
                aria-pressed={on}
                title={t('ritual.focus.pick')}
                aria-label={t('ritual.focus.pick')}
                onClick={() => void setFocus(task)}
            >
                <Star size={15} fill={on ? 'currentColor' : 'none'} />
            </button>
        );
    };

    return (
        <div className="zenith-ritual">
            {kind === 'morning' ? (
                <>
                    {section(
                        'morning.today',
                        t('ritual.morning.today'),
                        list(
                            lists.today,
                            (task) => row(task, shows('morning.focus') ? focusButton(task) : null),
                            'ritual.empty.today'
                        )
                    )}
                    {section(
                        'morning.overdue',
                        t('ritual.morning.overdue'),
                        list(
                            lists.overdue,
                            (task) => row(task, triageButtons(task)),
                            'ritual.empty.overdue'
                        )
                    )}
                </>
            ) : (
                <>
                    {section(
                        'evening.done',
                        t('ritual.evening.done'),
                        lists.done.length ? (
                            <ul className="zenith-ritual__list is-done">
                                {lists.done.map((task) => (
                                    <li key={task.id} className="zenith-ritual__task">
                                        <span className="zenith-ritual__mark" aria-hidden="true">
                                            <StatusBox status="done" size={16} />
                                        </span>
                                        <span className="zenith-ritual__title">{task.title}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="zenith-ritual__empty">{t('ritual.empty.done')}</p>
                        )
                    )}
                    {section(
                        'evening.open',
                        t('ritual.evening.open'),
                        list(
                            lists.open,
                            (task) => row(task, triageButtons(task)),
                            'ritual.empty.open'
                        )
                    )}
                    {section(
                        'evening.tomorrow',
                        t('ritual.evening.tomorrow'),
                        <div className="zenith-ritual__tomorrow">
                            <input
                                className="zenith-ritual__line"
                                value={tomorrow}
                                placeholder={t('ritual.tomorrow.placeholder')}
                                aria-label={t('ritual.evening.tomorrow')}
                                enterKeyHint="done"
                                onChange={(e) => setTomorrow(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void saveTomorrow();
                                    }
                                }}
                            />
                            {tomorrow.trim() && (
                                <button
                                    type="button"
                                    className="zenith-ritual__save"
                                    onClick={() => void saveTomorrow()}
                                >
                                    {t('ritual.tomorrow.save')}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
