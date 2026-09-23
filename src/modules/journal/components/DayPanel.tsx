import React, { type FC } from 'react';
import { Notice } from 'obsidian';
import {
    FileText,
    Plus,
    ExternalLink,
    ListChecks,
    ChevronLeft,
    ChevronRight,
    PenLine,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import type { JournalTracker } from '../../../core/journalConfig';
import type { JournalEntry, TrackerValue } from '../../../store/journalSlice';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useFeature } from '../../../core/useFeature';
import { TaskWriter } from '../../tasks/services/taskWriter';
import { useZenithStore } from '../../../store';
import { TaskStatusControl } from '../../tasks/components/taskStatusUi';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { keptOn } from '../services/habitMonth';
import { notesSection } from '../services/journalParser';
import { TrackerControl } from './TrackerControl';
import { dayLabel } from '../services/journalDates';

interface DayPanelProps {
    date: string;
    today: string;
    entry?: JournalEntry;
    trackers: JournalTracker[];
    /** Tasks due on this day, or living in this day's note. */
    tasks: Task[];
    onOpen: () => void;
    onCreate: () => void;
    onTrackerChange: (tracker: JournalTracker, next: TrackerValue | null) => void;
    onShiftDay: (delta: number) => void;
}

/**
 * The selected day: its check-in, its tasks and a way into the note.
 *
 * The check-in controls are live even for a day with no note yet — they create
 * it on first use — so recording a mood for a day you never wrote about takes
 * one click rather than "create note, then rate".
 */
export const DayPanel: FC<DayPanelProps> = ({
    date,
    today,
    entry,
    trackers,
    tasks,
    onOpen,
    onCreate,
    onTrackerChange,
    onShiftDay,
}) => {
    const t = useTranslation();
    const wordsOn = useFeature('journal.wordCount');
    const { app, plugin } = useApp();
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';

    const { kept, total } = keptOn(entry, trackers);
    /** What was actually written, as opposed to what the template laid down. */
    const prose = notesSection(entry?.body ?? '')?.trim() || '';

    const changeStatus = async (task: Task, status: TaskStatus) => {
        const previous = task.status;
        setTaskStatus(task.id, status);
        try {
            const ok = await new TaskWriter(app).setStatusInFile(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
            if (!ok) {
                setTaskStatus(task.id, previous);
                new Notice(t('tasks.error.update'));
            } else if (status === 'done' && task.recurrence) {
                void plugin.dataService.reloadTasks();
            }
        } catch {
            setTaskStatus(task.id, previous);
        }
    };

    return (
        <div className="zenith-jday">
            <div className="zenith-jday__head">
                <div className="zenith-jday__heading">
                    <div className="zenith-jday__title-row">
                        <button
                            type="button"
                            className="zenith-jday__step"
                            aria-label={t('journal.prevDay')}
                            title={t('journal.prevDay')}
                            onClick={() => onShiftDay(-1)}
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <h3 className="zenith-jday__title">{dayLabel(date, locale)}</h3>
                        <button
                            type="button"
                            className="zenith-jday__step"
                            aria-label={t('journal.nextDay')}
                            title={t('journal.nextDay')}
                            onClick={() => onShiftDay(1)}
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    <span className="zenith-jday__sub">
                        {date === today && (
                            <span className="zenith-jday__badge">{t('journal.today')}</span>
                        )}
                        {!entry
                            ? t('journal.noNote')
                            : wordsOn
                              ? t.plural('journal.words', entry.words)
                              : null}
                    </span>
                </div>
                {/* Icon only, at every width. The label was the first thing to
                    wrap in a narrow pane, pushing the date onto three lines —
                    and "open the note" is what a note icon already says. */}
                <button
                    className="zenith-jday__open"
                    onClick={entry ? onOpen : onCreate}
                    aria-label={entry ? t('journal.openNote') : t('journal.createNote')}
                    title={entry ? t('journal.openNote') : t('journal.createNote')}
                >
                    {entry ? <ExternalLink size={15} /> : <Plus size={15} />}
                </button>
            </div>

            {/* What the day comes to, in one line. It is the same column the
                habit grid totals from below — the panel and the grid stop being
                two unrelated readings of the same day. */}
            {total > 0 && (
                <div className="zenith-jday__strip">
                    <span className="zenith-jday__strip-figure">
                        {t('journal.keptOn', { kept, total })}
                    </span>
                    <span className="zenith-jday__strip-bar">
                        <i style={{ width: `${(kept / total) * 100}%` }} />
                    </span>
                    {kept === total && (
                        <span className="zenith-jday__strip-done">{t('journal.dayClosed')}</span>
                    )}
                </div>
            )}

            <div className="zenith-jday__section">
                <span className="zenith-jday__section-title">{t('journal.trackers')}</span>
                {trackers.length === 0 ? (
                    <p className="zenith-jday__empty">{t('journal.noTrackers')}</p>
                ) : (
                    /* A row per tracker: name on the left, control on the right,
                       every control on one axis. The wrapping rail this replaced
                       interleaved names and controls differently at every width,
                       so no two panes read the same. */
                    <div className="zenith-jday__trackers">
                        {trackers.map((tracker) => (
                            <div
                                key={tracker.id}
                                className="zenith-jday__tracker"
                                style={{ ['--jday-color' as string]: tracker.color }}
                            >
                                <span className="zenith-jday__tracker-name">
                                    <DynamicIcon name={tracker.icon} size={15} />
                                    <span>{tracker.label}</span>
                                </span>
                                <TrackerControl
                                    tracker={tracker}
                                    value={entry?.values[tracker.id]}
                                    onChange={(next) => onTrackerChange(tracker, next)}
                                    variant="row"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="zenith-jday__section">
                <span className="zenith-jday__section-title">
                    <ListChecks size={13} />
                    {t('journal.dayTasks')}
                    {tasks.length > 0 && <span className="zenith-jday__count">{tasks.length}</span>}
                </span>
                {tasks.length === 0 ? (
                    <p className="zenith-jday__empty">{t('journal.noTasks')}</p>
                ) : (
                    <ul className="zenith-jday__tasks">
                        {tasks.map((task) => (
                            <li key={task.id} className="zenith-jday__task">
                                <TaskStatusControl
                                    status={task.status}
                                    onChange={(status) => changeStatus(task, status)}
                                    size={15}
                                />
                                <span
                                    className={`zenith-jday__task-title ${
                                        task.status === 'done' || task.status === 'cancelled'
                                            ? 'is-done'
                                            : ''
                                    }`}
                                >
                                    {task.title}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* The note, as what was written rather than as the file. Printing
                the body verbatim meant the template itself — a code fence, three
                empty headings, a stray dash — was the largest thing on the panel
                on precisely the days that had nothing in them. Only the section
                the word count is taken from is shown, so the two agree. */}
            <div className="zenith-jday__section">
                <span className="zenith-jday__section-title">
                    <FileText size={13} />
                    {t('journal.preview')}
                </span>
                {prose ? (
                    <p className="zenith-jday__note" onClick={entry ? onOpen : onCreate}>
                        {prose}
                    </p>
                ) : (
                    <button
                        className="zenith-jday__note zenith-jday__note--empty"
                        onClick={entry ? onOpen : onCreate}
                    >
                        <PenLine size={16} />
                        <span>{t('journal.writeInvite')}</span>
                    </button>
                )}
            </div>
        </div>
    );
};
