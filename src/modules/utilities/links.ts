/**
 * The links widget, as data.
 *
 * A short list of the places a day goes back to: notes in the vault and
 * addresses on the web. What the user types is free text, so reading it is
 * done here, where it can be tested — which line is an address, which is a
 * note, and which is neither and must not be opened at all.
 */

/** One row, as typed on the back of the card. */
export interface LinkItem {
    /** A vault path, a `[[wikilink]]`, or an address. */
    target: string;
    /** The user's own name for it. Empty means one is made from the target. */
    label: string;
}

export interface LinksSettings extends Record<string, unknown> {
    links: LinkItem[];
}

export const DEFAULT_LINKS_SETTINGS: LinksSettings = { links: [] };

/** Coerce a stored bucket; anything that is not a row is dropped. */
export function normalizeLinksSettings(raw: Record<string, unknown> | undefined): LinksSettings {
    if (!raw || !Array.isArray(raw.links)) return DEFAULT_LINKS_SETTINGS;
    const links = (raw.links as unknown[]).flatMap((item): LinkItem[] => {
        if (!item || typeof item !== 'object') return [];
        const { target, label } = item as Record<string, unknown>;
        if (typeof target !== 'string') return [];
        return [{ target, label: typeof label === 'string' ? label : '' }];
    });
    return { links };
}

export type ParsedLink =
    /** A row still being typed. Not drawn. */
    | { kind: 'empty' }
    /** An address in a scheme this opens. */
    | { kind: 'url'; href: string }
    /** A note, a heading in one, or any other file — as Obsidian's link text. */
    | { kind: 'vault'; linktext: string }
    /** An address in a scheme that is refused. Drawn, and never opened. */
    | { kind: 'refused' };

/**
 * Schemes a link may open.
 *
 * The web, mail and Obsidian's own. Everything else that looks like a scheme
 * — `javascript:` above all, `file:` with it — is refused rather than handed
 * to the window: a card on the board is one tap from being run.
 */
const OPENABLE = /^(?:https?:\/\/|mailto:|obsidian:\/\/)/i;

/** Anything that reads as `scheme:`. A Windows drive letter is one letter, so it is not. */
const SCHEME = /^[a-z][a-z0-9+.-]+:/i;

export function parseLink(target: string): ParsedLink {
    const raw = target.trim();
    if (!raw) return { kind: 'empty' };

    // `[[Note|alias]]`, as copied out of a note.
    const wiki = raw.match(/^\[\[([^\]]+)\]\]$/);
    if (wiki) {
        const linktext = wiki[1].split('|')[0].trim();
        return linktext ? { kind: 'vault', linktext } : { kind: 'empty' };
    }

    if (OPENABLE.test(raw)) return { kind: 'url', href: raw };
    if (SCHEME.test(raw)) return { kind: 'refused' };
    return { kind: 'vault', linktext: raw };
}

/**
 * What a row is called when the user gave it no name.
 *
 * A note is its file's name, with the heading after it when the link goes to
 * one; an address is its host, which is what tells two bookmarks apart.
 */
export function linkLabel(item: LinkItem): string {
    const own = item.label.trim();
    if (own) return own;

    const parsed = parseLink(item.target);
    if (parsed.kind === 'vault') {
        const [path, ...rest] = parsed.linktext.split('#');
        const name = (path.split('/').pop() ?? path).replace(/\.md$/i, '');
        const heading = rest.join('#').replace(/^\^/, '').trim();
        if (!name) return heading || parsed.linktext;
        return heading ? `${name} › ${heading}` : name;
    }
    if (parsed.kind === 'url') {
        if (/^mailto:/i.test(parsed.href)) return parsed.href.slice(7).split('?')[0];
        try {
            const url = new URL(parsed.href);
            return url.hostname.replace(/^www\./i, '') || parsed.href;
        } catch {
            return parsed.href;
        }
    }
    return item.target.trim();
}

/** The path part of a vault link: what the vault is asked for. */
export function linkPath(linktext: string): string {
    return linktext.split('#')[0].trim();
}
