import type { ZenithSettings } from '../../store/settingsSlice';
import { compare, encode, parse, zero, type Hlc } from './hlc';
import { SHARED_KEYS, mergeStrategyOf, type SettingsKey } from './statePolicy';

/**
 * Field-level merge of the shared settings document.
 *
 * The bug this exists to kill: `main.ts` persists settings as one blob, so two
 * open devices each hold a full copy and whoever saves last overwrites all ~60
 * keys — dashboard presets, folder icons, trackers, the lot.
 * Merging per key means two devices editing two different settings is not a
 * conflict at all, which is what it looks like to the person using them.
 *
 * ── Why three-way rather than two-way ──
 *
 * Comparing only `local` and `remote` cannot tell "I deleted this tracker" from
 * "they added this tracker" — both look like "present on one side only", and
 * guessing wrong either resurrects deleted items forever or deletes live ones.
 * So each device remembers `base`: the shared document as it stood at its last
 * successful merge. `local != base` means *we* changed it; `remote != base`
 * means *they* did. Only when both are true is there anything to resolve.
 *
 * This is the same shape as the file engine's `local × remote × prevSync`
 * comparison, and it is why there are no tombstones here: a deletion is simply
 * "present in base, absent now", which `base` already records. Tombstones would
 * be a second, redundant memory of the same fact — and a second thing to get
 * wrong in the code path that decides what to delete.
 */

/** Format version of `state.json`, for future migrations. */
export const STATE_FORMAT_VERSION = 1;

/** The shared document that travels between devices. */
export interface SharedState {
    version: number;
    /** Values for `shared`-scoped keys only. */
    values: Partial<ZenithSettings>;
    /** Encoded HLC per key — see `hlc.encode`. */
    stamps: Record<string, string>;
}

export function emptyState(): SharedState {
    return { version: STATE_FORMAT_VERSION, values: {}, stamps: {} };
}

/** A key where both sides moved and the values genuinely disagree. */
export interface KeyConflict {
    key: SettingsKey;
    local: unknown;
    remote: unknown;
    /** Which side the automatic rule picked. */
    winner: 'local' | 'remote';
}

export interface MergeResult {
    state: SharedState;
    /** Keys whose merged value differs from what this device had. */
    changedKeys: SettingsKey[];
    /** Real collisions, for the UI to report. Already resolved in `state`. */
    conflicts: KeyConflict[];
}

// ── Structural comparison ────────────────────────────

/**
 * Deep equality over JSON-shaped values.
 *
 * Everything here round-trips through `state.json`, so there are no classes,
 * dates or cycles to worry about — only objects, arrays and primitives. Object
 * keys are compared order-independently because JSON key order is not
 * meaningful and two devices can serialise the same value differently.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        // NaN is the one primitive that is not equal to itself.
        return Number.isNaN(a) && Number.isNaN(b);
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, i) => deepEqual(item, b[i]));
    }
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}

// ── Stamps ───────────────────────────────────────────

function stampOf(state: SharedState, key: string, node: string): Hlc {
    return parse(state.stamps[key]) ?? zero(node);
}

/** The later of two stamps — used when a merged value came from both sides. */
function laterStamp(a: Hlc, b: Hlc): Hlc {
    return compare(a, b) >= 0 ? a : b;
}

// ── Collection merges ────────────────────────────────

interface Identified {
    id: string;
}

function isIdentifiedArray(v: unknown): v is Identified[] {
    return (
        Array.isArray(v) &&
        v.every((item) => !!item && typeof item === 'object' && typeof (item as Identified).id === 'string')
    );
}

/**
 * Merge arrays of `{id, …}` element by element.
 *
 * This is where last-writer-wins is most obviously wrong: installing a module
 * on the phone and saving a dashboard preset on the desktop are two additions,
 * not a contest. Only an element that BOTH sides edited differently is a
 * conflict, and there the newer stamp wins.
 *
 * Delete-vs-edit is settled in favour of the edit. Both outcomes lose
 * something, but a deletion the user has to repeat is a minor annoyance,
 * whereas an edit silently discarded is work they cannot get back and may not
 * notice.
 */
