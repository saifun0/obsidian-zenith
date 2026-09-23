import { describe, it, expect } from 'vitest';
import {
    CATCH_UP_MS,
    MAX_SLEEP_MS,
    Scheduler,
    type EventSource,
    type SourceEvent,
} from '../src/core/scheduler';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 8, 23, 12, 0, 0);

/**
 * A clock and a timer queue the test drives by hand. `advance` is time passing
 * with the machine awake — timers fire as their moments come. `sleep` is the
 * lid closed: the clock jumps and nothing fires until something wakes it.
 */
function harness(watermark: number | null) {
    let now = T0;
    let saved = watermark;
    let seq = 0;
    const timers = new Map<number, { fn: () => void; at: number }>();

    const scheduler = new Scheduler({
        now: () => now,
        setTimer: (fn, ms) => {
            timers.set(++seq, { fn, at: now + ms });
            return seq;
        },
        clearTimer: (id) => void timers.delete(id),
        loadWatermark: () => saved,
        saveWatermark: (at) => void (saved = at),
    });

    const nextTimer = () =>
        [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0] as
            | [number, { fn: () => void; at: number }]
            | undefined;

    return {
        scheduler,
        get now() {
            return now;
        },
        get watermark() {
            return saved;
        },
        timerDelay: () => {
            const t = nextTimer();
            return t ? t[1].at - now : null;
        },
        advance(ms: number) {
            const end = now + ms;
            for (let t = nextTimer(); t && t[1].at <= end; t = nextTimer()) {
                timers.delete(t[0]);
                now = t[1].at;
                t[1].fn();
            }
            now = end;
        },
        sleep(ms: number) {
            now += ms;
        },
        fireOverdue() {
            const t = nextTimer();
            if (t && t[1].at <= now) {
                timers.delete(t[0]);
                t[1].fn();
            }
        },
    };
}

/** A source with a fixed list of events, recording what it was told. */
function source(id: string, events: SourceEvent[]) {
    const told: Array<{ key: string; late: boolean }> = [];
    const src: EventSource & { told: typeof told; events_: SourceEvent[] } = {
        id,
        told,
        events_: events,
        events: (from, to) => src.events_.filter((e) => e.at >= from && e.at < to),
        deliver: (event, late) => void told.push({ key: event.key, late }),
    };
    return src;
}

