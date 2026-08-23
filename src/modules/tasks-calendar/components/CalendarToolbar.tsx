import React, { useEffect, useRef, useState, type FC } from 'react';
import {
    CalendarCheck,
    CalendarClock,
    CalendarDays,
    CalendarHeart,
    ChevronLeft,
    ChevronRight,
    Clock,
    Columns3,
    Filter,
    List,
    Settings2,
} from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { ENTRY_KINDS, type CalendarCounts, type EntryKind } from '../services/calendarTasks';
import { KindIcon, kindKey } from './kindUi';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

interface ToolbarProps {
    t: Translator;
    mode: CalendarViewMode;
    title: string;
    counts: CalendarCounts;
    hideDone: boolean;
    spanDays: boolean;
    showDailyNotes: boolean;
    allHours: boolean;
    /** Kind the statistics popover is focusing; everything else dims. */
    focus: EntryKind | null;
    onMode: (mode: CalendarViewMode) => void;
    onStep: (delta: number) => void;
    onToday: () => void;
    onToggle: (key: CalendarToggle) => void;
    onFocus: (kind: EntryKind | null) => void;
}

/** The toolbar's own switches — view state, not plugin settings. */
export type CalendarToggle = 'hideDone' | 'spanDays' | 'showDailyNotes' | 'allHours';

// Widest range first, narrowest last: the switcher is a zoom control, and a
// clock face is what tells the day view apart from the week's columns.
const MODES: Array<{ id: CalendarViewMode; icon: typeof List; key: string }> = [
    { id: 'month', icon: CalendarDays, key: 'calendar.view.month' },
    { id: 'week', icon: Columns3, key: 'calendar.view.week' },
    { id: 'day', icon: Clock, key: 'calendar.view.day' },
    { id: 'list', icon: List, key: 'calendar.view.list' },
];

/**
 * A popover that closes on outside click and Escape.
 *
 * Escape is listened for in the bubble phase on purpose: a popover opened over
 * the calendar sits inside whatever else is listening, and taking the key in
 * capture would swallow it from controls nested deeper.
 */
function useDismissable(onClose: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);
    return ref;
}

/**
 * The bar above the grid: what you're looking at, how to move through it, and
 * how much of it is done.
 *
 * The progress button is the calendar's headline number — how many tasks in
 * this month or week are still open — and opens the breakdown by kind. Picking
 * a kind there focuses it: everything else in the grid dims, which is how you
 * find "the three things I actually scheduled" in a busy month.
 */
