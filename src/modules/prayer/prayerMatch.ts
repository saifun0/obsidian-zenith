import { isoToDate } from '../journal/services/journalDates';
import { isRamadan } from './hijri';
import {
    HIGH_LAT_RULES,
    PRAYER_METHODS,
    PRAYER_ROUNDINGS,
    type AsrMadhab,
    type HighLatRule,
    type PrayerRounding,
} from './prayerConfig';
import { prayerTimes, type GeoPoint } from './prayerTimes';

/**
 * "Match my app": find the calculation that reproduces the times someone
 * already trusts.
 *
 * People do not choose a method, they choose a mosque or an app, and then find
 * that Zenith disagrees with it by twelve minutes at fajr. The settings that
 * decide this — method, madhab, what to do at high latitudes, how seconds are
 * lost — are four separate questions whose names mean nothing to most people,
 * and the combination is what matters. So the user types the times their app
 * shows today and every combination is tried.
 *
 * Found by brute force because there are few enough: fourteen methods, two
 * madhabs, four high-latitude rules, two roundings. Custom twilight angles are
 * searched too, but one angle at a time — the fajr angle only moves fajr and
 * the isha angle only isha, so the best of each is found independently instead
 * of trying every pair.
 *
 * What comes back is a proposal. The madhab especially is the user's decision,
 * not a parameter to be fitted; the dialog shows which one the app's asr fits
 * and leaves the choice in plain view.
 */

/** The times a person can read off another app. Midnight and the last third are rarely shown. */
export const MATCH_TIMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type MatchTimeId = (typeof MATCH_TIMES)[number];

/** One day of the other app's times, in minutes from local midnight. */
export interface MatchSample {
    /** `YYYY-MM-DD`. */
    date: string;
    times: Partial<Record<MatchTimeId, number>>;
}

/** Everything that decides the times, short of the per-prayer adjustments. */
export interface MatchSetup {
    method: string;
    /** Only for `custom`. */
    fajrAngle?: number;
    ishaAngle?: number;
    asrMadhab: AsrMadhab;
    highLatRule: HighLatRule;
    rounding: PrayerRounding;
}

export interface MatchResult {
    setup: MatchSetup;
    /** Per sample: theirs − ours, for each time given. */
    residuals: Array<Partial<Record<MatchTimeId, number>>>;
    /** Sum of the absolute residuals — the ranking. */
    error: number;
    /** The largest single residual. */
    worst: number;
    /**
     * The same offset every day that closes what is left, per time. Only
     * offered while small: a correction of forty minutes means the method is
     * wrong, and hiding that behind an adjustment would be a lie.
     */
    adjustments: Partial<Record<MatchTimeId, number>>;
    /** Residuals once the adjustments are applied. */
    after: Array<Partial<Record<MatchTimeId, number>>>;
}

/** Beyond this an adjustment stops being a mosque's rounding and starts hiding a wrong method. */
export const MAX_ADJUSTMENT = 10;

/** Custom angles tried, in degrees. Every published method falls inside. */
const ANGLE_MIN = 12;
const ANGLE_MAX = 20;
const ANGLE_STEP = 0.5;

export interface MatchOptions {
    /** What is set now — preferred whenever it fits no worse than the alternative. */
    current: MatchSetup;
    /** Hijri offset, for Umm al-Qura's Ramadan isha. */
    hijriOffset?: number;
    /** Minutes east of UTC; the device's own for each day when absent. */
    tzOffsetMinutes?: number;
}

/** Computes one setup for one day. The local calculation by default; a provider's table can stand in. */
export type TimesFor = (
    setup: MatchSetup,
    date: string
) => Partial<Record<MatchTimeId, number>> | null;

/** The local calculation as a {@link TimesFor}. */
export function localTimesFor(place: GeoPoint, opts: Omit<MatchOptions, 'current'> = {}): TimesFor {
    return (setup, iso) => {
        const date = isoToDate(iso);
        const day = prayerTimes(place, date, {
            method: setup.method,
            fajrAngle: setup.fajrAngle,
            ishaAngle: setup.ishaAngle,
            asrMadhab: setup.asrMadhab,
            highLatRule: setup.highLatRule,
            rounding: setup.rounding,
            isRamadan: isRamadan(date, opts.hijriOffset ?? 0),
            tzOffsetMinutes: opts.tzOffsetMinutes,
        });
        return day.times;
    };
}

