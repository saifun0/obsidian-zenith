import { normalize } from './match';
import type { Snippet } from './searchSources';

/**
 * Finding words in what a note says: the pure half of the notes group, so
 * what counts as found, and which line is shown for it, is tested without a
 * vault.
 *
 * - Every word of the query has to be somewhere in the note, each at the
 *   start of a word: "замет" finds "заметка" and "заметки"; "мет" does not.
 * - "Words in quotes" are found together, as a phrase, on one line.
 * - Case does not matter, and ё is е.
 * - The other keyboard layout is not guessed, as it is for names: across a
 *   whole vault a swapped word nearly always finds something, and never what
 *   was meant.
 * - A note's properties and its tasks are not searched. The properties are
 *   the library's and the projects' to find by; the tasks, with the lines
 *   under them, are the Tasks group's.
 */

/** Letters and digits a query needs before notes are searched at all. */
export const NOTES_FROM = 3;

/** Characters of a found line shown under a note's name. */
const SNIPPET = 90;
/** Of those, how many go before the first word found. */
const LEAD = 24;

export interface TextQuery {
    /** Normalized: lower case, ё as е. A phrase keeps its spaces. */
    terms: readonly string[];
    /** One per term: at a word's start, ё and е alike. */
    patterns: readonly RegExp[];
}

/** Where a note says it. */
export interface TextSpot {
    /** 0-based line. */
    line: number;
    /** The line holds every word of the query, and is a heading. */
    heading: boolean;
}

/** The found line, ready to show and to open at. */
export interface TextLine {
    snippet: Snippet;
    /** Where on the line, as written, the first word found starts, and its length. */
    ch: number;
    length: number;
}

/** Letters and digits in a text. */
export function lettersIn(text: string): number {
    return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A term as a pattern: at a word's start, ё and е alike, a phrase's spaces as any run of them. */
function termPattern(term: string, flags: string): RegExp {
    const body = escapeRe(term).replace(/е/g, '[её]').replace(/ /g, '[ \\t]+');
    // The word's start as a group rather than a lookbehind, which older
    // iPhones cannot compile.
    return new RegExp(`(^|[^\\p{L}\\p{N}])(${body})`, flags);
}

/** The query's words and "phrases", or null when it is too short to search notes by. */
export function parseTextQuery(query: string): TextQuery | null {
    if (lettersIn(query) < NOTES_FROM) return null;
    const terms: string[] = [];
    // A quote left open runs to the end of the line.
    const re = /"([^"]*)"?|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) {
        const term = normalize(m[1] ?? m[2]);
        if (lettersIn(term)) terms.push(term);
    }
    if (!terms.length) return null;
    return { terms, patterns: terms.map((term) => termPattern(term, 'iu')) };
}

const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]/;
const HEADING = /^#{1,6}\s/;

function indentOf(line: string): number {
    let width = 0;
    for (const c of line) {
        if (c === ' ') width += 1;
        else if (c === '\t') width += 4;
        else break;
    }
    return width;
}

/**
 * A note's text as it is searched: its properties and its tasks, with the
 * lines under each task, blanked. Blanked rather than cut, so a line found is
 * still the line it is in the note.
 */
export function prepareText(raw: string): string {
    const lines = raw.split(/\r?\n/);
    let properties = -1;
    if (lines[0]?.trim() === '---') {
        properties = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
    }
    // The indent of the task whose lines these are, or -1.
    let under = -1;
    return lines
        .map((line, i) => {
            if (i <= properties) return '';
            if (TASK.test(line)) {
                under = indentOf(line);
                return '';
            }
            if (under >= 0 && (!line.trim() || indentOf(line) > under)) return '';
            under = -1;
            return line;
        })
        .join('\n');
}

/**
 * Whether the note says every term, and if so the line that says the most of
 * them — a heading over the text when both say all of it, the first otherwise.
 */
export function locate(text: string, query: TextQuery): TextSpot | null {
    if (!query.patterns.every((p) => p.test(text))) return null;
    const all = query.patterns.length;
    let best: (TextSpot & { count: number }) | null = null;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        let count = 0;
        for (const p of query.patterns) if (p.test(line)) count++;
        if (!count) continue;
        const heading = count === all && HEADING.test(line);
        if (!best || count > best.count || (heading && !best.heading)) {
            best = { line: i, heading, count };
            if (heading) break;
        }
    }
    return best && { line: best.line, heading: best.heading };
}

/** The line as read: no list marker, heading hashes, link brackets or emphasis marks. */
function cleanLine(line: string): string {
    return line
        .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, '')
        .replace(/!?\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
        .replace(/!?\[\[([^\]]*)\]\]/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*|__|==|~~|`/g, '')
        .trim();
}

/** Every term's place in `text`, merged where they overlap. */
function marksIn(text: string, query: TextQuery): Array<[number, number]> {
    const found: Array<[number, number]> = [];
    for (const term of query.terms) {
        const re = termPattern(term, 'giu');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const start = m.index + m[1].length;
            found.push([start, start + m[2].length]);
            if (!m[0]) re.lastIndex++;
        }
    }
    found.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const mark of found) {
        const last = merged[merged.length - 1];
        if (last && mark[0] <= last[1]) last[1] = Math.max(last[1], mark[1]);
        else merged.push([mark[0], mark[1]]);
    }
    return merged;
}

/** The found line as shown — cut around the first word when it is long — and where to select it. */
export function lineOf(line: string, query: TextQuery): TextLine {
    const raw = marksIn(line, query)[0];
    const text = cleanLine(line);
    let marks = marksIn(text, query);
    let shown = text;
    if (text.length > SNIPPET) {
        const start = Math.max(0, Math.min((marks[0]?.[0] ?? 0) - LEAD, text.length - SNIPPET));
        const end = start + SNIPPET;
        const lead = start > 0 ? '…' : '';
        shown = `${lead}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
        // The cut text's own marks: trimming moved them.
        marks = marksIn(shown, query);
    }
    return {
        snippet: { text: shown, marks },
        ch: raw?.[0] ?? 0,
        length: raw ? raw[1] - raw[0] : 0,
    };
}

/**
 * Obsidian's "Excluded files" — a folder or file by the start of its path, or
 * a `/regular expression/` — and the templates folder: what the notes group
 * leaves out.
 */
export function pathFilter(
    excluded: readonly string[],
    templates: string
): (path: string) => boolean {
    const tests: Array<(path: string) => boolean> = [];
    for (const filter of excluded) {
        const re = /^\/(.+)\/([a-z]*)$/.exec(filter);
        if (re) {
            try {
                const pattern = new RegExp(re[1], re[2]);
                tests.push((path) => pattern.test(path));
            } catch {
                // A pattern Obsidian could not read either.
            }
            continue;
        }
        const prefix = filter.replace(/^\/+/, '');
        if (prefix) tests.push((path) => path.startsWith(prefix));
    }
    const folder = templates.replace(/^\/+|\/+$/g, '');
    if (folder) tests.push((path) => path.startsWith(`${folder}/`));
    return (path) => tests.some((test) => test(path));
}
