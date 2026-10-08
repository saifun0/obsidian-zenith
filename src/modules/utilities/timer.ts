import { widgetIdOf } from '../dashboard/grid/widgetInstances';

/**
 * The timer widget, as data.
 *
 * A kitchen timer: so many minutes, counted down, and a word when they are up.
 * A running timer is stored as the moment it ends rather than as seconds left,
 * which is what lets it keep time while the board is closed, across a restart,
 * and on another device — nothing has to tick for it to be right.
 */

/** The widget's id, and the head of every copy's (`picture.timer#2`). */
export const TIMER_WIDGET_ID = 'picture.timer';

/** The notification source a finished timer is told through. */
export const TIMER_SOURCE = 'timer';

/** Lengths offered on the card, in minutes. */
export const TIMER_PRESETS: readonly number[] = [5, 15, 25, 45] as const;

export const TIMER_MIN_MINUTES = 1;
export const TIMER_MAX_MINUTES = 600;

/**
 * How long a finished timer goes on saying so. Long enough to be seen by
 * someone who was away from the board when it rang; not so long that a card
 * still reads "time's up" the next morning.
 */
export const TIMER_DONE_MS = 60 * 60_000;

export interface TimerSettings extends Record<string, unknown> {
    /** The length a start counts down from. */
    timerMinutes: number;
    /** Epoch ms the running timer ends at; 0 while it is not running. */
    timerEndsAt: number;
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = { timerMinutes: 25, timerEndsAt: 0 };

/** A length in whole minutes, inside what the card can count. */
export function clampMinutes(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return DEFAULT_TIMER_SETTINGS.timerMinutes;
    return Math.min(TIMER_MAX_MINUTES, Math.max(TIMER_MIN_MINUTES, Math.round(n)));
}

export function normalizeTimerSettings(raw: Record<string, unknown> | undefined): TimerSettings {
    if (!raw) return DEFAULT_TIMER_SETTINGS;
    const endsAt = typeof raw.timerEndsAt === 'number' && raw.timerEndsAt > 0 ? raw.timerEndsAt : 0;
    return {
        timerMinutes:
            raw.timerMinutes === undefined
                ? DEFAULT_TIMER_SETTINGS.timerMinutes
                : clampMinutes(raw.timerMinutes),
        timerEndsAt: endsAt,
    };
}

export type TimerState =
    | { kind: 'idle' }
    /** Counting down: whole seconds left, never less than one. */
    | { kind: 'running'; left: number }
    /** The time is up and nobody has put the timer away yet. */
    | { kind: 'done' };

export function timerState(settings: TimerSettings, now: number): TimerState {
    if (!settings.timerEndsAt) return { kind: 'idle' };
    const left = Math.ceil((settings.timerEndsAt - now) / 1000);
    if (left > 0) return { kind: 'running', left };
    return now - settings.timerEndsAt < TIMER_DONE_MS ? { kind: 'done' } : { kind: 'idle' };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `24:59`, and `1:02:03` once there are hours to say. */
export function formatClock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export interface TimerEvent {
    /** One per run of one card: a restart is a new moment, and a new key. */
    key: string;
    at: number;
    /** The card whose timer it is. */
    instanceId: string;
    minutes: number;
}

/**
 * Every timer due in `[from, to)`, read straight out of the cards' settings.
 *
 * The settings are the only record there is. A further copy taken off the
 * board loses its bucket with it (see `withoutWidgetConfig`); the first copy is
 * only hidden and keeps its own, so a timer left running on it still rings —
 * it was started, after all.
 */
export function timerEvents(
    widgetConfig: Record<string, Record<string, unknown>>,
    from: number,
    to: number
): TimerEvent[] {
    const events: TimerEvent[] = [];
    for (const [instanceId, bucket] of Object.entries(widgetConfig)) {
        if (widgetIdOf(instanceId) !== TIMER_WIDGET_ID) continue;
        const { timerEndsAt, timerMinutes } = normalizeTimerSettings(bucket);
        // Zero is "not running", not a moment in 1970.
        if (!timerEndsAt || timerEndsAt < from || timerEndsAt >= to) continue;
        events.push({
            key: `${TIMER_SOURCE}:${instanceId}:${timerEndsAt}`,
            at: timerEndsAt,
            instanceId,
            minutes: timerMinutes,
        });
    }
    return events;
}

/** The ends of every running timer, as one string: what a reschedule waits on. */
export function timerSignature(widgetConfig: Record<string, Record<string, unknown>>): string {
    return Object.entries(widgetConfig)
        .filter(([id]) => widgetIdOf(id) === TIMER_WIDGET_ID)
        .map(([id, bucket]) => `${id}=${normalizeTimerSettings(bucket).timerEndsAt}`)
        .sort()
        .join('|');
}
