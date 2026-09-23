import React, { type FC } from 'react';
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
    Grid3x3,
    List,
    Settings2,
} from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { ENTRY_KINDS, type CalendarCounts, type EntryKind } from '../services/calendarTasks';
import { KindIcon, kindKey } from './kindUi';
import { Popover, usePopover } from '../../../components/shared';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

interface ToolbarProps {
    t: Translator;
    mode: CalendarViewMode;
    title: string;
    /** The title is naming the day, week or month we are living in. */
    atCurrent: boolean;
    counts: CalendarCounts;
    /** Days across the month grid — 7, or 3 on a narrow screen. */
    columns: number;
    onColumns: () => void;
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
    atCurrent,
    counts,
    columns,
    onColumns,
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
    const stats = usePopover();
    const opts = usePopover();

    /**
     * Arrows only where there are pages to turn.
     *
     * The month view's months are a single scroll, so a pager beside it was
     * two controls for one thing that could not help disagreeing: the title
     * named the anchor month while the reader was three months further down,
     * and pressing an arrow abandoned their place to re-anchor somewhere they
     * could already see. What's left is the title, which follows the scroll
     * and takes you back to today.
     */
    const paging = mode !== 'month';

    // Nothing to do at all reads differently from "all done" — one is an empty
    // month, the other is a finished one, and the icon says which.
    const StatusIcon =
        counts.remaining > 0
            ? CalendarClock
            : counts.percentDone === 100 && counts.byKind.done > 0
              ? CalendarCheck
              : CalendarHeart;

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
                {paging && (
                    <button
                        className="zenith-tcal__tool"
                        onClick={() => onStep(-1)}
                        aria-label={t('calendar.prev')}
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}
                <button
                    className={`zenith-tcal__title ${atCurrent ? 'is-current' : ''}`}
                    onClick={onToday}
                    title={t('calendar.today')}
                >
                    {title}
                </button>
                {paging && (
                    <button
                        className="zenith-tcal__tool"
                        onClick={() => onStep(1)}
                        aria-label={t('calendar.next')}
                    >
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>

            <div className="zenith-tcal__bar-end">
                {/* A grid, and the width written next to it. The number alone
                    was a bare digit among icons and read as a badge rather than
                    a button; no glyph alone says "seven days across" either.
                    A different grid from the week view's columns, which is a
                    mode and not a width. Only the month grid has one. */}
                {mode === 'month' && (
                    <button
                        className="zenith-tcal__tool zenith-tcal__cols"
                        onClick={onColumns}
                        title={t('calendar.columns')}
                        aria-label={t('calendar.columns')}
                    >
                        <Grid3x3 size={15} />
                        {columns}
                    </button>
                )}

                <button
                    {...opts.anchorProps}
                    className={`zenith-tcal__tool ${opts.open ? 'is-active' : ''}`}
                    onClick={opts.toggle}
                    title={t('calendar.options')}
                >
                    <Settings2 size={15} />
                </button>
                <Popover
                    anchor={opts.anchor}
                    open={opts.open}
                    onClose={opts.close}
                    width={260}
                    height={options.length * 44 + 8}
                    align="end"
                    label={t('calendar.options')}
                >
                    {options
                        .filter((o) => o.shown !== false)
                        .map((o) => (
                            <button
                                key={o.key}
                                type="button"
                                className={`zenith-pop__item ${o.on ? 'is-on' : ''}`}
                                onClick={() => onToggle(o.key)}
                                role="menuitemcheckbox"
                                aria-checked={o.on}
                            >
                                <span className="zenith-tcal__pop-check">{o.on ? '✓' : ''}</span>
                                <span className="zenith-tcal__pop-label">{o.label}</span>
                            </button>
                        ))}
                </Popover>

                <button
                    {...stats.anchorProps}
                    className={`zenith-tcal__stat ${stats.open ? 'is-active' : ''}`}
                    onClick={stats.toggle}
                    title={t('calendar.stats', { percent: counts.percentDone })}
                    style={{ ['--zenith-tcal-progress' as string]: `${counts.percentDone}%` }}
                >
                    <StatusIcon size={15} />
                    {counts.remaining > 0 && (
                        <span className="zenith-tcal__stat-count">
                            {counts.remaining > 99 ? '99+' : counts.remaining}
                        </span>
                    )}
                </button>
                <Popover
                    anchor={stats.anchor}
                    open={stats.open}
                    onClose={stats.close}
                    width={210}
                    height={(ENTRY_KINDS.length + 2) * 38}
                    align="end"
                    label={t('calendar.stats', { percent: counts.percentDone })}
                    className="zenith-tcal__pop--stats"
                >
                    <div className="zenith-pop__title">
                        {t('calendar.stats', { percent: counts.percentDone })}
                    </div>
                    {ENTRY_KINDS.map((kind) => {
                        const n = counts.byKind[kind];
                        if (n === 0) return null;
                        return (
                            <button
                                key={kind}
                                type="button"
                                className={`zenith-pop__item is-${kind} ${
                                    focus === kind ? 'is-on' : ''
                                }`}
                                onClick={() => onFocus(focus === kind ? null : kind)}
                                aria-pressed={focus === kind}
                            >
                                <KindIcon kind={kind} size={13} />
                                <span className="zenith-tcal__pop-label">{t(kindKey(kind))}</span>
                                <span className="zenith-tcal__pop-count">{n}</span>
                            </button>
                        );
                    })}
                    {focus && (
                        <button
                            type="button"
                            className="zenith-pop__item zenith-tcal__pop-clear"
                            onClick={() => onFocus(null)}
                        >
                            {t('calendar.clearFocus')}
                        </button>
                    )}
                </Popover>
            </div>
        </div>
    );
};
