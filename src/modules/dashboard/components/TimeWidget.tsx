import React, { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TFile, type App } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../widgets';
import { ROOM_MEDIUM, useCardRoom } from '../cardRoom';
import {
    JournalWriter,
    journalConfig,
    type JournalConfig,
} from '../../journal/services/journalWriter';
import { intlLocale, useTranslation, type Translator } from '../../../core/i18n';

// ── Helpers ──────────────────────────────────────────

function padTwo(n: number): string {
    return n.toString().padStart(2, '0');
}

function dayProgress(date: Date): number {
    const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    return (seconds / 86400) * 100;
}

/**
 * Time left today, precise enough to be worth reading near the end of it.
 *
 * Three phrasings rather than one with optional parts: an hour count and a
 * minute count decline differently in Russian, and "0 h 12 m" is not something
 * anyone says.
 */
function formatRemaining(t: Translator, date: Date): string {
    const mins = 24 * 60 - (date.getHours() * 60 + date.getMinutes());
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return t('clock.dayLeft.m', { minutes: m });
    if (h < 2) return t('clock.dayLeft.hm', { hours: h, minutes: m });
    return t('clock.dayLeft.h', { hours: h });
}

/**
 * The locale to format dates in.
 *
 * Zenith's own language, not the machine's. The widget used to pass `undefined`
 * to `toLocaleDateString`, which follows the OS — so a Russian interface could
 * show English weekday names, and nothing in settings would explain why.
 */
function dateLocale(t: Translator): string {
    return intlLocale(t.locale, 'en-GB');
}

/** Local `yyyy-mm-dd` key (stable identity for "is this cell today?"). */
function ymd(d: Date): string {
    return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * How brightly an hour that has already passed still burns.
 *
 * A flat fill tells you how much of the day is gone, which the percentage under
 * the strip already says in words. Fading with distance says something the
 * number cannot: where you have just been. The recent hours stay bright and the
 * morning dims behind them, so the strip carries a tail pointing at now.
 *
 * It bottoms out rather than reaching zero — an hour that has passed is still
 * an hour that happened, and a strip whose left end disappears reads as broken
 * rather than as old.
 */
function hourGlow(hour: number, currentHour: number): number {
    if (hour >= currentHour) return 1;
    return Math.max(0.3, 1 - (currentHour - hour) * 0.055);
}

/** Monday-first weekday labels (Jan 1 2024 was a Monday). */
function weekdayLabels(locale: string): string[] {
    return Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' })
    );
}

/** 42 dates (6 weeks) covering `month`, Monday-aligned, with adjacent-month
 *  spill days so every row is full. */
function monthGrid(year: number, month: number): Date[] {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // days shown before the 1st (Mon = 0)
    return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i));
}

// ── Daily notes ──────────────────────────────────────

/**
 * Opening a day from the calendar goes through the journal's own writer.
 *
 * It used to read the CORE Daily Notes plugin's folder and format instead,
 * which is the wrong place twice over. Zenith's journal is deliberately
 * independent of that plugin — its own folder, pattern and template — so even
 * with the core plugin on and configured, the calendar could file a note
 * somewhere the journal would never look for it. And with the core plugin off,
 * its options object is simply empty: no folder, no format, so every day landed
 * as `YYYY-MM-DD.md` in the vault root.
 *
 * `ensureNote` is the same call the journal view and the check-in widget use.
 * It builds the note from the configured template, creates whatever folders the
 * filename pattern implies, and survives two clicks racing each other.
 */
async function openDailyNote(app: App, writer: JournalWriter, config: JournalConfig, iso: string) {
    const file = await writer.ensureNote(config, iso);
    // A new tab, so the dashboard stays where it was.
    await app.workspace.getLeaf('tab').openFile(file);
}

// ── Mini calendar ────────────────────────────────────

/**
 * A functional month calendar wired to the vault: days with tasks (due /
 * scheduled / start) or an existing daily note get a dot, today is highlighted,
 * ‹ › page through months, the title jumps back to today, and clicking a day
 * opens (creating if needed) its daily note in a new tab.
 *
 * Memoized on `todayStr` so the clock's per-second re-render doesn't touch it;
 * its own state (viewed month, refresh tick) plus the task-store subscription
 * still re-render it when they should.
 */
/**
 * What a day carries, and the way into it: whether it has tasks, whether it
 * has a note, and opening — making, if need be — that note.
 *
 * Shared by the month and by the week that stands in for it on a narrow card,
 * so a day says the same thing about itself in both.
 */
