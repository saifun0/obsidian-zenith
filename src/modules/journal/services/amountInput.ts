/**
 * What was typed into a tracker's amount, as what to record.
 *
 * - a number — record it;
 * - `null` — the field was emptied: clear the day's value;
 * - `undefined` — not an amount (letters, a minus): leave the day as it was.
 *
 * A comma is a decimal point: a Russian keyboard's number pad types one. Two
 * decimals are kept and no more — "7.5 hours" is an amount, the tail of a
 * float is not.
 */
export function parseAmount(text: string): number | null | undefined {
    const typed = text.trim().replace(',', '.');
    if (typed === '') return null;
    if (!/^\d*\.?\d*$/.test(typed) || typed === '.') return undefined;
    const n = Number(typed);
    if (!Number.isFinite(n)) return undefined;
    return Number(n.toFixed(2));
}