describe('the scheduler', () => {
    it('delivers an event when its moment comes, on time', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'x', at: T0 + 30 * MIN }]);
        h.scheduler.register(s);
        h.scheduler.start();

        expect(h.timerDelay()).toBe(30 * MIN);
        h.advance(30 * MIN);
        expect(s.told).toEqual([{ key: 'x', late: false }]);
        expect(h.watermark).toBe(T0 + 30 * MIN);
    });

    it('delivers each event once', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'x', at: T0 + MIN }]);
        h.scheduler.register(s);
        h.scheduler.start();
        h.advance(3 * HOUR);
        h.scheduler.reschedule();
        h.advance(3 * HOUR);
        expect(s.told).toHaveLength(1);
    });

    it('catches up on what was missed while it was not running, as missed', () => {
        const h = harness(T0 - 5 * HOUR);
        const s = source('a', [
            { key: 'before-watermark', at: T0 - 6 * HOUR },
            { key: 'missed', at: T0 - 2 * HOUR },
            { key: 'just-now', at: T0 - MIN },
        ]);
        h.scheduler.register(s);
        h.scheduler.start();

        expect(s.told).toEqual([
            { key: 'missed', late: true },
            // A minute is within the grace a timer is allowed.
            { key: 'just-now', late: false },
        ]);
    });

    it('looks back no further than it promises', () => {
        const h = harness(T0 - 10 * 86_400_000);
        const s = source('a', [
            { key: 'too-old', at: T0 - CATCH_UP_MS - HOUR },
            { key: 'recent', at: T0 - HOUR },
        ]);
        h.scheduler.register(s);
        h.scheduler.start();
        expect(s.told.map((t) => t.key)).toEqual(['recent']);
    });

    it('has nothing to catch up with on a device that never ran it', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'old', at: T0 - HOUR }]);
        h.scheduler.register(s);
        h.scheduler.start();
        expect(s.told).toEqual([]);
    });

    it('treats a watermark from the future as a clock moved back', () => {
        const h = harness(T0 + 5 * HOUR);
        const s = source('a', [{ key: 'soon', at: T0 + HOUR }]);
        h.scheduler.register(s);
        h.scheduler.start();
        h.advance(HOUR);
        expect(s.told).toEqual([{ key: 'soon', late: false }]);
    });

    it('delivers as missed what a sleeping machine slept through', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'x', at: T0 + 30 * MIN }]);
        h.scheduler.register(s);
        h.scheduler.start();

        h.sleep(3 * HOUR);
        h.fireOverdue();
        expect(s.told).toEqual([{ key: 'x', late: true }]);
    });

    it('does the same when something asks to re-aim before the late timer fires', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'x', at: T0 + 30 * MIN }]);
        h.scheduler.register(s);
        h.scheduler.start();

        h.sleep(3 * HOUR);
        h.scheduler.reschedule();
        expect(s.told).toEqual([{ key: 'x', late: true }]);
    });

    /**
     * A reminder moved to ten minutes ago was never due while it existed. It
     * is not missed, and it is not announced.
     */
    it('does not announce an event a change put in the past', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'later', at: T0 + 5 * HOUR }]);
        h.scheduler.register(s);
        h.scheduler.start();

        h.advance(HOUR);
        s.events_ = [{ key: 'moved', at: T0 + 30 * MIN }, ...s.events_];
        h.scheduler.reschedule();
        h.advance(5 * HOUR);
        expect(s.told.map((t) => t.key)).toEqual(['later']);
    });

    it('re-aims at least hourly', () => {
        const h = harness(null);
        h.scheduler.register(source('a', [{ key: 'far', at: T0 + 30 * HOUR }]));
        h.scheduler.start();
        expect(h.timerDelay()).toBe(MAX_SLEEP_MS);
    });

    it('starts a source registered mid-session from now', () => {
        const h = harness(T0 - 5 * HOUR);
        h.scheduler.start();
        const late = source('late', [{ key: 'old', at: T0 - HOUR }, { key: 'new', at: T0 + HOUR }]);
        h.scheduler.register(late);
        h.advance(2 * HOUR);
        expect(late.told).toEqual([{ key: 'new', late: false }]);
    });

    it('keeps going when a source fails', () => {
        const h = harness(null);
        const broken: EventSource = {
            id: 'broken',
            events: () => {
                throw new Error('no');
            },
            deliver: () => undefined,
        };
        const fine = source('fine', [{ key: 'x', at: T0 + MIN }]);
        h.scheduler.register(broken);
        h.scheduler.register(fine);
        h.scheduler.start();
        h.advance(MIN);
        expect(fine.told).toEqual([{ key: 'x', late: false }]);
    });

    it('lets a source re-aim from inside a delivery without telling anything twice', () => {
        const h = harness(null);
        const s = source('a', [
            { key: 'x', at: T0 + MIN },
            { key: 'y', at: T0 + 2 * MIN },
        ]);
        const deliver = s.deliver;
        s.deliver = (event, late) => {
            deliver(event, late);
            h.scheduler.reschedule();
        };
        h.scheduler.register(s);
        h.scheduler.start();
        h.advance(10 * MIN);
        expect(s.told.map((t) => t.key)).toEqual(['x', 'y']);
    });

    it('stops', () => {
        const h = harness(null);
        const s = source('a', [{ key: 'x', at: T0 + MIN }]);
        h.scheduler.register(s);
        h.scheduler.start();
        h.scheduler.stop();
        h.advance(HOUR);
        expect(s.told).toEqual([]);
    });
});