function useDays() {
    const { app } = useApp();
    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);
    // Bumped after creating a note so its dot appears without a full reload.
    const [tick, setTick] = useState(0);

    // Set of `yyyy-mm-dd` that carry at least one task, for the day dots.
    const taskDays = useMemo(() => {
        const set = new Set<string>();
        for (const t of tasks) {
            for (const d of [t.dueDate, t.scheduledDate, t.startDate]) {
                if (d) set.add(d.slice(0, 10));
            }
        }
        return set;
    }, [tasks]);

    const writer = useMemo(() => new JournalWriter(app), [app]);
    // Rebuilt whenever the journal's folder, pattern or template changes, so a
    // setting edited in another pane reaches the calendar without a reload.
    const config = useMemo(() => journalConfig(settings), [settings]);
    const hasNote = (d: Date): boolean => writer.find(config, ymd(d)) instanceof TFile;
    void tick; // `hasNote` reads the vault live; `tick` just forces a recheck.

    const openDay = (d: Date) => {
        void openDailyNote(app, writer, config, ymd(d))
            .then(() => setTick((n) => n + 1))
            .catch((err) => console.error('Zenith: could not open the daily note', err));
    };

    return { taskDays, hasNote, openDay };
}

/** The seven days of the week `today` is in, Monday first. */
function weekOf(today: Date): Date[] {
    const lead = (today.getDay() + 6) % 7;
    return Array.from(
        { length: 7 },
        (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - lead + i)
    );
}

/**
 * This week, a day to a column: what the month says about seven days, in the
 * one line a narrow card has for it. It used to be the whole month behind a
 * button that swapped it for the clock — half the card always out of sight,
 * and the half in sight chosen by whoever pressed last.
 */
const WeekRow: React.FC<{ todayStr: string }> = React.memo(({ todayStr }) => {
    const t = useTranslation();
    const { taskDays, hasNote, openDay } = useDays();
    const locale = dateLocale(t);
    const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
    // The week is today's: reworked when the day turns, not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayStr` is the day; the Date is made from now.
    const days = useMemo(() => weekOf(new Date()), [todayStr]);

    return (
        <div className="zenith-clock__week">
            {days.map((d, i) => {
                const key = ymd(d);
                return (
                    <button
                        key={key}
                        className={`zenith-clock__wday${key === todayStr ? ' is-today' : ''}${i >= 5 ? ' is-weekend' : ''}`}
                        onClick={() => openDay(d)}
                        aria-current={key === todayStr ? 'date' : undefined}
                        title={t('clock.openDay', {
                            date: d.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
                        })}
                    >
                        <span className="zenith-clock__wname" aria-hidden="true">
                            {weekdays[i]}
                        </span>
                        <span className="zenith-clock__wnum">{d.getDate()}</span>
                        <span className="zenith-cal__dots">
                            {taskDays.has(key) && <i className="zenith-cal__dot is-task" />}
                            {hasNote(d) && <i className="zenith-cal__dot is-note" />}
                        </span>
                    </button>
                );
            })}
        </div>
    );
});
WeekRow.displayName = 'WeekRow';

