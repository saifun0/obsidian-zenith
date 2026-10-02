import { LOCALES, translate } from '../../../core/i18n';
import type { Priority } from '../../../core/constants';
import type { DueFilter } from './taskFilter';

/**
 * The search field of the tasks view, read as a query.
 *
 * It replaced a panel of five dropdowns. Words are searched for, as before;
 * a few kinds of word narrow the list instead:
 *
 * - `#work` — tasks carrying that tag, or a tag nested under it;
 * - `!high`, `!высокий`, `!高` — one priority; `!`, `!!`, `!!!` — that
 *   priority or above (medium, high, urgent), as quick-add reads them;
 * - `overdue`, `today`, `week`, `no date` — by deadline, in any of the
 *   plugin's languages whichever one the interface is in, because people type
 *   the word they think in.
 *
 * Pure, and handed its keywords so a test can say exactly which ones exist.
 */
export interface SearchQuery {
    /** What is left to match against titles and tags. */
    text: string;
    /** Every one must match. */
    tags: string[];
    priority?: Priority;
    /** This priority or above. */
    minPriority?: Priority;
    due?: Exclude<DueFilter, 'all'>;
}

export interface SearchWords {
    due: Array<{ phrase: string; due: Exclude<DueFilter, 'all'> }>;
    priority: Array<{ word: string; priority: Priority }>;
}

const DUE_KEYS: Array<[Exclude<DueFilter, 'all'>, string]> = [
    ['overdue', 'tasks.search.kw.overdue'],
    ['today', 'tasks.search.kw.today'],
    ['week', 'tasks.search.kw.week'],
    ['none', 'tasks.search.kw.nodate'],
];

const PRIORITY_KEYS: Array<[Priority, string]> = [
    ['urgent', 'priority.urgent'],
    ['high', 'priority.high'],
    ['medium', 'priority.medium'],
    ['low', 'priority.low'],
];

/** The bangs quick-add reads, as thresholds. */
const BANGS: Record<string, Priority> = { '!': 'medium', '!!': 'high', '!!!': 'urgent' };

let cached: SearchWords | null = null;

/** The keywords of every language the plugin speaks, longest phrase first. */
export function searchWords(): SearchWords {
    if (cached) return cached;
    const due: SearchWords['due'] = [];
    const priority: SearchWords['priority'] = [];
    for (const locale of LOCALES) {
        for (const [value, key] of DUE_KEYS) {
            due.push({ phrase: translate(locale, key).toLocaleLowerCase(), due: value });
        }
        for (const [value, key] of PRIORITY_KEYS) {
            priority.push({ word: translate(locale, key).toLocaleLowerCase(), priority: value });
        }
    }
    due.sort((a, b) => b.phrase.length - a.phrase.length);
    cached = { due, priority };
    return cached;
}

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

export function parseSearch(input: string, words: SearchWords = searchWords()): SearchQuery {
    const out: SearchQuery = { text: '', tags: [] };
    let rest = input;

    // Phrases first: "no date" is two words, and "date" alone means nothing.
    const lower = () => rest.toLocaleLowerCase();
    for (const { phrase, due } of words.due) {
        if (!phrase) continue;
        let at = lower().indexOf(phrase);
        while (at !== -1) {
            const before = rest[at - 1];
            const after = rest[at + phrase.length];
            if (isSpace(before) && isSpace(after)) {
                out.due ??= due;
                rest = rest.slice(0, at) + ' ' + rest.slice(at + phrase.length);
                at = lower().indexOf(phrase);
            } else {
                at = lower().indexOf(phrase, at + 1);
            }
        }
    }

    const kept: string[] = [];
    for (const token of rest.split(/\s+/)) {
        if (!token) continue;
        if (token.length > 1 && token.startsWith('#')) {
            out.tags.push(token.slice(1).toLocaleLowerCase());
            continue;
        }
        if (BANGS[token]) {
            out.minPriority = BANGS[token];
            continue;
        }
        if (token.startsWith('!') && token.length > 1) {
            const word = token.slice(1).toLocaleLowerCase();
            const hit = words.priority.find((p) => p.word === word);
            if (hit) {
                out.priority = hit.priority;
                continue;
            }
        }
        kept.push(token);
    }
    out.text = kept.join(' ');
    return out;
}

/** A tag matches `#work` when it is `work` or nested under it — or begins so, while being typed. */
export function tagMatches(tag: string, wanted: string): boolean {
    return tag.toLocaleLowerCase().startsWith(wanted);
}

/** Whether the query narrows the list at all. */
export function isFiltering(q: SearchQuery): boolean {
    return !!(q.text || q.tags.length || q.priority || q.minPriority || q.due);
}
