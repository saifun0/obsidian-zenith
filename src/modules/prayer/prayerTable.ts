import type { DataAdapter } from 'obsidian';
import type { GeoPoint } from './prayerTimes';
import {
    ALADHAN,
    roundedPlace,
    type DayMinutes,
    type PrayerApiOptions,
    type PrayerProvider,
    type YearDays,
} from './prayerProvider';

/**
 * A year of published prayer times, kept as a file.
 *
 * This used to be a month at a time in `localStorage`, which had three faults a
 * prayer tracker cannot afford: storage the platform may clear when it likes,
 * a first frame of the calculation every time a new month was opened, and a
 * table that ended at the month boundary — the first of the month offline
 * showed the arithmetic. A year per request fixes the last two, and a file in
 * the plugin's own folder the first.
 *
 * Nothing here ever blocks drawing. Every read is synchronous against memory;
 * the disk and the network are reached in the background, and a revision
 * counter tells the surfaces to look again when something lands.
 *
 * A failed fetch is retried on its own, at growing intervals — half a minute,
 * two, eight, half an hour, up to six hours — so a phone that was offline at
 * startup picks the table up once it is back, without anyone pressing a button
 * and without hammering a service that is down.
 */

/** Where the tables live, as far as this file is concerned. */
export interface TableStore {
    read(name: string): Promise<string | null>;
    write(name: string, text: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(): Promise<string[]>;
}

interface StoredYear {
    v: 1;
    provider: string;
    year: number;
    fetchedAt: number;
    /**
     * Carried over from the old per-month cache, so only some months are
     * there. Served as it is, and replaced at the first chance.
     */
    partial?: boolean;
    days: YearDays;
}

export type TableState = 'idle' | 'loading' | 'ok' | 'error';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A printed table is a published fact, so it is only asked for again to pick
 * up a correction. Stale is still served — the times for the days it covers
 * have not changed — and the refetch happens behind it.
 */
const TTL_MS = 30 * DAY_MS;

/** Next year's table is fetched once this year has fewer days than this left. */
const NEXT_YEAR_DAYS = 60;

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/** Tables for years before the last one are pruned: nobody browses them offline. */
const KEEP_YEARS_BACK = 1;

let store: TableStore | null = null;
let provider: PrayerProvider = ALADHAN;

const memory = new Map<string, StoredYear>();
const diskChecked = new Set<string>();
const inFlight = new Map<string, Promise<boolean>>();
const states = new Map<string, TableState>();
const failures = new Map<string, { attempts: number; nextAt: number; timer: number | null }>();

// ── Change notification ──────────────────────────────
// A year landing has to repaint whatever is on screen: React hooks, the
// reminder scheduler, a command. One counter serves them all.

let revision = 0;
const listeners = new Set<() => void>();

export function subscribeTables(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function tablesRevision(): number {
    return revision;
}

function bump(): void {
    revision += 1;
    for (const listener of listeners) listener();
}

// ── Keys ─────────────────────────────────────────────

/**
 * Everything that changes the answer, as a file name: provider, the place as it
 * was sent, the provider's reading of the options, and the year.
 */
export function tableKey(
    place: GeoPoint,
    year: number,
    opts: PrayerApiOptions,
    from: PrayerProvider = provider
): string {
    const at = roundedPlace(place);
    const raw = `${from.id}-${at.lat.toFixed(2)}_${at.lon.toFixed(2)}-${from.shape(opts)}-${year}`;
    return raw.replace(/[^A-Za-z0-9._@-]/g, '_');
}

const fileOf = (key: string) => `${key}.json`;

const isoOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')}`;

// ── Disk ─────────────────────────────────────────────

/** JSON has no NaN — a time that does not exist comes back as null. */
function reviveDays(raw: unknown): YearDays {
    const out: YearDays = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [iso, day] of Object.entries(raw as Record<string, unknown>)) {
        if (!day || typeof day !== 'object') continue;
        const revived = {} as DayMinutes;
        for (const [id, value] of Object.entries(day as Record<string, unknown>)) {
            (revived as Record<string, number>)[id] = typeof value === 'number' ? value : NaN;
        }
        out[iso] = revived;
    }
    return out;
}

function parseStored(text: string | null): StoredYear | null {
    if (!text) return null;
    try {
        const raw = JSON.parse(text) as Partial<StoredYear>;
        if (raw?.v !== 1 || typeof raw.fetchedAt !== 'number' || typeof raw.year !== 'number') {
            return null;
        }
        const days = reviveDays(raw.days);
        if (!Object.keys(days).length) return null;
        return {
            v: 1,
            provider: String(raw.provider ?? ''),
            year: raw.year,
            fetchedAt: raw.fetchedAt,
            partial: raw.partial === true ? true : undefined,
            days,
        };
    } catch {
        return null;
    }
}

async function writeYear(key: string, year: StoredYear): Promise<void> {
    await store?.write(fileOf(key), JSON.stringify(year));
}

// ── Fetching ─────────────────────────────────────────

function needsFetch(held: StoredYear): boolean {
    return held.partial === true || Date.now() - held.fetchedAt > TTL_MS;
}

function clearFailure(key: string): void {
    const f = failures.get(key);
    if (f?.timer) window.clearTimeout(f.timer);
    failures.delete(key);
}

/** Still inside the pause after a failure. A second of slack for early timers. */
function waiting(key: string): boolean {
    const f = failures.get(key);
    return !!f && f.nextAt - Date.now() > 1000;
}

function scheduleRetry(key: string, retry: () => void): void {
    const prev = failures.get(key);
    if (prev?.timer) window.clearTimeout(prev.timer);
    const attempts = (prev?.attempts ?? 0) + 1;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 4 ** (attempts - 1));
    const timer = window.setTimeout(() => {
        const f = failures.get(key);
        if (f) f.timer = null;
        retry();
    }, delay);
    failures.set(key, { attempts, nextAt: Date.now() + delay, timer });
}

