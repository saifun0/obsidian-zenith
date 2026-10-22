import React, { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { ChevronRight, Moon, PenLine, Star, Sun } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { useNow } from '../../../core/useNow';
import { getTodayString } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import type { TrackerValue } from '../../../store/journalSlice';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { ROOM_WIDE, useCardRoom } from '../../dashboard/cardRoom';
import { TaskWriter } from '../../tasks/services/taskWriter';
import { resolveTaskTarget } from '../../tasks/services/taskTarget';
import { quickParse } from '../../tasks/services/quickParse';
import { draftOf } from '../../tasks/components/TaskQuickLine';
import { usableTrackers } from '../services/usableTrackers';
import { entriesByDate } from '../services/journalStats';
import { openDailyNote, setTrackerValue } from '../services/journalActions';
import { JournalWriter, journalConfig } from '../services/journalWriter';
import { FOCUS_KEY, doneToday, ritualFor, todaysTasks } from '../services/rituals';
import {
    CAPTURE_KINDS,
    countRecords,
    noteLine,
    withHighlight,
    type CaptureKind,
} from '../services/todayCapture';
import { RitualModal } from '../RitualModal';
import { TrackerRail } from './TrackerRail';

/**
 * "Today": the day's one card on the dashboard, for what is said in passing.
 *
 * From the top: the day — its main task if one was chosen, the ritual the
 * hour calls for if not, and the way into that ritual either way; the
 * trackers, as the check-in had them; a line to write on, with where it goes
 * under it — a note, with the time; a highlight; a task, read the way quick
 * add reads one; and the count of what the day's note holds, with the way
 * into it.
 *
 * It took the ritual card's place, and the check-in's: two half-empty cards
 * that were the same day seen twice.
 */
export const TodayWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const room = useCardRoom();
    const now = useNow(60_000);
    const tasks = useZenithStore((s) => s.tasks);
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const ritualsOn = useFeature('journal.rituals');
    const natural = useFeature('tasks.naturalInput');
    const wordsOn = useFeature('journal.wordCount');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    const today = getTodayString();
    const entry = useMemo(() => entriesByDate(entries).get(today), [entries, today]);
    const kind = ritualFor(now.getHours());
    const focus = entry?.texts?.[FOCUS_KEY];

    const trackers = usableTrackers(settings);

    // What the card gives up when its slot is too short for it: first the
    // habits draw smaller and closer, then the line about the note goes. Never
    // a scroll inside the card, which on a phone fights the page's own.
    const rootRef = useRef<HTMLDivElement>(null);
    const [squeeze, setSqueeze] = useState(0);
    const fitFor = useRef('');
    const fitKey = `${room.width}x${room.height}:${trackers.length}:${ritualsOn || !!focus}`;
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el || !room.height) return;
        // A new size or set of habits: measured afresh, from nothing given up.
        if (fitFor.current !== fitKey) {
            fitFor.current = fitKey;
            if (squeeze) {
                setSqueeze(0);
                return;
            }
        }
        if (squeeze < 2 && el.scrollHeight > room.height + 1) setSqueeze(squeeze + 1);
    }, [room.height, fitKey, squeeze]);
    const compact = squeeze > 0 || room.width < ROOM_WIDE;

    const into: CaptureKind = settings.journalCaptureKind;
    const records = countRecords(
        entry?.body ?? '',
        t('journal.template.highlights'),
        entry ? tasks.filter((task) => task.filePath === entry.filePath).length : 0
    );
    const ritualCount =
        kind === 'morning'
            ? t.plural('ritual.card.tasks', todaysTasks(tasks, today, entry?.filePath).length)
            : t('ritual.card.done', { count: doneToday(tasks, today).length });

    const changeTracker = (tracker: JournalTracker, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, today, tracker.id, next);

    const write = async () => {
        const said = text.trim();
        if (!said || busy) return;
        setBusy(true);
        try {
            if (into === 'task') {
                const draft = draftOf(
                    said,
                    natural ? quickParse(said, today, undefined, settings.journalWeekStart) : null
                );
                await new TaskWriter(app).addTask(
                    settings.tasksFolderPath,
                    {
                        title: draft.title || said,
                        priority: draft.priority ?? 'none',
                        dueDate: draft.dueDate,
                        dueTime: draft.dueDate ? draft.dueTime : undefined,
                        dueEndTime: draft.dueDate ? draft.dueEndTime : undefined,
                        recurrence: draft.recurrence,
                        tags: [],
                    },
                    await resolveTaskTarget(app, settings)
                );
                void plugin.dataService.reloadTasks();
            } else {
                const journal = new JournalWriter(app);
                const file = await journal.ensureNote(journalConfig(settings), today);
                if (into === 'note') {
                    await journal.appendUnderHeading(
                        file,
                        t('journal.template.notes'),
                        `${noteLine(said, new Date())}\n`
                    );
                } else {
                    const heading = t('journal.template.highlights');
                    await app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        const placed = withHighlight(lines, heading, said);
                        return placed
                            ? placed.join('\n')
                            : `${data.replace(/\n*$/, '')}\n- ${said}\n`;
                    });
                }
            }
            setText('');
        } catch (err) {
            console.error('Zenith: failed to write from the Today card:', err);
            new Notice(t('today.failed'));
        } finally {
            setBusy(false);
        }
    };

    const dayText = focus ? (
        <span className="zenith-today__focus">{focus}</span>
    ) : (
        <span className="zenith-wcap">
            {t(`ritual.${kind}.title`)} · {ritualCount}
        </span>
    );
    const dayIcon = focus ? (
        <Star size={15} />
    ) : kind === 'morning' ? (
        <Sun size={15} />
    ) : (
        <Moon size={15} />
    );

    return (
        <div ref={rootRef} className={`zenith-today${squeeze ? ' is-tight' : ''}`}>
            {ritualsOn ? (
                <button
                    type="button"
                    className={`zenith-today__day is-${kind}`}
                    title={t(`ritual.${kind}.title`)}
                    onClick={() => new RitualModal(app, plugin, kind).open()}
                >
                    <span className="zenith-today__icon" aria-hidden="true">
                        {dayIcon}
                    </span>
                    {dayText}
                    <ChevronRight size={15} className="zenith-today__go" aria-hidden="true" />
                </button>
            ) : (
                focus && (
                    <div className={`zenith-today__day is-${kind}`}>
                        <span className="zenith-today__icon" aria-hidden="true">
                            <Star size={15} />
                        </span>
                        {dayText}
                    </div>
                )
            )}

            <TrackerRail
                trackers={trackers}
                values={entry?.values ?? {}}
                onChange={changeTracker}
                layout="wrap"
                compact={compact}
            />

            <div className="zenith-today__write">
                <input
                    className="zenith-today__input"
                    value={text}
                    placeholder={t(`today.placeholder.${into}`)}
                    aria-label={t(`today.placeholder.${into}`)}
                    enterKeyHint="done"
                    // Not disabled while it writes: a disabled field loses
                    // the focus, and the next line is meant to follow at once.
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void write();
                        }
                    }}
                />
                <div className="zenith-today__into" role="radiogroup" aria-label={t('today.into')}>
                    {CAPTURE_KINDS.map((k) => (
                        <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={k === into}
                            className={`zenith-today__kind${k === into ? ' is-on' : ''}`}
                            onClick={() => updateSettings({ journalCaptureKind: k })}
                        >
                            {t(`today.kind.${k}`)}
                        </button>
                    ))}
                </div>
            </div>

            {squeeze < 2 && (
                <div className="zenith-wfoot">
                    <span className="zenith-wfoot__note">
                        {records > 0
                            ? t.plural('today.records', records)
                            : t('journal.widget.blank')}
                        {wordsOn && entry && entry.words > 0
                            ? ` · ${t.plural('journal.words', entry.words)}`
                            : ''}
                    </span>
                    <button
                        className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-wfoot__open"
                        onClick={() => void openDailyNote(app, settings, today)}
                    >
                        <PenLine size={13} />
                        <span>{entry ? t('journal.openNote') : t('journal.createNote')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};