function mergeById(
    base: Identified[] | undefined,
    local: Identified[],
    remote: Identified[],
    localWins: boolean
): Identified[] {
    const baseMap = new Map((base ?? []).map((i) => [i.id, i]));
    const localMap = new Map(local.map((i) => [i.id, i]));
    const remoteMap = new Map(remote.map((i) => [i.id, i]));

    const out: Identified[] = [];
    const seen = new Set<string>();

    // Preserve the local ordering first, then append what only the remote has,
    // so a device's own arrangement is not reshuffled by a merge.
    const order = [...local.map((i) => i.id), ...remote.map((i) => i.id)];

    for (const id of order) {
        if (seen.has(id)) continue;
        seen.add(id);

        const b = baseMap.get(id);
        const l = localMap.get(id);
        const r = remoteMap.get(id);

        // Absent on both sides — deleted by whoever, and nobody objects.
        if (!l && !r) continue;

        // Present on one side only.
        if (l && !r) {
            // Known to base means the remote deleted it; unknown means we added
            // it. Either way we keep it unless we left it untouched.
            if (b && deepEqual(l, b)) continue; // remote deleted, we did not edit
            out.push(l);
            continue;
        }
        if (!l && r) {
            if (b && deepEqual(r, b)) continue; // we deleted, remote did not edit
            out.push(r);
            continue;
        }

        // Present on both. Take whichever side actually changed.
        const lChanged = !b || !deepEqual(l, b);
        const rChanged = !b || !deepEqual(r, b);
        if (lChanged && !rChanged) out.push(l as Identified);
        else if (rChanged && !lChanged) out.push(r as Identified);
        else out.push((localWins ? l : r) as Identified);
    }

    return out;
}

/** Merge `Record<string, …>` key by key, with the same three-way reasoning. */
function mergeRecord(
    base: Record<string, unknown> | undefined,
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
    localWins: boolean
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const k of keys) {
        const inLocal = Object.prototype.hasOwnProperty.call(local, k);
        const inRemote = Object.prototype.hasOwnProperty.call(remote, k);
        const inBase = !!base && Object.prototype.hasOwnProperty.call(base, k);
        const b = base?.[k];

        if (inLocal && !inRemote) {
            if (inBase && deepEqual(local[k], b)) continue; // remote removed it
            out[k] = local[k];
            continue;
        }
        if (!inLocal && inRemote) {
            if (inBase && deepEqual(remote[k], b)) continue; // we removed it
            out[k] = remote[k];
            continue;
        }

        const lChanged = !inBase || !deepEqual(local[k], b);
        const rChanged = !inBase || !deepEqual(remote[k], b);
        if (lChanged && !rChanged) out[k] = local[k];
        else if (rChanged && !lChanged) out[k] = remote[k];
        else out[k] = localWins ? local[k] : remote[k];
    }

    return out;
}

/** Merge a string array as a set: additions union, removals honoured. */
function mergeSet(base: string[] | undefined, local: string[], remote: string[]): string[] {
    const baseSet = new Set(base ?? []);
    const localSet = new Set(local);
    const remoteSet = new Set(remote);

    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of [...local, ...remote]) {
        if (seen.has(item)) continue;
        seen.add(item);
        const inLocal = localSet.has(item);
        const inRemote = remoteSet.has(item);
        const inBase = baseSet.has(item);
        // Removed by one side and untouched by the other → stays removed.
        if (inBase && (!inLocal || !inRemote)) continue;
        out.push(item);
    }
    return out;
}

/**
 * Hand the running timer over rather than merging it.
 *
 * A stop always beats a start. Without that rule a timer stopped on the phone
 * comes back to life from the desktop's stale copy and keeps counting — and the
 * user cannot make it stop, because every stop loses to the other device's
 * older "still running" value.
 */
function mergeTimer(
    base: unknown,
    local: unknown,
    remote: unknown,
    localWins: boolean
): unknown {
    const hadBase = base != null;
    const lStopped = local == null;
    const rStopped = remote == null;

    if (lStopped && rStopped) return null;
    // Stopping is a transition away from a session that existed in base.
    if (hadBase && lStopped && !rStopped && deepEqual(base, remote)) return null;
    if (hadBase && rStopped && !lStopped && deepEqual(base, local)) return null;
    if (lStopped) return remote;
    if (rStopped) return local;
    // Two different sessions running — the newer stamp is the one the user
    // started most recently, so that is the one they are looking at.
    return localWins ? local : remote;
}

