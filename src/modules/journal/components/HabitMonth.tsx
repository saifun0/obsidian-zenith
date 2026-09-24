import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { isoToDate, monthLabel } from '../../../core/calendarDates';
import type { JournalTracker } from '../../../core/journalConfig';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import type { JournalEntry, TrackerValue } from '../../../store/journalSlice';
import { habitMonth, summarize, type HabitCell, type HabitRow } from '../services/habitMonth';
import { HabitTrack } from './HabitTrack';
import { HabitSummary } from './HabitSummary';
import { HabitValuePicker, type PickerAnchor } from './HabitValuePicker';
import { playHabitEntrance, playStreakGrowth } from './habitEntrance';
import { GooeyDefs } from './GooeyDefs';

interface HabitMonthProps {
    byDate: Map<string, JournalEntry>;
    trackers: JournalTracker[];
    /** Any date in the month to draw — the journal's calendar anchor. */
    anchor: string;
    today: string;
    /** The user's motion setting; off, nothing animates. */
    animate: boolean;
    /** Changes when the reader asks for a refresh: replays the entrance. */
    replay: number;
    /** Absent for a read-only grid. */
    onSetValue?: (tracker: JournalTracker, date: string, next: TrackerValue | null) => void;
}

/**
 * The month as a grid of habits × days.
 *
 * One CSS grid holds the weekday header, every habit row and the totals line,
 * so all three share the same columns and cannot drift apart. The rows
 * themselves are positioned surfaces (see {@link HabitTrack}) because a streak
 * is drawn as one bar across several columns.
 *
 * The grid is keyed on the month and scrolled to today on arrival: a month you
 * step into should open where you are, not on the 1st with three weeks of
 * scrolling in between.
 */
/**
 * The figure at the end of a row: the month's rate for a daily habit, this
 * week against its count for a weekly one, and kept of recorded for a habit
 * being quit.
 */
function rowFigure(row: HabitRow): string {
    if (row.weekly) return `${row.weekly.current.done}/${row.weekly.current.count}`;
    if (row.tracker.mode === 'quit') return `${row.done}/${row.recorded}`;
    return `${Math.round(row.rate * 100)}%`;
}

function rowTitle(row: HabitRow, t: Translator): string {
    if (row.weekly) {
        return `${row.tracker.label} — ${t.plural('journal.goals.weekBasis', row.weekly.run)}`;
    }
    if (row.tracker.mode === 'quit') {
        return t('journal.quit.basis', {
            kept: row.done,
            recorded: row.recorded,
            label: row.tracker.label,
        });
    }
    return `${row.tracker.label} — ${Math.round(row.rate * 100)}%`;
}