const MiniCalendar: React.FC<{ todayStr: string }> = React.memo(({ todayStr }) => {
    const t = useTranslation();
    const { taskDays, hasNote, openDay } = useDays();

    const [view, setView] = useState(() => {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth() };
    });

    const locale = dateLocale(t);
    const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
    const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
    // Month and year formatted apart and joined by hand. Asking the locale for
    // both at once gets "август 2026 г." in Russian — correct for prose, and
    // three characters of legal boilerplate in a calendar header.
    const title = useMemo(() => {
        const first = new Date(view.y, view.m, 1);
        return `${first.toLocaleDateString(locale, { month: 'long' })} ${view.y}`;
    }, [view, locale]);

    const shift = (delta: number) =>
        setView((v) => {
            const d = new Date(v.y, v.m + delta, 1);
            return { y: d.getFullYear(), m: d.getMonth() };
        });
    const reset = () => {
        const d = new Date();
        setView({ y: d.getFullYear(), m: d.getMonth() });
    };

    return (
        <div className="zenith-cal">
            {/* Title left, both arrows together on the right. Stranding the
                title between them made two controls that do the same kind of
                thing sit as far apart as the header allowed. */}
            <div className="zenith-cal__head">
                <button className="zenith-cal__title" onClick={reset} title={t('clock.thisMonth')}>
                    {title}
                </button>
                <span className="zenith-cal__nav-group">
                    <button
                        className="zenith-cal__nav"
                        onClick={() => shift(-1)}
                        aria-label={t('clock.prevMonth')}
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <button
                        className="zenith-cal__nav"
                        onClick={() => shift(1)}
                        aria-label={t('clock.nextMonth')}
                    >
                        <ChevronRight size={15} />
                    </button>
                </span>
            </div>

            <div className="zenith-cal__weekdays" aria-hidden="true">
                {weekdays.map((w, i) => (
                    <span key={i} className={`zenith-cal__wd ${i >= 5 ? 'is-weekend' : ''}`}>
                        {w}
                    </span>
                ))}
            </div>

            <div className="zenith-cal__grid">
                {cells.map((d) => {
                    const key = ymd(d);
                    const dow = (d.getDay() + 6) % 7;
                    const task = taskDays.has(key);
                    const note = hasNote(d);
                    const cls = [
                        'zenith-cal__day',
                        d.getMonth() !== view.m ? 'is-out' : '',
                        key === todayStr ? 'is-today' : '',
                        dow >= 5 ? 'is-weekend' : '',
                    ]
                        .filter(Boolean)
                        .join(' ');
                    return (
                        <button
                            key={key}
                            className={cls}
                            onClick={() => openDay(d)}
                            aria-current={key === todayStr ? 'date' : undefined}
                            title={t('clock.openDay', {
                                date: d.toLocaleDateString(locale, {
                                    day: 'numeric',
                                    month: 'long',
                                }),
                            })}
                        >
                            <span className="zenith-cal__num">{d.getDate()}</span>
                            <span className="zenith-cal__dots">
                                {task && <i className="zenith-cal__dot is-task" />}
                                {note && <i className="zenith-cal__dot is-note" />}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
MiniCalendar.displayName = 'MiniCalendar';

// ── Component ────────────────────────────────────────

/** A card this tall has room for the month under the clock; a shorter one gets the week. */
const MONTH_BELOW_PX = 380;

/**
 * The time, the date, the day as a ruled strip with a needle on the present
 * minute — and the calendar the date belongs to.
 *
 * How much calendar depends on the room, and all of it is in view at once:
 * the month beside the clock where the card is wide enough for both, the
 * month under it where the card is narrow but tall, and this week in a single
 * line where it is neither.
 */
export const TimeWidget: React.FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const [now, setNow] = useState(() => new Date());
    const room = useCardRoom();

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const beside = room.width >= ROOM_MEDIUM;
    const calendar = beside ? 'beside' : room.height >= MONTH_BELOW_PX ? 'below' : 'week';

    const hours = padTwo(now.getHours());
    const minutes = padTwo(now.getMinutes());
    const seconds = padTwo(now.getSeconds());
    const currentHour = now.getHours();
    const progress = dayProgress(now);
    const locale = dateLocale(t);
    const weekday = now.toLocaleDateString(locale, { weekday: 'long' });
    const dayMonth = now.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

    return (
        <div className={`zenith-clock is-${calendar}`}>
            {
                <div className="zenith-clock__main">
                    <div className="zenith-clock__time zenith-wfig">
                        <span>{hours}</span>
                        <span className="zenith-clock__colon">:</span>
                        <span>{minutes}</span>
                        {/* Sits on the digits' own baseline. Raised like a
                            footnote it read as an annotation on the time rather
                            than as part of it. */}
                        <span className="zenith-clock__seconds">{seconds}</span>
                    </div>

                    {/* One line, not two stacked labels: this is a date, and a
                        date is read as a date. */}
                    <div className="zenith-clock__date">
                        <span className="zenith-clock__weekday">{weekday}</span>
                        <span className="zenith-clock__daymonth">{dayMonth}</span>
                    </div>

                    <div className="zenith-clock__day">
                        {/* Two instruments, not one. The hours are the ruler —
                            fixed, countable, with a taller mark every six so the
                            day has landmarks to read against. The needle is the
                            reading, and it moves every minute rather than once
                            an hour, which is the whole difference between a
                            clock and a progress bar. */}
                        <div
                            className="zenith-clock__strip"
                            role="img"
                            aria-label={t('clock.dayLabel', { percent: Math.round(progress) })}
                        >
                            <div className="zenith-clock__hours">
                                {HOURS.map((h) => (
                                    <span
                                        key={h}
                                        className={`zenith-clock__tick ${
                                            h < currentHour ? 'is-past' : ''
                                        } ${h % 6 === 0 ? 'is-mark' : ''}`}
                                        style={
                                            {
                                                '--i': h,
                                                '--glow': hourGlow(h, currentHour),
                                            } as CSSProperties
                                        }
                                    />
                                ))}
                            </div>
                            <span
                                className="zenith-clock__needle"
                                style={{ left: `${progress}%` }}
                                aria-hidden="true"
                            />
                        </div>
                        <div className="zenith-clock__meta">
                            <span>{t('clock.dayElapsed', { percent: Math.round(progress) })}</span>
                            <span>{formatRemaining(t, now)}</span>
                        </div>
                    </div>
                </div>
            }

            {calendar === 'week' ? (
                <WeekRow todayStr={ymd(now)} />
            ) : (
                <MiniCalendar todayStr={ymd(now)} />
            )}
        </div>
    );
};