async function fetchAndStore(
    key: string,
    place: GeoPoint,
    year: number,
    opts: PrayerApiOptions,
    retry = true
): Promise<boolean> {
    states.set(key, 'loading');
    const days = await provider.fetchYear(place, year, opts);
    if (!days) {
        states.set(key, 'error');
        if (retry) scheduleRetry(key, () => ensureYear(place, year, opts));
        bump();
        return false;
    }
    clearFailure(key);
    const stored: StoredYear = { v: 1, provider: provider.id, year, fetchedAt: Date.now(), days };
    memory.set(key, stored);
    states.set(key, 'ok');
    bump();
    await writeYear(key, stored);
    return true;
}

function ensureYear(place: GeoPoint, year: number, opts: PrayerApiOptions): void {
    const key = tableKey(place, year, opts);
    if (inFlight.has(key)) return;

    const held = memory.get(key);
    if (held && !needsFetch(held)) {
        states.set(key, 'ok');
        return;
    }
    if (waiting(key) && (held || diskChecked.has(key))) return;

    const work = (async (): Promise<boolean> => {
        if (!held && store && !diskChecked.has(key)) {
            diskChecked.add(key);
            const loaded = parseStored(await store.read(fileOf(key)));
            if (loaded) {
                memory.set(key, loaded);
                states.set(key, 'ok');
                bump();
                if (!needsFetch(loaded)) return true;
            }
        }
        diskChecked.add(key);
        if (waiting(key)) return memory.has(key);
        return fetchAndStore(key, place, year, opts);
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, work);
}

// ── Reading ──────────────────────────────────────────

/**
 * Make sure the year `date` falls in is held, or on its way — and next year's
 * too, once this one is running out. Cheap enough to call on every render.
 */
export function ensureTable(place: GeoPoint, date: Date, opts: PrayerApiOptions): void {
    const year = date.getFullYear();
    ensureYear(place, year, opts);
    // December offline should not end the year on the calculation.
    const left = (new Date(year + 1, 0, 1).getTime() - date.getTime()) / DAY_MS;
    if (left < NEXT_YEAR_DAYS) ensureYear(place, year + 1, opts);
}

/** The published times for one day, or null when they are not held. */
export function tableDay(place: GeoPoint, date: Date, opts: PrayerApiOptions): DayMinutes | null {
    const held = memory.get(tableKey(place, date.getFullYear(), opts));
    return held?.days[isoOf(date)] ?? null;
}

/** What the table for `date` is doing: arriving, held, failed, or never asked for. */
export function tableState(place: GeoPoint, date: Date, opts: PrayerApiOptions): TableState {
    const key = tableKey(place, date.getFullYear(), opts);
    if (inFlight.has(key)) return 'loading';
    if (memory.get(key)?.days[isoOf(date)]) return 'ok';
    return states.get(key) ?? 'idle';
}

/**
 * The year `date` falls in, from memory, disk or the network — for the one
 * caller that waits: "Match my app" checking its proposal against the table
 * the times would actually come from. Whatever it fetches is kept, so applying
 * the proposal costs no second request — and a failure is not retried in the
 * background, since nobody may ever use that table.
 */
export async function loadTable(
    place: GeoPoint,
    date: Date,
    opts: PrayerApiOptions
): Promise<boolean> {
    const year = date.getFullYear();
    const key = tableKey(place, year, opts);
    await inFlight.get(key);
    if (memory.has(key)) return true;
    if (store && !diskChecked.has(key)) {
        diskChecked.add(key);
        const loaded = parseStored(await store.read(fileOf(key)));
        if (loaded) {
            memory.set(key, loaded);
            bump();
            return true;
        }
    }
    const work = fetchAndStore(key, place, year, opts, false).finally(() => inFlight.delete(key));
    inFlight.set(key, work);
    return work;
}

/**
 * Fetch the year `date` falls in now, whatever the pause after a failure says,
 * and report whether it worked. The settings page's button — the one place a
 * person is waiting on the answer.
 */
export async function refreshTable(
    place: GeoPoint,
    date: Date,
    opts: PrayerApiOptions
): Promise<boolean> {
    const year = date.getFullYear();
    const key = tableKey(place, year, opts);
    await inFlight.get(key);
    clearFailure(key);
    const work = fetchAndStore(key, place, year, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, work);
    bump();
    return work;
}

// ── Lifecycle ────────────────────────────────────────

/** Drop tables for years nobody will browse offline any more. */
async function pruneOld(now = new Date()): Promise<void> {
    if (!store) return;
    const oldest = now.getFullYear() - KEEP_YEARS_BACK;
    for (const name of await store.list()) {
        const year = Number(/-(\d{4})\.json$/.exec(name)?.[1]);
        if (Number.isFinite(year) && year < oldest) await store.remove(name);
    }
}

/**
 * Where tables are kept — set by the module when it loads, and cleared when it
 * unloads, which also forgets everything held and stops every pending retry.
 */
export function setTableStore(next: TableStore | null): Promise<void> {
    store = next;
    for (const key of [...failures.keys()]) clearFailure(key);
    memory.clear();
    diskChecked.clear();
    states.clear();
    bump();
    // Housekeeping, in the background: nothing waits on it but the tests.
    return next ? pruneOld() : Promise.resolve();
}

/** Tables in a folder of the vault, through the adapter — which works the same on a phone. */
export function vaultTableStore(adapter: DataAdapter, folder: string): TableStore {
    const path = (name: string) => `${folder}/${name}`;
    let made = false;
    const ensureFolder = async () => {
        if (made) return;
        if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
        made = true;
    };
    return {
        async read(name) {
            try {
                return (await adapter.exists(path(name))) ? await adapter.read(path(name)) : null;
            } catch {
                return null;
            }
        },
        async write(name, text) {
            try {
                await ensureFolder();
                await adapter.write(path(name), text);
            } catch {
                /* a full disk costs the cache, never the times on screen */
            }
        },
        async remove(name) {
            try {
                await adapter.remove(path(name));
            } catch {
                /* already gone */
            }
        },
        async list() {
            try {
                if (!(await adapter.exists(folder))) return [];
                const listed = await adapter.list(folder);
                return listed.files.map((f) => f.slice(f.lastIndexOf('/') + 1));
            } catch {
                return [];
            }
        },
    };
}

export const __testing = {
    setProvider(next: PrayerProvider): void {
        provider = next;
    },
    /** Resolves once nothing is in flight. */
    async settle(): Promise<void> {
        while (inFlight.size) await Promise.all([...inFlight.values()]);
    },
    failures,
    pruneOld,
};
