/**
 * The one timer every reminder in the plugin shares.
 *
 * Prayer reminders had a timer of their own, aimed at the next prayer; task
 * reminders, rituals and countdowns would each have wanted one too, and each
 * would have had to learn the same three lessons separately: a sleeping laptop
 * fires a timer late, a timer set for next week does not survive the clock
 * being moved, and an event whose moment passed while Obsidian was closed is
 * gone unless somebody goes back for it.
 *
 * So there is one. Sources say what is due and when; the scheduler points a
 * single timer at the soonest of it, and hands each event back to its source
 * when its time comes — saying whether it came on time or was missed.
 *
 * "Handled up to" is a watermark kept per device. Everything due at or before
 * it has been delivered; everything after it has not. On start, whatever fell
 * between the watermark and now — the stretch nobody was here for — is
 * delivered as missed rather than dropped.
 */

/** Something due at a moment. */
export interface SourceEvent {
    /** Stable for one occurrence — `prayer:2026-09-23:maghrib` — so it is never told twice. */
    key: string;
    /** When it is due, epoch ms. */
    at: number;
}

export interface EventSource<E extends SourceEvent = SourceEvent> {
    id: string;
    /** Every event due in `[from, to)`, in any order. */
    events(from: number, to: number): E[];
    /**
     * Tell it. `late` is true for an event whose moment passed unseen — the
     * computer asleep, Obsidian closed — so the source can record it without
     * announcing, two hours on, that something is happening now.
     */
    deliver(event: E, late: boolean): void;
}

/**
 * How late an event may be and still count as on time. A timer fires a
 * little late as a matter of course; one that fires after a sleep is late in
 * a way that changes what the notice would mean.
 */
export const LATE_MS = 5 * 60_000;

/**
 * How far back a start looks for what was missed. A notice is about a day;
 * a week of prayer reminders read out after a holiday is a flood, not a
 * record anyone would go through.
 */
export const CATCH_UP_MS = 3 * 86_400_000;

/** How far ahead the next event is looked for. */
export const LOOKAHEAD_MS = 2 * 86_400_000;

/**
 * The longest the timer is ever set for. It is re-aimed at least this often,
 * so a clock changed by hand or a machine that slept is noticed within the
 * hour rather than whenever the old timer happens to go off.
 */
export const MAX_SLEEP_MS = 60 * 60_000;

export interface SchedulerHost {
    now(): number;
    setTimer(fn: () => void, ms: number): number;
    clearTimer(handle: number): void;
    /** The stored watermark, or null on a device that never ran one. */
    loadWatermark(): number | null;
    saveWatermark(at: number): void;
}

export class Scheduler {
    private readonly sources = new Map<string, EventSource>();
    private timer: number | null = null;
    private running = false;
    private watermark = 0;
    /** When the armed timer ought to go off. Past it, the timer is overdue. */
    private expected = Infinity;
    /** Delivering: a source re-aiming from inside `deliver` waits for the run to finish. */
    private delivering = false;

    constructor(private readonly host: SchedulerHost) {}

    /** Add a source; returns what removes it. */
    register<E extends SourceEvent>(source: EventSource<E>): () => void {
        this.sources.set(source.id, source as unknown as EventSource);
        this.reschedule();
        return () => {
            if (this.sources.get(source.id) === (source as unknown as EventSource)) {
                this.sources.delete(source.id);
                this.reschedule();
            }
        };
    }

    /** The ids of every source registered, for settings that list them. */
    sourceIds(): string[] {
        return [...this.sources.keys()];
    }

    /**
     * Begin: deliver what was missed since the watermark, then wait for the
     * next thing. Sources registered before this are caught up; a source that
     * arrives later — a module switched on mid-session — starts from now.
     */
    start(): void {
        if (this.running) return;
        this.running = true;
        const now = this.host.now();
        const stored = this.host.loadWatermark();
        // No watermark is a device that never ran this: there is nothing it
        // could have missed. One from the future is a clock moved back, and
        // waiting for the clock to catch up would miss everything meanwhile.
        this.watermark =
            stored === null || stored > now ? now : Math.max(stored, now - CATCH_UP_MS);
        this.run();
    }

    stop(): void {
        this.running = false;
        this.expected = Infinity;
        this.clear();
    }

    /**
     * Re-aim after anything that may have moved an event — a setting, new data.
     *
     * The watermark moves up to now as it does. An event the change put in the
     * past — a reminder moved to ten minutes ago — was never due while it
     * existed, so it is not "missed"; it simply never happens. The one
     * exception is a timer already overdue: the machine slept through it, and
     * what fell in that gap is delivered as missed before anything moves.
     */
    reschedule(): void {
        if (!this.running || this.delivering) return;
        const now = this.host.now();
        if (now >= this.expected) {
            this.run();
            return;
        }
        this.advance(now);
        this.arm();
    }

    private advance(now: number): void {
        if (now <= this.watermark) return;
        this.watermark = now;
        this.host.saveWatermark(now);
    }

    private clear(): void {
        if (this.timer !== null) {
            this.host.clearTimer(this.timer);
            this.timer = null;
        }
    }

    /** Deliver everything due since the watermark, then wait again. */
    private run(): void {
        this.clear();
        const now = this.host.now();
        if (now > this.watermark) {
            const due: Array<[EventSource, SourceEvent]> = [];
            for (const source of this.sources.values()) {
                for (const event of safeEvents(source, this.watermark + 1, now + 1)) {
                    due.push([source, event]);
                }
            }
            due.sort((a, b) => a[1].at - b[1].at);
            this.delivering = true;
            for (const [source, event] of due) {
                try {
                    source.deliver(event, now - event.at > LATE_MS);
                } catch (err) {
                    console.error(`Zenith: reminder from "${source.id}" failed:`, err);
                }
            }
            this.delivering = false;
            this.advance(now);
        }
        this.arm();
    }

    private arm(): void {
        this.clear();
        const now = this.host.now();
        let next = Infinity;
        for (const source of this.sources.values()) {
            for (const event of safeEvents(source, now + 1, now + LOOKAHEAD_MS)) {
                if (event.at < next) next = event.at;
            }
        }
        const delay = Math.min(Math.max(0, next - now), MAX_SLEEP_MS);
        this.expected = now + delay;
        this.timer = this.host.setTimer(() => this.run(), delay);
    }
}

/** A source that throws is logged and skipped, not allowed to stop the rest. */
function safeEvents(source: EventSource, from: number, to: number): SourceEvent[] {
    try {
        return source.events(from, to);
    } catch (err) {
        console.error(`Zenith: reminders from "${source.id}" could not be read:`, err);
        return [];
    }
}
