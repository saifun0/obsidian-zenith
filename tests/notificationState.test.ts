import { describe, it, expect } from 'vitest';
import {
    EMPTY_NOTIFICATIONS,
    HISTORY_MS,
    MAX_RECORDS,
    addRecord,
    clearRead,
    isQuiet,
    markAllRead,
    markRead,
    normalizeNotifications,
    removeRecord,
    snoozeRecord,
    snoozeUntil,
    splitByDay,
    unreadCount,
    visibleRecords,
    wakeRecord,
    type NotificationRecord,
} from '../src/core/notifications/notificationState';

const NOW = new Date(2026, 8, 23, 12, 0, 0).getTime();
const HOUR = 3_600_000;

const record = (id: string, patch: Partial<NotificationRecord> = {}): NotificationRecord => ({
    id,
    key: `key:${id}`,
    source: 'prayer',
    title: id,
    at: NOW,
    createdAt: NOW,
    ...patch,
});

describe('recording', () => {
    it('keeps one record per occurrence', () => {
        let s = addRecord(EMPTY_NOTIFICATIONS, record('a'), NOW);
        s = addRecord(s, record('a2', { key: 'key:a' }), NOW);
        expect(s.records.map((r) => r.id)).toEqual(['a']);
    });

    it('keeps the newest first', () => {
        let s = addRecord(EMPTY_NOTIFICATIONS, record('old', { at: NOW - HOUR }), NOW);
        s = addRecord(s, record('new'), NOW);
        expect(s.records.map((r) => r.id)).toEqual(['new', 'old']);
    });

    it('forgets what is older than a month, and what is over the limit', () => {
        let s = addRecord(
            EMPTY_NOTIFICATIONS,
            record('ancient', { createdAt: NOW - HISTORY_MS - HOUR, at: NOW - HISTORY_MS - HOUR }),
            NOW - HISTORY_MS - HOUR
        );
        s = addRecord(s, record('fresh'), NOW);
        expect(s.records.map((r) => r.id)).toEqual(['fresh']);

        for (let i = 0; i < MAX_RECORDS + 5; i++) {
            s = addRecord(s, record(`r${i}`, { at: NOW + i }), NOW);
        }
        expect(s.records).toHaveLength(MAX_RECORDS);
        expect(s.records[0].id).toBe(`r${MAX_RECORDS + 4}`);
    });
});

describe('reading and clearing', () => {
    const base = { records: [record('a'), record('b', { readAt: NOW })], watermark: null };

    it('counts what is unread', () => {
        expect(unreadCount(base, NOW)).toBe(1);
        expect(unreadCount(markRead(base, 'a', NOW), NOW)).toBe(0);
        expect(unreadCount(markAllRead(base, NOW), NOW)).toBe(0);
    });

    it('clears the read ones and removes one on request', () => {
        expect(clearRead(base, NOW).records.map((r) => r.id)).toEqual(['a']);
        expect(removeRecord(base, 'a').records.map((r) => r.id)).toEqual(['b']);
    });

    it('returns the same state when nothing changed', () => {
        const read = markAllRead(base, NOW);
        expect(markAllRead(read, NOW)).toBe(read);
        expect(removeRecord(base, 'missing')).toBe(base);
    });
});

describe('snoozing', () => {
    it('hides a record until its time, then brings it back unread', () => {
        let s = { records: [record('a', { readAt: NOW })], watermark: null };
        s = snoozeRecord(s, 'a', NOW + HOUR);
        expect(visibleRecords(s, NOW)).toEqual([]);
        expect(unreadCount(s, NOW)).toBe(0);
        // Snoozed ones are not read by "read all" — they are not showing.
        expect(markAllRead(s, NOW)).toBe(s);

        s = wakeRecord(s, 'a');
        expect(visibleRecords(s, NOW + HOUR)).toHaveLength(1);
        expect(unreadCount(s, NOW + HOUR)).toBe(1);
        expect(s.records[0].snoozedUntil).toBeUndefined();
    });

    it('snoozes for ten minutes, an hour, or until the same time tomorrow', () => {
        expect(snoozeUntil('10m', NOW)).toBe(NOW + 10 * 60_000);
        expect(snoozeUntil('1h', NOW)).toBe(NOW + HOUR);
        const tomorrow = new Date(snoozeUntil('tomorrow', NOW));
        expect(tomorrow.getDate()).toBe(24);
        expect(tomorrow.getHours()).toBe(12);
    });
});

describe('quiet hours', () => {
    const at = (h: number) => new Date(2026, 8, 23, h, 30).getTime();

    it('covers a span across midnight', () => {
        expect(isQuiet(at(23), 22, 7)).toBe(true);
        expect(isQuiet(at(3), 22, 7)).toBe(true);
        expect(isQuiet(at(7), 22, 7)).toBe(false);
        expect(isQuiet(at(12), 22, 7)).toBe(false);
    });

    it('covers a span within the day', () => {
        expect(isQuiet(at(13), 13, 15)).toBe(true);
        expect(isQuiet(at(15), 13, 15)).toBe(false);
    });

    it('is off when not set, or when it starts where it ends', () => {
        expect(isQuiet(at(3), -1, 7)).toBe(false);
        expect(isQuiet(at(3), 7, 7)).toBe(false);
    });
});

describe('the list', () => {
    it('splits today from earlier', () => {
        const yesterday = NOW - 24 * HOUR;
        const { today, earlier } = splitByDay(
            [record('now'), record('then', { at: yesterday })],
            NOW
        );
        expect(today.map((r) => r.id)).toEqual(['now']);
        expect(earlier.map((r) => r.id)).toEqual(['then']);
    });
});

describe('what data.json holds', () => {
    it('is believed only as far as it checks out', () => {
        expect(normalizeNotifications(undefined)).toEqual(EMPTY_NOTIFICATIONS);
        expect(normalizeNotifications('nonsense')).toEqual(EMPTY_NOTIFICATIONS);
        const s = normalizeNotifications({
            records: [record('good'), { id: 'bad' }, null],
            watermark: 'soon',
        });
        expect(s.records.map((r) => r.id)).toEqual(['good']);
        expect(s.watermark).toBeNull();
    });
});
