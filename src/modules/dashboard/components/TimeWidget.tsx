import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react';
import { moment, TFile, type App } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../widgets';
import { useTranslation } from '../../../core/i18n';

// ── Helpers ──────────────────────────────────────────

function padTwo(n: number): string {
    return n.toString().padStart(2, '0');
}

function dayProgress(date: Date): number {
    const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    return (seconds / 86400) * 100;
}

/** Time left today, precise enough to be worth reading near the end of it. */
function formatRemaining(date: Date): string {
    const mins = 24 * 60 - (date.getHours() * 60 + date.getMinutes());
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m left`;
    if (h < 2) return `${h}h ${m}m left`;
    return `${h}h left`;
}

/** Local `yyyy-mm-dd` key (stable identity for "is this cell today?"). */
function ymd(d: Date): string {
    return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Monday-first weekday labels, localized (Jan 1 2024 was a Monday). */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })
);

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

    const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
    const title = useMemo(
        () => new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        [view]
    );

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
            <div className="zenith-cal__head">
                <button
                    className="zenith-cal__nav"
                    onClick={() => shift(-1)}
                    aria-label={t('clock.prevMonth')}
                >
                    <ChevronLeft size={15} />
                </button>
                <button className="zenith-cal__title" onClick={reset} title={t('clock.thisMonth')}>
                    {title}
                </button>
                <button className="zenith-cal__nav" onClick={() => shift(1)} aria-label={t('clock.nextMonth')}>
                    <ChevronRight size={15} />
                </button>
            </div>

            <div className="zenith-cal__weekdays" aria-hidden="true">
                {WEEKDAYS.map((w, i) => (
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
                            title={`Open daily note — ${key}`}
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
    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const dayMonth = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

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
                        <span className="zenith-clock__seconds">{seconds}</span>
                    </div>
                    <div className="zenith-clock__weekday">{weekday}</div>
                    <div className="zenith-clock__date">{dayMonth}</div>

                    <div className="zenith-clock__day">
                        <div
                            className="zenith-clock__hours"
                            role="img"
                            aria-label={`${Math.round(progress)} percent of the day elapsed`}
                        >
                            {HOURS.map((h) => (
                                <span
                                    key={h}
                                    className={`zenith-clock__tick ${h < currentHour ? 'is-past' : ''} ${
                                        h === currentHour ? 'is-now' : ''
                                    }`}
                                />
                            ))}
                        </div>
                        <div className="zenith-clock__meta">
                            <span>{Math.round(progress)}% of day</span>
                            <span>{formatRemaining(now)}</span>
                        </div>
                    </div>
                </div>
            )}

            {showCalendar && <MiniCalendar todayStr={ymd(now)} />}

            {compact && (
                <button
                    className="zenith-clock__toggle"
                    onClick={() => setView((v) => (v === 'clock' ? 'calendar' : 'clock'))}
                    aria-label={view === 'clock' ? 'Show calendar' : 'Show clock'}
                    title={view === 'clock' ? 'Show calendar' : 'Show clock'}
                >
                    {view === 'clock' ? <CalendarDays size={16} /> : <Clock size={16} />}
                </button>
            )}
        </div>
    );
};
