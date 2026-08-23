/**
 * The task timer: a countdown that also keeps the score.
 *
 * Two things were asked for and they turn out to be one mechanism. A countdown
 * is a running clock with a target; time tracking is a running clock without
 * one. So a session records when it started and, optionally, how long it was
 * meant to be — and on stopping, whichever it was, the elapsed time is added to
 * the task's total.
 *
 * Only one session runs at a time. Two timers running at once would claim you
 * are working on two tasks simultaneously, and the total each recorded would be
 * a lie about the same wall-clock minutes.
 *
 * Nothing here reads the clock itself: `now` is passed in. That is what makes
 * "what happens after 26 minutes" a test rather than a wait.
 */

export interface TimerSession {
    /** `filePath:lineNumber` — the same id a task carries. */
    taskId: string;
    filePath: string;
    lineNumber: number;
    /** Kept for the notification, which fires when nothing is on screen. */
    title: string;
    /** Epoch ms. */
    startedAt: number;
    /** Minutes the countdown was set to; 0 runs as a plain stopwatch. */
    countdownMinutes: number;
    /** The task's total before this session, so the sum can be written on stop. */
    baseMinutes: number;
    /** Set once the countdown has been announced, so it announces once. */
    notified: boolean;
}

/** Seconds elapsed since the session started. Never negative. */
export function elapsedSeconds(session: TimerSession, now: number): number {
    return Math.max(0, Math.floor((now - session.startedAt) / 1000));
}

/**
 * Seconds left on the countdown; negative once it has run over, and `null` for
 * a stopwatch, which has nothing to count towards.
 */
export function remainingSeconds(session: TimerSession, now: number): number | null {
    if (session.countdownMinutes <= 0) return null;
    return session.countdownMinutes * 60 - elapsedSeconds(session, now);
}

/** Whether a countdown has reached zero and not yet been announced. */
export function isDue(session: TimerSession, now: number): boolean {
    const left = remainingSeconds(session, now);
    return left !== null && left <= 0 && !session.notified;
}

/**
 * The total to write when a session ends.
 *
 * Rounded to the nearest minute because that is the resolution the line stores;
 * a session shorter than half a minute rounds to nothing and the caller is told
 * so by getting back the base unchanged — there is no point rewriting a file to
 * record twenty seconds.
 */
export function totalAfter(session: TimerSession, now: number): number {
    const minutes = Math.round(elapsedSeconds(session, now) / 60);
    return session.baseMinutes + minutes;
}

/** Whether stopping now would actually change the stored total. */
export function isWorthWriting(session: TimerSession, now: number): boolean {
    return totalAfter(session, now) > session.baseMinutes;
}

/** `01:05:09` past an hour, `25:00` below it. */
export function formatClock(totalSeconds: number): string {
    const abs = Math.max(0, Math.floor(Math.abs(totalSeconds)));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** What the running row shows: the countdown, or the stopwatch. */
export function displayClock(session: TimerSession, now: number): string {
    const left = remainingSeconds(session, now);
    if (left === null) return formatClock(elapsedSeconds(session, now));
    // Past zero it keeps counting, with a sign — a countdown that froze at
    // 00:00 would hide how long ago it finished.
    return left < 0 ? `−${formatClock(left)}` : formatClock(left);
}

/** Whether this session belongs to the given line. */
export function isRunningFor(
    session: TimerSession | null | undefined,
    filePath: string,
    lineNumber: number
): boolean {
    return !!session && session.filePath === filePath && session.lineNumber === lineNumber;
}

/**
 * Read a session back from settings.
 *
 * It survives a restart of Obsidian, which is the point — a timer that stopped
 * because you closed a tab would be a stopwatch you have to babysit. Anything
 * malformed is dropped: a half-written session would otherwise report a
 * start time of `NaN` and count since 1970.
 */
export function normalizeSession(raw: unknown): TimerSession | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Partial<TimerSession>;
    if (typeof s.filePath !== 'string' || !s.filePath) return null;
    if (typeof s.lineNumber !== 'number' || !Number.isFinite(s.lineNumber)) return null;
    if (typeof s.startedAt !== 'number' || !Number.isFinite(s.startedAt) || s.startedAt <= 0) {
        return null;
    }
    return {
        taskId: typeof s.taskId === 'string' ? s.taskId : `${s.filePath}:${s.lineNumber}`,
        filePath: s.filePath,
        lineNumber: s.lineNumber,
        title: typeof s.title === 'string' ? s.title : '',
        startedAt: s.startedAt,
        countdownMinutes:
            typeof s.countdownMinutes === 'number' && s.countdownMinutes > 0
                ? Math.round(s.countdownMinutes)
                : 0,
        baseMinutes:
            typeof s.baseMinutes === 'number' && s.baseMinutes > 0 ? Math.round(s.baseMinutes) : 0,
        notified: s.notified === true,
    };
}

/** Start a session for a line. */
export function startSession(args: {
    filePath: string;
    lineNumber: number;
    title: string;
    countdownMinutes?: number;
    spentMinutes?: number;
    now: number;
}): TimerSession {
    return {
        taskId: `${args.filePath}:${args.lineNumber}`,
        filePath: args.filePath,
        lineNumber: args.lineNumber,
        title: args.title,
        startedAt: args.now,
        countdownMinutes: Math.max(0, Math.round(args.countdownMinutes ?? 0)),
        baseMinutes: Math.max(0, Math.round(args.spentMinutes ?? 0)),
        notified: false,
    };
}
