import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    __testing,
    ensureTable,
    loadTable,
    refreshTable,
    setTableStore,
    tableDay,
    tableKey,
    tableState,
    type TableStore,
} from '../src/modules/prayer/prayerTable';
import {
    ALADHAN,
    type PrayerApiOptions,
    type PrayerProvider,
    type YearDays,
} from '../src/modules/prayer/prayerProvider';
import { resolveDayTimes, type PrayerSourceSettings } from '../src/modules/prayer/prayerSource';
import type { PrayerTimeId } from '../src/modules/prayer/prayerTimes';

const PLACE = { lat: 45.0428, lon: 41.9734 };
const OPTS: PrayerApiOptions = {
    method: 'russia',
    hanafi: true,
    highLatRule: 'angleBased',
    midnight: 'toFajr',
    timezone: 'Europe/Moscow',
};

/** A day whose fajr says which year it came from, so a wrong year shows. */
function dayOf(year: number): Record<PrayerTimeId, number> {
    return {
        fajr: 200 + (year % 100),
        sunrise: 360,
        dhuhr: 720,
        asr: 900,
        sunset: 1080,
        maghrib: 1082,
        isha: 1180,
        midnight: 1500,
        lastThird: 1600,
    };
}

function yearOf(year: number): YearDays {
    return {
        [`${year}-01-01`]: dayOf(year),
        [`${year}-09-23`]: dayOf(year),
        [`${year}-12-31`]: dayOf(year),
    };
}

/** A provider that answers from a function, and remembers being asked. */
function fakeProvider(answer: (year: number) => YearDays | null) {
    const calls: number[] = [];
    const provider: PrayerProvider = {
        id: 'aladhan',
        host: 'example.test',
        shape: ALADHAN.shape,
        fetchYear: (_place, year) => {
            calls.push(year);
            return Promise.resolve(answer(year));
        },
    };
    return { provider, calls };
}

function memoryStore() {
    const files = new Map<string, string>();
    const store: TableStore = {
        read: (name) => Promise.resolve(files.get(name) ?? null),
        write: (name, text) => {
            files.set(name, text);
            return Promise.resolve();
        },
        remove: (name) => {
            files.delete(name);
            return Promise.resolve();
        },
        list: () => Promise.resolve([...files.keys()]),
    };
    return { store, files };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 23, 12, 0));
    // Tests run in node: `window` is whatever we say it is.
    vi.stubGlobal('window', {
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (id: number) => clearTimeout(id),
    });
});

afterEach(async () => {
    await setTableStore(null);
    __testing.setProvider(ALADHAN);
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const SEPT = new Date(2026, 8, 23);

describe('the year table', () => {
    it('fetches the year once, keeps it as a file, and answers from it', async () => {
        const { provider, calls } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        const { store, files } = memoryStore();
        await setTableStore(store);

        expect(tableDay(PLACE, SEPT, OPTS)).toBeNull();
        ensureTable(PLACE, SEPT, OPTS);
        expect(tableState(PLACE, SEPT, OPTS)).toBe('loading');
        await __testing.settle();

        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);
        expect(tableState(PLACE, SEPT, OPTS)).toBe('ok');
        expect(files.has(`${tableKey(PLACE, 2026, OPTS)}.json`)).toBe(true);

        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        expect(calls).toEqual([2026]);
    });

    it('reads the file back in a new session without asking again', async () => {
        const first = fakeProvider(yearOf);
        __testing.setProvider(first.provider);
        const { store } = memoryStore();
        await setTableStore(store);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();

        // A restart: memory gone, the file still there, and no network.
        const second = fakeProvider(() => null);
        __testing.setProvider(second.provider);
        await setTableStore(store);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();

        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);
        expect(second.calls).toEqual([]);
    });

    it('keeps serving a stale year while it asks for a fresh one', async () => {
        const { provider, calls } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        const { store } = memoryStore();
        await setTableStore(store);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();

        vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
        const failing = fakeProvider(() => null);
        __testing.setProvider(failing.provider);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();

        expect(failing.calls).toEqual([2026]);
        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);
        expect(calls).toEqual([2026]);
    });

    it('does not mix up places, methods or years', async () => {
        const { provider } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();

        expect(tableDay({ lat: 55.75, lon: 37.62 }, SEPT, OPTS)).toBeNull();
        expect(tableDay(PLACE, SEPT, { ...OPTS, method: 'mwl' })).toBeNull();
        expect(tableDay(PLACE, new Date(2027, 8, 23), OPTS)).toBeNull();
        // A pin nudged by a few metres is the same place.
        expect(tableDay({ lat: 45.0431, lon: 41.9729 }, SEPT, OPTS)?.fajr).toBe(226);
    });

    it('fetches next year once this one is nearly over', async () => {
        const { provider, calls } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        expect(calls).toEqual([2026]);

        ensureTable(PLACE, new Date(2026, 11, 1), OPTS);
        await __testing.settle();
        expect(calls).toEqual([2026, 2027]);
        expect(tableDay(PLACE, new Date(2027, 0, 1), OPTS)?.fajr).toBe(227);
    });
});

