import type { ContentItem } from '../../../store/contentSlice';

/**
 * Duplicate detection for the add form.
 *
 * A library grows by adding the same thing twice: the film and its remake, the
 * series and one of its seasons, or plainly the same book entered a second time
 * six months later. Nothing here blocks a save — the check only surfaces what
 * is already in the library so the decision is informed.
 */

export type DuplicateKind = 'exact' | 'similar';

export interface DuplicateMatch {
    item: ContentItem;
    kind: DuplicateKind;
}

/** Shortest normalized title still worth prefix-matching on. */
const MIN_PREFIX_LENGTH = 4;

/**
 * Reduce a title to a comparable key.
 *
 * Case, punctuation and spacing all vary between providers ("WALL·E" /
 * "Wall-E"), leading articles are inconsistently included, and `ё` is typed
 * both ways in Russian. Folding all of that away makes the comparison about
 * the work rather than the typing.
 */
export function normalizeTitle(title: string): string {
    const base = title
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return base.replace(/^(the|a|an)\s+/, '');
}

/**
 * Items already in the library that look like `title`.
 *
 * An exact normalized match is reported as `exact`. A prefix match is reported
 * as `similar`, which is what catches "Bleach" against "Bleach: Thousand-Year
 * Blood War" — genuinely different works, but worth a glance before adding a
 * third one. Prefixes shorter than {@link MIN_PREFIX_LENGTH} are ignored, since
 * "It" would otherwise match half a library.
 *
 * Exact matches sort first; the rest keep the library's own order.
 */
export function findDuplicates(
    items: ContentItem[],
    title: string,
    typeId?: string
): DuplicateMatch[] {
    const key = normalizeTitle(title);
    if (!key) return [];

    const matches: DuplicateMatch[] = [];
    for (const item of items) {
        const other = normalizeTitle(item.title);
        if (!other) continue;

        if (other === key) {
            matches.push({ item, kind: 'exact' });
            continue;
        }
        // Only the *same* type is worth a fuzzy warning: a book and the film of
        // it share a title on purpose, and flagging that is noise.
        if (typeId && item.type !== typeId) continue;

        const [short, long] = key.length <= other.length ? [key, other] : [other, key];
        if (short.length >= MIN_PREFIX_LENGTH && long.startsWith(`${short} `)) {
            matches.push({ item, kind: 'similar' });
        }
    }

    return matches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'exact' ? -1 : 1));
}