// ── Top-level merge ──────────────────────────────────

export interface MergeOptions {
    /** This device's id, used for stamp tiebreaks. */
    node: string;
}

/**
 * Merge the remote shared document into ours.
 *
 * `base` is the document as of our last successful merge with this remote, or
 * null the first time. With no base every difference reads as "both sides
 * changed", so collections are unioned rather than pruned — the first sync may
 * resurrect an item deleted before sync was ever switched on, which is a far
 * better failure than deleting something nobody asked to delete.
 */
export function mergeSharedState(
    base: SharedState | null,
    local: SharedState,
    remote: SharedState,
    opts: MergeOptions
): MergeResult {
    const merged = emptyState();
    // Written through a loosely-typed bag: indexing `Partial<ZenithSettings>`
    // with a UNION of keys collapses the value type to the intersection of
    // every setting's type, which is `undefined`. Same reason `partition()` in
    // `statePolicy` builds its output this way.
    const values: Record<string, unknown> = {};
    const changedKeys: SettingsKey[] = [];
    const conflicts: KeyConflict[] = [];

    for (const key of SHARED_KEYS) {
        const hasLocal = Object.prototype.hasOwnProperty.call(local.values, key);
        const hasRemote = Object.prototype.hasOwnProperty.call(remote.values, key);
        if (!hasLocal && !hasRemote) continue;

        const lv = local.values[key];
        const rv = remote.values[key];
        const bv = base?.values?.[key];
        const lStamp = stampOf(local, key, opts.node);
        const rStamp = stampOf(remote, key, opts.node);

        // Only one side knows this key at all.
        if (hasLocal && !hasRemote) {
            values[key] = lv;
            merged.stamps[key] = encode(lStamp);
            continue;
        }
        if (!hasLocal && hasRemote) {
            values[key] = rv;
            merged.stamps[key] = encode(rStamp);
            changedKeys.push(key);
            continue;
        }

        const hasBase = !!base && Object.prototype.hasOwnProperty.call(base.values, key);
        const lChanged = !hasBase || !deepEqual(lv, bv);
        const rChanged = !hasBase || !deepEqual(rv, bv);

        // Nobody moved, or both landed on the same value — nothing to decide.
        if (deepEqual(lv, rv)) {
            values[key] = lv;
            merged.stamps[key] = encode(laterStamp(lStamp, rStamp));
            continue;
        }
        if (!rChanged) {
            values[key] = lv;
            merged.stamps[key] = encode(lStamp);
            continue;
        }
        if (!lChanged) {
            values[key] = rv;
            merged.stamps[key] = encode(rStamp);
            changedKeys.push(key);
            continue;
        }

        // Both sides moved and disagree. Structure decides whether that is a
        // real conflict or just two independent edits to one collection.
        const localWins = compare(lStamp, rStamp) >= 0;
        const strategy = mergeStrategyOf(key);
        let value: unknown;
        let structural = false;

        if (strategy === 'byId' && isIdentifiedArray(lv) && isIdentifiedArray(rv)) {
            value = mergeById(isIdentifiedArray(bv) ? bv : undefined, lv, rv, localWins);
            structural = true;
        } else if (strategy === 'record' && isPlainRecord(lv) && isPlainRecord(rv)) {
            value = mergeRecord(isPlainRecord(bv) ? bv : undefined, lv, rv, localWins);
            structural = true;
        } else if (strategy === 'set' && isStringArray(lv) && isStringArray(rv)) {
            value = mergeSet(isStringArray(bv) ? bv : undefined, lv, rv);
            structural = true;
        } else if (strategy === 'timer') {
            value = mergeTimer(bv, lv, rv, localWins);
        } else {
            value = localWins ? lv : rv;
        }

        values[key] = value;
        merged.stamps[key] = encode(laterStamp(lStamp, rStamp));
        if (!deepEqual(value, lv)) changedKeys.push(key);

        // A structural merge kept both sides' work, so there is nothing to
        // report; only a value that had to be chosen is worth telling the user
        // about.
        if (!structural) {
            conflicts.push({ key, local: lv, remote: rv, winner: localWins ? 'local' : 'remote' });
        }
    }

    merged.values = values;
    return { state: merged, changedKeys, conflicts };
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((i) => typeof i === 'string');
}
