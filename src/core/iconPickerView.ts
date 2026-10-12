import type { IconSource } from './icons';

/**
 * How many of Obsidian's own icons the picker draws at once. There are well
 * over a thousand; a grid of all of them is a wall, and a name typed into the
 * search brings any of them up.
 */
export const BUILT_IN_LIMIT = 160;

/** A group of icons under one heading. */
export interface IconGroup {
    /** The pack's or module's name; empty for Obsidian's own set, which the picker names itself. */
    label: string;
    /** Who made the pack, when it says. */
    author?: string;
    /** Icon ids, as they are stored. */
    ids: string[];
}

export interface IconPickerView {
    /** Packs and modules first, each under its own heading. */
    custom: IconGroup[];
    /** Obsidian's own set, as many as are drawn. */
    builtIn: string[];
    /** Matching built-in icons left out, past {@link BUILT_IN_LIMIT}. */
    more: number;
}

/**
 * What the picker shows for what has been typed.
 *
 * Custom icons lead because there are a handful of them against Obsidian's
 * many hundreds. Sorted the other way they would be unreachable without
 * knowing what to type, which for a logo just installed is the one thing a
 * person is least likely to know the name of. For the same reason the limit
 * is counted only against the built-in set: a pack can never be crowded out.
 */
export function iconPickerView(
    query: string,
    sources: readonly IconSource[],
    builtInIds: readonly string[],
    limit = BUILT_IN_LIMIT
): IconPickerView {
    const needle = query.trim().toLowerCase();
    const custom: IconGroup[] = [];
    for (const source of sources) {
        // An icon is found by its own name and by the pack that supplied it.
        const ids = source.icons
            .filter(
                (icon) =>
                    !needle ||
                    icon.name.toLowerCase().includes(needle) ||
                    icon.source.toLowerCase().includes(needle)
            )
            .map((icon) => icon.id);
        if (ids.length) custom.push({ label: source.label, author: source.author, ids });
    }
    const builtIn = needle ? builtInIds.filter((id) => id.toLowerCase().includes(needle)) : builtInIds;
    return {
        custom,
        builtIn: builtIn.slice(0, limit),
        more: Math.max(0, builtIn.length - limit),
    };
}

/** The part of an id a person recognises: "logo", not "zi:acme/logo"; "alarm-clock", not "lucide-alarm-clock". */
export function iconLabel(id: string): string {
    const name = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
    return name.replace(/^lucide-/, '');
}
