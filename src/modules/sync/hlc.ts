/**
 * Hybrid Logical Clock.
 *
 * Ordering edits across devices needs a clock, and neither obvious choice
 * works on its own:
 *
 * - Wall time alone is wrong because device clocks drift. A phone running ten
 *   minutes fast wins every conflict forever, and one running slow loses every
 *   conflict forever — silently, with no way for the user to tell.
 * - A pure Lamport counter fixes that but throws away the wall time, so the
 *   history becomes unreadable ("which of these came first this morning?") and
 *   a device that has been offline for a week comes back with a tiny counter
 *   and loses to edits it should have won.
 *
 * An HLC keeps both: `wall` tracks real time closely enough to read, and
 * `counter` breaks ties and preserves causality when two edits land in the same
 * millisecond or when a clock runs backwards. `node` is the final tiebreak, so
 * two devices comparing the same pair of stamps always agree on the winner —
 * without it, a merge could converge differently on each side.
 */

export interface Hlc {
    /** Wall-clock milliseconds, but never allowed to go backwards. */
    wall: number;
    /** Ticks within a single `wall` value. */
    counter: number;
    /** Device id — the deterministic tiebreak, never a source of ordering. */
    node: string;
}

/**
 * How far ahead of our own clock a received stamp may be before we stop
 * trusting it (1 hour).
 *
 * Without a cap, one device with a badly wrong clock poisons the whole vault:
 * its stamps sit years in the future, so every later edit from every other
 * device loses to it and the user watches their changes silently revert. We
 * still accept the edit — refusing it would lose data — but clamp the stamp so
 * the damage ends at this one merge instead of persisting.
 */
export const MAX_DRIFT_MS = 60 * 60 * 1000;

/** Zero value, for a key that has never been stamped. */
export function zero(node: string): Hlc {
    return { wall: 0, counter: 0, node };
}

/**
 * Stamp a LOCAL edit.
 *
 * `wall` never decreases: if the OS clock jumps backwards (NTP correction,
 * timezone fiddling, a laptop resuming from sleep) we hold the previous value
 * and advance `counter` instead. An edit made after another edit must sort
 * after it, whatever the clock says.
 */
export function next(prev: Hlc | null, wallNow: number, node: string): Hlc {
    if (!prev || wallNow > prev.wall) {
        return { wall: Math.max(wallNow, 0), counter: 0, node };
    }
    return { wall: prev.wall, counter: prev.counter + 1, node };
}

/**
 * Fold a stamp received from another device into our own clock.
 *
 * This is what makes the clock *causal* rather than merely comparative: after
 * receiving a remote edit, our next local stamp is guaranteed to sort after it,
 * so a reply can never appear to precede the thing it replies to.
 */
export function receive(local: Hlc | null, remote: Hlc, wallNow: number, node: string): Hlc {
    const mine = local ?? zero(node);
    // Clamp a stamp from a device whose clock is implausibly far ahead. See
    // MAX_DRIFT_MS — we take the edit, we just refuse to adopt its clock.
    const theirWall = Math.min(remote.wall, wallNow + MAX_DRIFT_MS);
    const wall = Math.max(mine.wall, theirWall, wallNow);

    let counter: number;
    if (wall === mine.wall && wall === theirWall) {
        counter = Math.max(mine.counter, remote.counter) + 1;
    } else if (wall === mine.wall) {
        counter = mine.counter + 1;
    } else if (wall === theirWall) {
        counter = remote.counter + 1;
    } else {
        // `wallNow` moved us past both — a fresh millisecond, so start over.
        counter = 0;
    }

    return { wall, counter, node };
}

/**
 * Total order over stamps: -1 if `a` happened before `b`, 1 if after, 0 only
 * when they are the same stamp from the same device.
 *
 * Deliberately total rather than partial. A partial order would leave genuinely
 * concurrent edits incomparable, and every caller would then need its own rule
 * for picking a winner — which is exactly how two devices end up disagreeing.
 */
export function compare(a: Hlc, b: Hlc): -1 | 0 | 1 {
    if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
    if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
    if (a.node !== b.node) return a.node < b.node ? -1 : 1;
    return 0;
}

/** Whether `a` wins over `b`. Sugar for the common merge test. */
export function isAfter(a: Hlc, b: Hlc): boolean {
    return compare(a, b) === 1;
}

/**
 * Fixed-width encoding, so stamps sort correctly as plain strings.
 *
 * Padding is the whole point: `"9-..."` sorts after `"10-..."` unpadded, which
 * would silently corrupt any ordering done by a sort over the stored keys.
 * 12 hex digits of milliseconds runs to the year 10889; 4 for the counter
 * allows 65k edits inside one millisecond, which no human hand reaches.
 */
export function encode(h: Hlc): string {
    const wall = Math.max(0, Math.floor(h.wall)).toString(16).padStart(12, '0');
    const counter = Math.min(0xffff, Math.max(0, Math.floor(h.counter)))
        .toString(16)
        .padStart(4, '0');
    return `${wall}-${counter}-${h.node}`;
}

/**
 * Read a stamp back. Returns null for anything malformed rather than throwing:
 * these come out of a JSON file the user can edit and sync can mangle, so a
 * damaged stamp must degrade to "unknown" and let the caller re-stamp, not take
 * the plugin down on load.
 */
export function parse(s: unknown): Hlc | null {
    if (typeof s !== 'string') return null;
    const m = /^([0-9a-f]{12})-([0-9a-f]{4})-(.+)$/.exec(s);
    if (!m) return null;
    const wall = parseInt(m[1], 16);
    const counter = parseInt(m[2], 16);
    if (!Number.isFinite(wall) || !Number.isFinite(counter)) return null;
    return { wall, counter, node: m[3] };
}
