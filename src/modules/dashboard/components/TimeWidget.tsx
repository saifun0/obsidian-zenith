import React, { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react';
import { moment, TFile, type App } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../widgets';
import { useTranslation, type Translator } from '../../../core/i18n';

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
    return t.locale === 'ru' ? 'ru-RU' : 'en-GB';
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

interface DailyNotesOptions {
    folder?: string;
    format?: string;
}

/** Read the core Daily Notes plugin's folder/format (untyped internal API);
 *  falls back to a sensible default when the plugin is off. */
function dailyNotesOptions(app: App): DailyNotesOptions {
    const internal = (
        app as unknown as {
            internalPlugins?: {
                getPluginById?(id: string): { instance?: { options?: DailyNotesOptions } } | null;
            };
        }
    ).internalPlugins;
    return internal?.getPluginById?.('daily-notes')?.instance?.options ?? {};
}

/** Vault path of the daily note for `date`, honouring the configured format. */
function dailyNotePath(opts: DailyNotesOptions, date: Date): string {
    // Obsidian's exported `moment` is typed as a namespace; it's callable at
    // runtime, so cast to the small function shape we need.
    const m = moment as unknown as (inp?: Date) => { format(fmt: string): string };
    const name = m(date).format(opts.format?.trim() || 'YYYY-MM-DD');
    const dir = (opts.folder ?? '').replace(/^\/+|\/+$/g, '');
    return `${dir ? `${dir}/` : ''}${name}.md`;
}

/** Open the daily note for `date`, creating it (and any parent folder) if it
 *  doesn't exist yet. Opens in a new tab so the dashboard stays put. */
async function openDailyNote(app: App, date: Date): Promise<void> {
    const path = dailyNotePath(dailyNotesOptions(app), date);
    let file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        const slash = path.lastIndexOf('/');
        if (slash > 0) {
            const parent = path.slice(0, slash);
            if (!app.vault.getAbstractFileByPath(parent)) {
                await app.vault.createFolder(parent).catch(() => undefined);
            }
        }
        try {
            file = await app.vault.create(path, '');
        } catch {
            // Lost a create race (or similar) — fall back to whatever's there now.
            file = app.vault.getAbstractFileByPath(path);
        }
    }
    if (file instanceof TFile) {
        await app.workspace.getLeaf('tab').openFile(file);
    }
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
const MiniCalendar: React.FC<{ todayStr: string }> = React.memo(({ todayStr }) => {
    const t = useTranslation();
    const { app } = useApp();
    const tasks = useZenithStore((s) => s.tasks);

    const [view, setView] = useState(() => {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth() };
    });
    // Bumped after creating a note so its dot appears without a full reload.
    const [tick, setTick] = useState(0);

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

    const dnOpts = useMemo(() => dailyNotesOptions(app), [app]);
    const hasNote = (d: Date): boolean =>
        app.vault.getAbstractFileByPath(dailyNotePath(dnOpts, d)) instanceof TFile;
    void tick; // `hasNote` reads the vault live; `tick` just forces a recheck.

    const shift = (delta: number) =>
        setView((v) => {
            const d = new Date(v.y, v.m + delta, 1);
            return { y: d.getFullYear(), m: d.getMonth() };
        });
    const reset = () => {
        const d = new Date();
        setView({ y: d.getFullYear(), m: d.getMonth() });
    };
    const openDay = (d: Date) => {
        void openDailyNote(app, d).then(() => setTick((n) => n + 1));
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

/** Below this content width the clock + calendar can't sit side by side without
 *  clipping, so we collapse to one pane at a time behind a floating toggle. The
 *  34px added padding in compact mode keeps a comfortable hysteresis gap, so the
 *  layout doesn't flip back and forth right at the boundary. */
const COMPACT_WIDTH = 400;

/**
 * The clock (big time, weekday, date, 24-hour day strip) and a functional month
 * calendar. Wide cards show both side by side; narrow ones (a sidebar leaf) show
 * a single pane the user flips with a floating toggle on the right edge.
 */
export const TimeWidget: React.FC<DashboardWidgetProps> = ({ size = 'sm' }) => {
    const t = useTranslation();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const rootRef = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);
    const [view, setView] = useState<'clock' | 'calendar'>('clock');

    // Switch layouts on the widget's own width, not the window's — a widget can
    // be narrow in a sidebar while the window is wide.
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
            setCompact(entries[0].contentRect.width < COMPACT_WIDTH);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const hours = padTwo(now.getHours());
    const minutes = padTwo(now.getMinutes());
    const seconds = padTwo(now.getSeconds());
    const currentHour = now.getHours();
    const progress = dayProgress(now);
    const locale = dateLocale(t);
    const weekday = now.toLocaleDateString(locale, { weekday: 'long' });
    const dayMonth = now.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

    const showClock = !compact || view === 'clock';
    const showCalendar = !compact || view === 'calendar';

    return (
        <div
            ref={rootRef}
            className={`zenith-clock zenith-clock--${size} ${compact ? 'is-compact' : ''}`}
        >
            {showClock && (
                <div className="zenith-clock__main">
                    <div className="zenith-clock__time zenith-serif">
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
            )}

            {showCalendar && <MiniCalendar todayStr={ymd(now)} />}

            {compact && (
                <button
                    className="zenith-clock__toggle"
                    onClick={() => setView((v) => (v === 'clock' ? 'calendar' : 'clock'))}
                    aria-label={t(view === 'clock' ? 'clock.showCalendar' : 'clock.showClock')}
                    title={t(view === 'clock' ? 'clock.showCalendar' : 'clock.showClock')}
                >
                    {view === 'clock' ? <CalendarDays size={16} /> : <Clock size={16} />}
                </button>
            )}
        </div>
    );
};