/**
 * The offset that best closes a set of residuals: their median, as a whole
 * minute. A median rather than a mean because one mistyped day should not drag
 * every other day's correction with it.
 */
function bestOffset(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    if (sorted.length % 2) return Math.round(sorted[mid]);
    // Of the two middle values, the smaller correction: both fit as well.
    const [low, high] = [sorted[mid - 1], sorted[mid]];
    return Math.round(Math.abs(low) <= Math.abs(high) ? low : high);
}

/**
 * Minutes from ours to theirs, the short way round the clock. Our times run
 * past 1440 for an isha after midnight and a typed one never does, so 00:30
 * against 1470 is the same minute, not a day apart.
 */
function clockDiff(theirs: number, ours: number): number {
    return ((((theirs - ours) % 1440) + 1440 + 720) % 1440) - 720;
}

/** Score one setup against every sample. */
export function scoreSetup(
    samples: MatchSample[],
    setup: MatchSetup,
    timesFor: TimesFor
): MatchResult {
    const residuals: MatchResult['residuals'] = [];
    let error = 0;
    let worst = 0;

    for (const sample of samples) {
        const ours = timesFor(setup, sample.date);
        const row: Partial<Record<MatchTimeId, number>> = {};
        for (const id of MATCH_TIMES) {
            const theirs = sample.times[id];
            if (theirs === undefined) continue;
            const computed = ours?.[id];
            // A time the setup cannot produce at all — an isha that never comes
            // under "don't substitute" — is as wrong as a time can be.
            const diff =
                computed !== undefined && Number.isFinite(computed)
                    ? clockDiff(theirs, computed)
                    : NaN;
            row[id] = diff;
            const cost = Number.isFinite(diff) ? Math.abs(diff) : 24 * 60;
            error += cost;
            worst = Math.max(worst, cost);
        }
        residuals.push(row);
    }

    const adjustments: MatchResult['adjustments'] = {};
    for (const id of MATCH_TIMES) {
        const values = residuals
            .map((r) => r[id])
            .filter((v): v is number => v !== undefined && Number.isFinite(v));
        const offset = bestOffset(values);
        if (offset !== 0 && Math.abs(offset) <= MAX_ADJUSTMENT) adjustments[id] = offset;
    }
    const after = residuals.map((row) => {
        const out: Partial<Record<MatchTimeId, number>> = {};
        for (const id of MATCH_TIMES) {
            const r = row[id];
            if (r !== undefined) out[id] = r - (adjustments[id] ?? 0);
        }
        return out;
    });

    return { setup, residuals, error, worst, adjustments, after };
}

/**
 * Among setups that fit equally well, which to offer.
 *
 * A named method before a pair of angles that happens to equal it — "Muslim
 * World League" means something to a person, "18° / 17°" does not. Then
 * whatever is already set, so a tie never changes a setting for nothing; then
 * the order methods are listed in.
 */
function preference(result: MatchResult, current: MatchSetup): number {
    const s = result.setup;
    let score = 0;
    if (s.method === 'custom') score += 1000;
    if (s.method !== current.method) score += 100;
    if (s.highLatRule !== current.highLatRule) score += 10;
    if (s.rounding !== current.rounding) score += 5;
    if (s.asrMadhab !== current.asrMadhab) score += 1;
    return score * 100 + PRAYER_METHODS.findIndex((m) => m.id === s.method);
}

function rank(results: MatchResult[], current: MatchSetup): MatchResult[] {
    return results.sort(
        (a, b) =>
            a.error - b.error ||
            a.worst - b.worst ||
            preference(a, current) - preference(b, current)
    );
}