describe('when the service does not answer', () => {
    it('tries again on its own, waiting longer each time', async () => {
        const { provider, calls } = fakeProvider(() => null);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        expect(calls).toHaveLength(1);
        expect(tableState(PLACE, SEPT, OPTS)).toBe('error');

        // Renders in the meantime do not hammer it.
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        expect(calls).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(30_000);
        await __testing.settle();
        expect(calls).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(60_000);
        await __testing.settle();
        expect(calls).toHaveLength(3);
    });

    it('stops trying once it answers', async () => {
        let up = false;
        const { provider, calls } = fakeProvider((year) => (up ? yearOf(year) : null));
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        up = true;
        await vi.advanceTimersByTimeAsync(30_000);
        await __testing.settle();
        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);

        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
        expect(calls).toHaveLength(2);
    });

    it('lets the refresh button skip the wait', async () => {
        let up = false;
        const { provider } = fakeProvider((year) => (up ? yearOf(year) : null));
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        up = true;
        expect(await refreshTable(PLACE, SEPT, OPTS)).toBe(true);
        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);
    });
});

describe('housekeeping', () => {
    it('drops tables for years before last year', async () => {
        const { store, files } = memoryStore();
        files.set('aladhan-45.04_41.97-russia-h-angleBased-toFajr-Europe_Moscow-2024.json', '{}');
        files.set('aladhan-45.04_41.97-russia-h-angleBased-toFajr-Europe_Moscow-2025.json', '{}');
        files.set('aladhan-45.04_41.97-russia-h-angleBased-toFajr-Europe_Moscow-2026.json', '{}');
        await setTableStore(store);
        expect([...files.keys()].map((f) => f.slice(-9, -5))).toEqual(['2025', '2026']);
    });
});

describe('resolveDayTimes', () => {
    const settings: PrayerSourceSettings = {
        prayerSource: 'api',
        prayerApiMidnight: 'toFajr',
        prayerMethod: 'russia',
        prayerFajrAngle: 16,
        prayerIshaAngle: 15,
        prayerAsrMadhab: 'hanafi',
        prayerHighLatRule: 'angleBased',
        prayerAdjustments: { dhuhr: -1 },
        prayerHijriOffset: 0,
        prayerRounding: 'nearest',
        prayerFallback: 'calc',
    };
    // What `prayerApiOptionsOf` builds from the settings above, on this machine's zone.
    const opts: PrayerApiOptions = { ...OPTS, timezone: undefined };

    it('answers from the table, with the mosque corrections applied', async () => {
        const { provider } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);
        ensureTable(PLACE, SEPT, opts);
        await __testing.settle();

        const resolved = resolveDayTimes(PLACE, SEPT, settings);
        expect(resolved.origin).toBe('api');
        expect(resolved.times.times.dhuhr).toBe(719);
    });

    it('falls back to the calculation while the table is missing', async () => {
        await setTableStore(memoryStore().store);
        const resolved = resolveDayTimes(PLACE, SEPT, settings);
        expect(resolved.origin).toBe('fallback');
        expect(Number.isFinite(resolved.times.times.fajr)).toBe(true);
    });

    it('shows nothing instead, when that is what was chosen', async () => {
        await setTableStore(memoryStore().store);
        const resolved = resolveDayTimes(PLACE, SEPT, { ...settings, prayerFallback: 'none' });
        expect(resolved.origin).toBe('missing');
        expect(resolved.times.times.fajr).toBeNaN();
        expect(resolved.times.invalid).toContain('isha');
    });

    it('never asks for a table in local mode', async () => {
        await setTableStore(memoryStore().store);
        const resolved = resolveDayTimes(PLACE, SEPT, { ...settings, prayerSource: 'local' });
        expect(resolved.origin).toBe('local');
    });
});

describe('loadTable — the match dialog checking a proposal', () => {
    it('waits for the year and keeps it, so applying costs no second request', async () => {
        const { provider, calls } = fakeProvider(yearOf);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        expect(await loadTable(PLACE, SEPT, OPTS)).toBe(true);
        expect(tableDay(PLACE, SEPT, OPTS)?.fajr).toBe(226);
        ensureTable(PLACE, SEPT, OPTS);
        await __testing.settle();
        expect(calls).toEqual([2026]);
    });

    it('does not keep retrying a table nobody may ever use', async () => {
        const { provider, calls } = fakeProvider(() => null);
        __testing.setProvider(provider);
        await setTableStore(memoryStore().store);

        expect(await loadTable(PLACE, SEPT, { ...OPTS, method: 'mwl' })).toBe(false);
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(calls).toHaveLength(1);
    });
});
