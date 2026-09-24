/**
 * How well a query matches a piece of text, from 0 (not at all) to about 1.2.
 *
 * Pure, so the ranking can be tested without Obsidian. Deliberately simple and
 * predictable rather than clever: a query is split into words, every word has
 * to be found, and each is scored by where it was found —
 *
 *   the start of the text   1.00   "sync" → "Sync now"
 *   the start of a word     0.85   "now"  → "Sync now"
 *   the words' initials     0.70   "tc"   → "Tasks Calendar"
 *   anywhere inside         0.60   "ync"  → "Sync now"
 *   in order, with gaps     0.30   "snw"  → "Sync now" (three letters or more)
 *
 * — averaged. The whole text, exactly, is 1.2, above anything else. A word
 * that is found nowhere makes the whole query miss.
 *
 * A query typed with the wrong keyboard layout — "ынтс" for "sync", "nfcr" for
 * "таск" — is tried the other way round too, a little lower, so a match made
 * as typed always wins over one made by guessing.
 */

/** The score of a text that is the query, exactly. */
export const EXACT = 1.2;

/** Lower case, `ё` as `е`, one space between words. */
export function normalize(text: string): string {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** The words of a normalized text: runs of letters and digits. */
export function wordsOf(text: string): string[] {
    return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// The same keys on a QWERTY and a ЙЦУКЕН keyboard.
const LATIN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const CYRILLIC = 'йцукенгшщзхъфывапролджэячсмитьбюё';

const TO_CYRILLIC = new Map([...LATIN].map((c, i) => [c, CYRILLIC[i]]));
const TO_LATIN = new Map([...CYRILLIC].map((c, i) => [c, LATIN[i]]));

function swap(text: string, map: Map<string, string>): string {
    return [...text].map((c) => map.get(c) ?? c).join('');
}

/**
 * The query as it would read on the other keyboard layout, or null when that
 * is not a question worth asking: a query with letters of both alphabets was
 * typed on purpose, and one with none has nothing to swap.
 */
export function otherLayout(query: string): string | null {
    const q = query.toLowerCase();
    const latin = /[a-z]/.test(q);
    const cyrillic = /[а-яё]/.test(q);
    if (latin === cyrillic) return null;
    return normalize(swap(q, latin ? TO_CYRILLIC : TO_LATIN));
}

/** Letters of `needle` appear in `hay` in order. */
function inOrder(needle: string, hay: string): boolean {
    let at = 0;
    for (const c of needle) {
        at = hay.indexOf(c, at);
        if (at < 0) return false;
        at++;
    }
    return true;
}

function scoreWord(word: string, text: string, words: string[], initials: string): number {
    if (text.startsWith(word)) return 1;
    if (words.some((w) => w.startsWith(word))) return 0.85;
    if (word.length >= 2 && initials.startsWith(word)) return 0.7;
    if (text.includes(word)) return 0.6;
    if (word.length >= 3 && inOrder(word, text.replace(/ /g, ''))) return 0.3;
    return 0;
}

/**
 * Score one normalized query against one text, as typed. Both are normalized
 * here, so callers can pass raw strings.
 */
export function scoreText(query: string, text: string): number {
    const q = normalize(query);
    const t = normalize(text);
    if (!q || !t) return 0;
    if (t === q) return EXACT;

    const words = wordsOf(t);
    const initials = words.map((w) => w[0]).join('');
    const parts = q.split(' ');
    let total = 0;
    for (const part of parts) {
        const s = scoreWord(part, t, words, initials);
        if (s === 0) return 0;
        total += s;
    }
    return total / parts.length;
}

/** How much less a match made on the other keyboard layout counts. */
const OTHER_LAYOUT = 0.9;

/**
 * The best score of a query over several texts: the query as typed, and, a
 * little lower, as it would read on the other layout.
 */
export function scoreTexts(query: string, texts: readonly string[]): number {
    const swapped = otherLayout(query);
    let best = 0;
    for (const text of texts) {
        best = Math.max(best, scoreText(query, text));
        if (swapped) best = Math.max(best, scoreText(swapped, text) * OTHER_LAYOUT);
    }
    return best;
}
