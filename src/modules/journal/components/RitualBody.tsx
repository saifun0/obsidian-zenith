import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Star, Check } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../../tasks/services/taskWriter';
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
 * Everything written goes through the writers the rest of the plugin uses —
 * a task ticked here is ticked exactly as it would be from the list.
 */
export const RitualBody: FC<{ kind: RitualKind; onClose: () => void }> = ({ kind, onClose }) => {
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
    const complete = (task: Task) =>
        withBusy(task, () =>
            writer.setStatusInFile(task.filePath, task.lineNumber, 'done', task.title)
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
        <li key={task.id} className={`zenith-ritual__task ${busy.has(task.id) ? 'is-busy' : ''}`}>
            <button
                type="button"
                className="zenith-ritual__tick"
                aria-label={t('ritual.done')}
                title={t('ritual.done')}
                onClick={() => void complete(task)}
            >
                <Check size={13} />
            </button>
            <span className="zenith-ritual__title">{task.title}</span>
            {actions}
        </li>
    );

    const triageButtons = (task: Task) => (
        <span className="zenith-ritual__actions">
            {(['today', 'postpone', 'cancel'] as const).map((action) => (
                <button
                    key={action}
                    type="button"
                    className="zenith-ritual__action"
                    onClick={() => void triage(task, action)}
                >
                    {t(`ritual.${action}`)}
                </button>
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

    const focusButton = (task: Task) => (
        <button
            type="button"
            className={`zenith-ritual__focus ${focus === task.title ? 'is-on' : ''}`}
            aria-pressed={focus === task.title}
            title={t('ritual.focus.pick')}
            aria-label={t('ritual.focus.pick')}
            onClick={() => void setFocus(task)}
        >
            <Star size={14} />
        </button>
    );

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
                    {shows('morning.focus') && focus && (
                        <p className="zenith-ritual__focus-line">
                            <Star size={13} /> {t('ritual.focus.is', { title: focus })}
                        </p>
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
                                        <Check size={13} />
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
                            <textarea
                                className="zenith-input zenith-field__textarea"
                                rows={2}
                                value={tomorrow}
                                placeholder={t('ritual.tomorrow.placeholder')}
                                onChange={(e) => setTomorrow(e.target.value)}
                            />
                            <button
                                type="button"
                                className="mod-cta"
                                disabled={!tomorrow.trim()}
                                onClick={() => void saveTomorrow()}
                            >
                                {t('ritual.tomorrow.save')}
                            </button>
                        </div>
                    )}
                </>
            )}

            <div className="zenith-ritual__footer">
                <button type="button" onClick={onClose}>
                    {t('ritual.close')}
                </button>
            </div>
        </div>
    );
};