/** The fajr and isha angles that best fit, found one at a time. */
function bestCustom(
    samples: MatchSample[],
    base: Omit<MatchSetup, 'method' | 'fajrAngle' | 'ishaAngle'>,
    timesFor: TimesFor
): MatchResult {
    let fajr = { angle: ANGLE_MIN, cost: Infinity };
    let isha = { angle: ANGLE_MIN, cost: Infinity };
    for (let angle = ANGLE_MIN; angle <= ANGLE_MAX + 1e-9; angle += ANGLE_STEP) {
        const tried = scoreSetup(
            samples,
            { ...base, method: 'custom', fajrAngle: angle, ishaAngle: angle },
            timesFor
        );
        const cost = (id: MatchTimeId) =>
            tried.residuals.reduce((sum, r) => {
                const v = r[id];
                return v === undefined ? sum : sum + (Number.isFinite(v) ? Math.abs(v) : 1440);
            }, 0);
        if (cost('fajr') < fajr.cost) fajr = { angle, cost: cost('fajr') };
        if (cost('isha') < isha.cost) isha = { angle, cost: cost('isha') };
    }
    return scoreSetup(
        samples,
        { ...base, method: 'custom', fajrAngle: fajr.angle, ishaAngle: isha.angle },
        timesFor
    );
}

/**
 * Every setup, best first.
 *
 * Returns the whole ranking rather than a winner: the dialog shows the best,
 * offers the next few, and needs the other madhab's figure for the same method
 * so the choice between them can be made with the numbers in view.
 */
export function matchSetups(
    samples: MatchSample[],
    opts: MatchOptions,
    timesFor: TimesFor
): MatchResult[] {
    const given = samples.filter((s) => MATCH_TIMES.some((id) => s.times[id] !== undefined));
    if (given.length === 0) return [];

    const results: MatchResult[] = [];
    for (const asrMadhab of ['standard', 'hanafi'] as const) {
        for (const highLatRule of HIGH_LAT_RULES) {
            for (const rounding of PRAYER_ROUNDINGS) {
                const base = { asrMadhab, highLatRule, rounding };
                for (const method of PRAYER_METHODS) {
                    if (method.id === 'custom') continue;
                    results.push(scoreSetup(given, { ...base, method: method.id }, timesFor));
                }
                results.push(bestCustom(given, base, timesFor));
            }
        }
    }

    // Angles that fit no better than a named method with everything else the
    // same are that method under another name, and are left out.
    const named = new Map<string, number>();
    const rest = (s: MatchSetup) => `${s.asrMadhab}|${s.highLatRule}|${s.rounding}`;
    for (const r of results) {
        if (r.setup.method === 'custom') continue;
        named.set(rest(r.setup), Math.min(named.get(rest(r.setup)) ?? Infinity, r.error));
    }
    const kept = results.filter(
        (r) => r.setup.method !== 'custom' || r.error < (named.get(rest(r.setup)) ?? Infinity)
    );
    return rank(kept, opts.current);
}

/**
 * The best result for a given madhab, method and angles held — the figure the
 * dialog shows when the user switches madhab on a proposal.
 */
export function withMadhab(
    ranking: MatchResult[],
    result: MatchResult,
    asrMadhab: AsrMadhab
): MatchResult | undefined {
    if (result.setup.asrMadhab === asrMadhab) return result;
    return ranking.find(
        (r) =>
            r.setup.asrMadhab === asrMadhab &&
            r.setup.method === result.setup.method &&
            (result.setup.method !== 'custom' ||
                (r.setup.fajrAngle === result.setup.fajrAngle &&
                    r.setup.ishaAngle === result.setup.ishaAngle))
    );
}

/**
 * The few worth offering: the best, then the best of each *other* method —
 * eight rows that differ only in the high-latitude rule would be one answer
 * repeated.
 */
export function distinctMethods(ranking: MatchResult[], limit: number): MatchResult[] {
    const out: MatchResult[] = [];
    const seen = new Set<string>();
    for (const r of ranking) {
        const key =
            r.setup.method === 'custom'
                ? `custom:${r.setup.fajrAngle}/${r.setup.ishaAngle}`
                : r.setup.method;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
        if (out.length >= limit) break;
    }
    return out;
}
