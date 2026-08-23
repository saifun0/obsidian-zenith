import { describe, it, expect } from 'vitest';
import {
    displayClock,
    elapsedSeconds,
    formatClock,
    isDue,
    isRunningFor,
    isWorthWriting,
    normalizeSession,
    remainingSeconds,
    startSession,
    totalAfter,
    type TimerSession,
} from '../src/modules/tasks/services/taskTimer';

/**
 * The timer is a countdown and a stopwatch at once, which makes "what does it
 * say after N minutes" the question worth asking from every angle. Nothing here
 * reads the clock — `now` is an argument — so twenty-six minutes of elapsed
 * time costs a test nothing.
 */

const START = Date.UTC(2026, 7, 11, 12, 0, 0);
const at = (seconds: number): number => START + seconds * 1000;

const session = (over: Partial<TimerSession> = {}): TimerSession =>
    startSession({
        filePath: 'Tasks.md',
        lineNumber: 42,
        title: 'Zenith 0.1.0',
        now: START,
        ...over,
    });

describe('a running session', () => {
    it('counts up from the moment it started', () => {
        const s = session();
        expect(elapsedSeconds(s, START)).toBe(0);
        expect(elapsedSeconds(s, at(90))).toBe(90);
    });

    it('never counts backwards when the clock jumps', () => {
        // A device waking with a corrected clock, or a session synced from
        // another machine a few seconds ahead.
        expect(elapsedSeconds(session(), START - 5000)).toBe(0);
    });

    it('has nothing to count towards without a countdown', () => {
        expect(remainingSeconds(session(), at(60))).toBeNull();
        expect(displayClock(session(), at(65))).toBe('01:05');
    });

    it('counts a countdown down, then past zero', () => {
        const s = session({ countdownMinutes: 25 });
        expect(remainingSeconds(s, START)).toBe(1500);
        expect(displayClock(s, START)).toBe('25:00');
        expect(displayClock(s, at(60))).toBe('24:00');
        expect(displayClock(s, at(1500))).toBe('00:00');
        // Past the end it keeps going, with a sign — freezing at zero would
        // hide how long ago it finished.
        expect(displayClock(s, at(1560))).toBe('−01:00');
    });

    it('shows hours once there are any', () => {
        expect(formatClock(59)).toBe('00:59');
        expect(formatClock(600)).toBe('10:00');
        expect(formatClock(3661)).toBe('1:01:01');
    });
});

describe('announcing the end', () => {
    it('is due exactly at zero, not before', () => {
        const s = session({ countdownMinutes: 25 });
        expect(isDue(s, at(1499))).toBe(false);
        expect(isDue(s, at(1500))).toBe(true);
        expect(isDue(s, at(2000))).toBe(true);
    });

    it('announces once, however long it keeps running', () => {
        const s = { ...session({ countdownMinutes: 25 }), notified: true };
        expect(isDue(s, at(3000))).toBe(false);
    });

    it('never announces a stopwatch — there is nothing to announce', () => {
        expect(isDue(session(), at(100_000))).toBe(false);
    });
});

describe('what gets written on stop', () => {
    it('adds the session to what the task already had', () => {
        const s = session({ spentMinutes: 85 });
        expect(totalAfter(s, at(25 * 60))).toBe(110);
    });

    it('rounds to the nearest minute', () => {
        const s = session();
        expect(totalAfter(s, at(89))).toBe(1);
        expect(totalAfter(s, at(91))).toBe(2);
    });

    it('writes nothing for a session too short to round up', () => {
        const s = session({ spentMinutes: 10 });
        expect(isWorthWriting(s, at(20))).toBe(false);
        expect(totalAfter(s, at(20))).toBe(10);
        // Half a minute is where it starts being worth a file write.
        expect(isWorthWriting(s, at(31))).toBe(true);
    });

    it('counts the whole run of a countdown, overtime included', () => {
        // Twenty-five minutes set, thirty actually worked — thirty is the truth.
        const s = session({ countdownMinutes: 25 });
        expect(totalAfter(s, at(30 * 60))).toBe(30);
    });
});

describe('which row is running', () => {
    it('matches on the file and the line, not the title', () => {
        const s = session();
        expect(isRunningFor(s, 'Tasks.md', 42)).toBe(true);
        expect(isRunningFor(s, 'Tasks.md', 43)).toBe(false);
        expect(isRunningFor(s, 'Other.md', 42)).toBe(false);
        expect(isRunningFor(null, 'Tasks.md', 42)).toBe(false);
    });
});

describe('reading a session back after a restart', () => {
    it('survives a real one', () => {
        const s = session({ countdownMinutes: 25, spentMinutes: 10 });
        expect(normalizeSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });

    it('drops one that could not be timed', () => {
        // Without a start time it would count from 1970.
        expect(normalizeSession(null)).toBeNull();
        expect(normalizeSession({ filePath: 'a.md', lineNumber: 1 })).toBeNull();
        expect(normalizeSession({ filePath: 'a.md', lineNumber: 1, startedAt: 0 })).toBeNull();
        expect(normalizeSession({ filePath: '', lineNumber: 1, startedAt: START })).toBeNull();
        expect(normalizeSession({ filePath: 'a.md', startedAt: START })).toBeNull();
    });

    it('repairs the fields it can', () => {
        const s = normalizeSession({
            filePath: 'a.md',
            lineNumber: 3,
            startedAt: START,
            countdownMinutes: -5,
            baseMinutes: 12.4,
        });
        expect(s).toMatchObject({
            taskId: 'a.md:3',
            title: '',
            countdownMinutes: 0,
            baseMinutes: 12,
        });
    });
});