export const CalendarToolbar: FC<ToolbarProps> = ({
    t,
    mode,
    title,
    counts,
    hideDone,
    spanDays,
    showDailyNotes,
    allHours,
    focus,
    onMode,
    onStep,
    onToday,
    onToggle,
    onFocus,
}) => {
    const [statsOpen, setStatsOpen] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const statsRef = useDismissable(() => setStatsOpen(false));
    const optionsRef = useDismissable(() => setOptionsOpen(false));

    // Nothing to do at all reads differently from "all done" — one is an empty
    // month, the other is a finished one, and the icon says which.
    const StatusIcon =
        counts.remaining > 0 ? CalendarClock : counts.percentDone === 100 && counts.byKind.done > 0 ? CalendarCheck : CalendarHeart;

    const options: Array<{ key: CalendarToggle; on: boolean; label: string; shown?: boolean }> = [
        { key: 'hideDone', on: hideDone, label: t('calendar.option.hideDone') },
        { key: 'spanDays', on: spanDays, label: t('calendar.option.spanDays') },
        { key: 'showDailyNotes', on: showDailyNotes, label: t('calendar.option.dailyNotes') },
        {
            key: 'allHours',
            on: allHours,
            label: t('calendar.option.allHours'),
            // Only the two views with an hour grid have any night to show.
            shown: mode === 'week' || mode === 'day',
        },
    ];

    return (
        <div className="zenith-tcal__bar">
            <button
                className={`zenith-tcal__tool ${hideDone ? 'is-active' : ''}`}
                onClick={() => onToggle('hideDone')}
                title={t('calendar.option.hideDone')}
                aria-pressed={hideDone}
            >
                <Filter size={15} />
            </button>

            <div className="zenith-tcal__modes" role="group" aria-label={t('calendar.viewMode')}>
                {MODES.map(({ id, icon: Icon, key }) => (
                    <button
                        key={id}
                        className={`zenith-tcal__mode ${mode === id ? 'is-active' : ''}`}
                        onClick={() => onMode(id)}
                        title={t(key)}
                        aria-pressed={mode === id}
                    >
                        <Icon size={15} />
                    </button>
                ))}
            </div>

            <div className="zenith-tcal__nav">
                <button className="zenith-tcal__tool" onClick={() => onStep(-1)} aria-label={t('calendar.prev')}>
                    <ChevronLeft size={16} />
                </button>
                <button className="zenith-tcal__title" onClick={onToday} title={t('calendar.today')}>
                    {title}
                </button>
                <button className="zenith-tcal__tool" onClick={() => onStep(1)} aria-label={t('calendar.next')}>
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="zenith-tcal__bar-end">
                <div className="zenith-tcal__pop-host" ref={optionsRef}>
                    <button
                        className={`zenith-tcal__tool ${optionsOpen ? 'is-active' : ''}`}
                        onClick={() => setOptionsOpen((v) => !v)}
                        title={t('calendar.options')}
                        aria-expanded={optionsOpen}
                    >
                        <Settings2 size={15} />
                    </button>
                    {optionsOpen && (
                        <ul className="zenith-tcal__pop">
                            {options.filter((o) => o.shown !== false).map((o) => (
                                <li key={o.key}>
                                    <button
                                        className={`zenith-tcal__pop-item ${o.on ? 'is-on' : ''}`}
                                        onClick={() => onToggle(o.key)}
                                        role="menuitemcheckbox"
                                        aria-checked={o.on}
                                    >
                                        <span className="zenith-tcal__pop-check">{o.on ? '✓' : ''}</span>
                                        {o.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="zenith-tcal__pop-host" ref={statsRef}>
                    <button
                        className={`zenith-tcal__stat ${statsOpen ? 'is-active' : ''}`}
                        onClick={() => setStatsOpen((v) => !v)}
                        title={t('calendar.stats', { percent: counts.percentDone })}
                        aria-expanded={statsOpen}
                        style={{ ['--zenith-tcal-progress' as string]: `${counts.percentDone}%` }}
                    >
                        <StatusIcon size={15} />
                        {counts.remaining > 0 && (
                            <span className="zenith-tcal__stat-count">
                                {counts.remaining > 99 ? '99+' : counts.remaining}
                            </span>
                        )}
                    </button>
                    {statsOpen && (
                        <ul className="zenith-tcal__pop zenith-tcal__pop--stats">
                            <li className="zenith-tcal__pop-head">
                                {t('calendar.stats', { percent: counts.percentDone })}
                            </li>
                            {ENTRY_KINDS.map((kind) => {
                                const n = counts.byKind[kind];
                                if (n === 0) return null;
                                return (
                                    <li key={kind}>
                                        <button
                                            className={`zenith-tcal__pop-item is-${kind} ${
                                                focus === kind ? 'is-on' : ''
                                            }`}
                                            onClick={() => onFocus(focus === kind ? null : kind)}
                                            aria-pressed={focus === kind}
                                        >
                                            <KindIcon kind={kind} size={13} />
                                            <span className="zenith-tcal__pop-label">{t(kindKey(kind))}</span>
                                            <span className="zenith-tcal__pop-count">{n}</span>
                                        </button>
                                    </li>
                                );
                            })}
                            {focus && (
                                <li>
                                    <button
                                        className="zenith-tcal__pop-item zenith-tcal__pop-clear"
                                        onClick={() => onFocus(null)}
                                    >
                                        {t('calendar.clearFocus')}
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
