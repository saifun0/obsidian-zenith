import type { Translator } from '../../core/i18n';
import type { SyncProgress } from './services/SyncEngine';

/**
 * A run in flight, said in numbers a person can act on.
 *
 * Pure arithmetic and no DOM, because the two things that are easy to get wrong
 * here are impossible to see in a screenshot: a rate averaged over the wrong
 * window swings between "4 MB/s" and "40 kB/s" between frames, and an estimate
 * computed from a rate of zero is `Infinity` seconds, which renders as a bar
 * that says the sync will never finish.
 *
 * Everything is measured from the START of the run rather than between ticks.
 * A rate over the last two files is mostly noise — files differ in size by
 * three orders of magnitude — and the number people read off a transfer is the
 * one that predicts when it ends, which is the average.
 */

const KB = 1024;

/** What a share of the run looks like as a bar: 0–1, never NaN, never past 1. */
export function progressRatio(p: SyncProgress): number {
    // Files rather than bytes, because a plan can legitimately move zero bytes
    // — a run of pure deletions — and because the count is the thing that
    // cannot be wrong. Bytes are the plan's claim about sizes; files are what
    // actually finished.
    if (p.total <= 0) return 0;
    return Math.min(1, Math.max(0, p.done / p.total));
}

/**
 * Bytes, at the largest unit that leaves a number worth reading.
 *
 * One decimal below 10 and none above it: "9.4 MB" and "128 MB" are both four
 * characters of information, where "9 MB" throws away a tenth of the file and
 * "128.4 MB" spends a character on a tenth of a percent.
 */
export function formatBytes(bytes: number, t: Translator): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${t('sync.unit.kb')}`;

    const units = [t('sync.unit.kb'), t('sync.unit.mb'), t('sync.unit.gb')];
    let value = bytes / KB;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= KB;
        unit++;
    }

    const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return `${shown} ${units[unit]}`;
}

/** Bytes a second, averaged over the whole run. Null before there is a second. */
export function transferRate(p: SyncProgress, now: number): number | null {
    const elapsed = (now - p.startedAt) / 1000;
    // Under a third of a second the divisor is doing all the work and the answer
    // is whatever the first file happened to be, times three.
    if (!(elapsed > 0.3) || p.bytes <= 0) return null;
    return p.bytes / elapsed;
}

/**
 * Seconds left at the rate so far, or null when there is nothing to say.
 *
 * Null rather than a guess in the three cases where an estimate would be a
 * fiction: nothing has moved yet, the plan claims no bytes at all (deletions),
 * or the run is already finished.
 */
export function etaSeconds(p: SyncProgress, now: number): number | null {
    const rate = transferRate(p, now);
    if (rate === null || rate <= 0) return null;
    const left = p.totalBytes - p.bytes;
    if (left <= 0) return null;
    return left / rate;
}

/** "9 s" / "1:20" / "12:05" — a duration at the precision it deserves. */
export function formatDuration(seconds: number, t: Translator): string {
    const whole = Math.max(0, Math.round(seconds));
    if (whole < 60) return `${whole} ${t('sync.unit.seconds')}`;
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * The line under the bar: how fast, and how much longer.
 *
 * Assembled from whichever of the two are true rather than from both, so a run
 * that cannot estimate either — a handful of deletions, over in a moment — gets
 * a short honest line instead of "0 kB/s · ∞".
 */
export function rateLine(p: SyncProgress, now: number, t: Translator): string {
    const parts: string[] = [];

    const rate = transferRate(p, now);
    if (rate !== null) parts.push(t('sync.progress.rate', { rate: formatBytes(rate, t) }));

    const eta = etaSeconds(p, now);
    if (eta !== null) parts.push(t('sync.progress.eta', { time: formatDuration(eta, t) }));

    return parts.join(' · ');
}

/** "12 / 40" — the count, which is the claim the bar is actually making. */
export function countLine(p: SyncProgress): string {
    return `${p.done} / ${p.total}`;
}

/**
 * The last line of a finished run: what moved, and how long it took.
 *
 * Worth saying even when nothing failed. A sync that ends silently is
 * indistinguishable from one that never started, and this is the only moment
 * the user is told how much of their vault just went over the wire.
 */
export function doneLine(p: SyncProgress, now: number, t: Translator): string {
    const parts = [t('sync.progress.files', { count: String(p.done) })];
    if (p.bytes > 0) parts.push(formatBytes(p.bytes, t));
    const elapsed = (now - p.startedAt) / 1000;
    if (elapsed >= 1) parts.push(formatDuration(elapsed, t));
    return parts.join(' · ');
}