export const HabitMonth: FC<HabitMonthProps> = ({
    byDate,
    trackers,
    anchor,
    today,
    animate,
    replay,
    onSetValue,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }), [locale]);

    const hostRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    /**
     * The cell just recorded, and how many times: `nonce` re-triggers the
     * animation when the same cell is touched twice in a row.
     */
    const [pulse, setPulse] = useState<{
        cell: string;
        nonce: number;
        /** Where it landed, so the streak it joined can be redrawn. */
        row: number;
        day: number;
    } | null>(null);
    /** The open value editor, for a scale or a number. */
    const [picker, setPicker] = useState<PickerAnchor | null>(null);
    /** Live entrance animations, cancelled if the view moves on mid-sequence. */
    const playingRef = useRef<Animation[]>([]);

    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const month = useMemo(
        () => habitMonth(byDate, trackers, anchor, today, weekStart),
        [byDate, trackers, anchor, today, weekStart]
    );
    const summary = useMemo(() => summarize(month.rows), [month.rows]);
    const monthKey = anchor.slice(0, 7);

    /**
     * Play the entrance when the panel is actually on screen.
     *
     * Not on mount: Obsidian builds a view when the workspace is restored, so
     * this panel is usually created inside a tab nobody is looking at, and an
     * animation started there plays to an empty room — a hidden element runs
     * nothing, and by the time the Journal tab is opened the sequence has long
     * since been marked finished. That is why the entrance was the ONE
     * animation that never appeared: every other one is triggered by the
     * reader, and the reader is by definition looking.
     *
     * Every arrival counts, not only the first, so coming back to the journal
     * from another tab plays it again.
     */
    const play = useCallback(() => {
        const node = hostRef.current;
        if (!animate || !node) return;
        for (const animation of playingRef.current) animation.cancel();
        playingRef.current = playHabitEntrance(node);
    }, [animate]);

    /**
     * Is this panel genuinely on screen?
     *
     * `checkVisibility` is the only answer that covers every way a workspace
     * can put a leaf away — `display: none`, `visibility: hidden`, a collapsed
     * ancestor — which matters because an animation started in a hidden tab
     * either runs to nobody or doesn't run at all, and either way it is over
     * before the reader arrives.
     */
    const onScreen = (node: HTMLElement): boolean =>
        node.checkVisibility?.() ?? node.offsetParent !== null;

    useEffect(() => {
        const node = hostRef.current;
        if (!animate || !node) return;

        const stop = () => {
            for (const animation of playingRef.current) animation.cancel();
            playingRef.current = [];
        };

        // Scrolled into view.
        let visible = false;
        const observer =
            typeof IntersectionObserver === 'undefined'
                ? null
                : new IntersectionObserver((records) => {
                      const showing = records.some((record) => record.isIntersecting);
                      if (showing === visible) return;
                      visible = showing;
                      if (showing) play();
                  });

        if (observer) observer.observe(node);
        else play();

        // Switched to. The workspace's own signal, because an observer can only
        // report what the layout admits: depending on how Obsidian hides a
        // background tab, the panel may count as "intersecting" the whole time
        // it is out of sight, and then the arrival it is watching for never
        // happens. This event is unambiguous — the reader is here now.
        const onLeafChange = () => {
            if (onScreen(node)) play();
        };
        const ref = app.workspace.on('active-leaf-change', onLeafChange);

        return () => {
            observer?.disconnect();
            app.workspace.offref(ref);
            stop();
        };
        // `days.length` so a month of a different length re-runs the stagger,
        // and `rows.length` so adding a habit reintroduces the grid.
    }, [monthKey, animate, play, app, month.rows.length, month.days.length]);

    /**
     * Asked for outright, by the refresh button.
     *
     * Straight to `play()`, with no observer in the way: someone who just
     * pressed refresh is looking at the panel, and that is the one moment no
     * amount of visibility detection needs to be guessed at.
     */
    useEffect(() => {
        if (replay > 0) play();
    }, [replay, play]);

    /** What the grid currently shows, as one comparable string. */
    const shape = useMemo(
        () => month.rows.map((row) => row.cells.map((cell) => cell.state[0]).join('')).join('|'),
        [month.rows]
    );
    const lastShape = useRef(shape);
    // Read inside an effect that must not re-run when it changes.
    const pulseRef = useRef(pulse);
    pulseRef.current = pulse;

    /**
     * Play it again when the month's contents arrive.
     *
     * This is the one that was missing, and it is why the entrance appeared
     * not to work at all. Obsidian's vault is not ready when the plugin loads,
     * so the first pass over the journal folder finds nothing: the grid mounts
     * as 124 empty rings, the sequence dutifully fades those in — and a wash of
     * faint grey rings is, visually, nothing at all. The streaks and the filled
     * marks, which are the whole of what reads, land a moment later when the
     * notes finish loading, and nothing was watching for that.
     *
     * A change the reader made themselves is excluded: ticking a day changes
     * the shape too, and replaying the entrance on every click would be
     * intolerable. That day gets its own animation.
     */
    useEffect(() => {
        if (lastShape.current === shape) return;
        const mine = pulseRef.current;
        lastShape.current = shape;

        if (!mine) {
            play();
            return;
        }

        // The reader's own tick. Only the streak it changed is redrawn — the
        // bar draws itself and its days land on it as it passes them, which is
        // the entrance's motion at the scale of one row. Replaying the whole
        // month on every click would be intolerable.
        const node = hostRef.current;
        if (node && animate && mine.row >= 0) playStreakGrowth(node, mine.row, mine.day);
    }, [shape, play, animate]);

    // Open on today. A month of 31 columns doesn't fit a narrow pane, and the
    // part of it worth seeing first is the part you're living in.
    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        const marker = node.querySelector<HTMLElement>('[data-hmon-focus="1"]');
        if (!marker) {
            node.scrollLeft = 0;
            return;
        }
        node.scrollLeft = Math.max(
            0,
            marker.offsetLeft - node.clientWidth / 2 + marker.offsetWidth / 2
        );
    }, [monthKey, month.days.length]);

    // A popover anchored to a cell can't follow it; the honest thing is to go.
    useEffect(() => {
        const node = scrollRef.current;
        if (!node || !picker) return;
        const close = () => setPicker(null);
        node.addEventListener('scroll', close, { passive: true });
        return () => node.removeEventListener('scroll', close);
    }, [picker]);

    /**
     * Hold the pulse until the write has been through the vault and back.
     *
     * It used to clear on `animationend`, which fired within 400ms — before the
     * note had been written, re-read and re-parsed. So the bounce played on the
     * OLD mark, and by the time the new one (and the streak it joined) arrived,
     * the flag saying "this just changed" was already gone. Almost nothing
     * appeared to animate; the timeout is what gives the round trip room.
     */
    useEffect(() => {
        if (!pulse) return;
        const timer = window.setTimeout(() => setPulse(null), 1100);
        return () => window.clearTimeout(timer);
    }, [pulse]);

    if (trackers.length === 0) {
        return <p className="zenith-jstats__note">{t('journal.noTrackers')}</p>;
    }

    const write = (tracker: JournalTracker, date: string, next: TrackerValue | null) => {
        setPulse((previous) => ({
            cell: `${tracker.id}:${date}`,
            nonce: (previous?.nonce ?? 0) + 1,
            row: month.rows.findIndex((candidate) => candidate.tracker.id === tracker.id),
            day: Number(date.slice(8, 10)) - 1,
        }));
        onSetValue?.(tracker, date, next);
    };

    /**
     * Clicking a day. A tick has one other state, so it toggles where it
     * stands; a score or a count has too many to reach by clicking, and opens
     * the editor instead.
     */
    const clickCell = (row: HabitRow, cell: HabitCell, button: HTMLElement) => {
        if (row.tracker.kind === 'check') {
            write(row.tracker, cell.date, cell.value === true ? null : true);
            return;
        }

        const host = hostRef.current;
        if (!host) return;
        const cellBox = button.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        const x = cellBox.left + cellBox.width / 2 - hostBox.left;
        const y = cellBox.top - hostBox.top;

        setPicker({
            tracker: row.tracker,
            date: cell.date,
            value: cell.value,
            // Keep it inside the panel: a cell on 31 August is at the far right
            // of a wide grid, and a centred popover would hang off the edge.
            x: Math.max(96, Math.min(hostBox.width - 96, x)),
            // Not enough room above — the first row is right under the header.
            y: y < 130 ? y + cellBox.height : y,
            below: y < 130,
        });
    };

    return (
        <section
            className="zenith-hmon"
            ref={hostRef}
            style={{ '--hmon-days': month.days.length } as CSSProperties}
        >
            <GooeyDefs />

            <header className="zenith-hmon__head">
                <h3 className="zenith-hmon__title">{t('habits.title')}</h3>
                <span className="zenith-hmon__month">{monthLabel(anchor, locale)}</span>
                <span className="zenith-hmon__hint">
                    {onSetValue ? t('habits.hint') : t('habits.hintReadonly')}
                </span>
            </header>

            <div className="zenith-hmon__scroll" ref={scrollRef}>
                <div className="zenith-hmon__grid" key={monthKey}>
                    <span className="zenith-hmon__corner" aria-hidden="true" />
                    {month.days.map((date, i) => {
                        const weekdayIndex = isoToDate(date).getDay();
                        const isToday = date === today;
                        return (
                            <div
                                className={[
                                    'zenith-hmon__day',
                                    weekdayIndex === 0 || weekdayIndex === 6 ? 'is-weekend' : '',
                                    isToday ? 'is-today' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                key={date}
                                // What the view scrolls to. Today when the month
                                // has one; the 1st otherwise, so a month you're
                                // only browsing opens at its beginning.
                                data-hmon-focus={isToday || (i === 0 && today < date) ? '1' : undefined}
                                style={{ '--hmon-at': i } as CSSProperties}
                            >
                                <span className="zenith-hmon__weekday">
                                    {weekday.format(isoToDate(date))}
                                </span>
                                <span className="zenith-hmon__daynum">{i + 1}</span>
                            </div>
                        );
                    })}

                    {month.rows.map((row, index) => (
                        <React.Fragment key={row.tracker.id}>
                            <div
                                className="zenith-hmon__label"
                                style={
                                    {
                                        '--hmon-color': row.tracker.color,
                                        '--hmon-row': index,
                                    } as CSSProperties
                                }
                                title={rowTitle(row, t)}
                            >
                                <span className="zenith-hmon__label-icon">
                                    <DynamicIcon name={row.tracker.icon} size={14} />
                                </span>
                                <span className="zenith-hmon__label-text">{row.tracker.label}</span>
                                <span className="zenith-hmon__label-rate">{rowFigure(row)}</span>
                            </div>
                            <HabitTrack
                                row={row}
                                index={index}
                                t={t}
                                pulse={
                                    pulse?.cell.startsWith(`${row.tracker.id}:`)
                                        ? {
                                              date: pulse.cell.slice(row.tracker.id.length + 1),
                                              nonce: pulse.nonce,
                                          }
                                        : null
                                }
                                onPick={onSetValue ? clickCell : undefined}
                            />
                        </React.Fragment>
                    ))}

                    <span className="zenith-hmon__corner" aria-hidden="true" />
                    {month.totals.map((count, i) => (
                        <span
                            className={`zenith-hmon__total ${
                                count === month.rows.length ? 'is-full' : ''
                            }`}
                            key={month.days[i]}
                            style={{ '--hmon-at': i } as CSSProperties}
                            title={t('habits.dayTotal', { count, total: month.rows.length })}
                        >
                            {/* Days still to come are blank rather than a row of
                                zeroes — nothing failed there yet. */}
                            {month.days[i] > today && count === 0 ? '' : count}
                        </span>
                    ))}
                </div>
            </div>

            {picker && (
                <HabitValuePicker
                    anchor={picker}
                    onPick={(next, keepOpen) => {
                        write(picker.tracker, picker.date, next);
                        // A stepper is used repeatedly — fifteen reps is three
                        // taps — so it stays put and shows where it has got to.
                        // Everything else is a decision, and closes.
                        if (keepOpen) {
                            setPicker((open) => open && { ...open, value: next ?? undefined });
                        } else {
                            setPicker(null);
                        }
                    }}
                    onClose={() => setPicker(null)}
                />
            )}

            <HabitSummary summary={summary} animate={animate} />
        </section>
    );
};
