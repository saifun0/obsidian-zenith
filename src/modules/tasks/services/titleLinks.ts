/**
 * The links in a task's title, as read rather than as written.
 *
 * A title is a line of Markdown, so it may hold `[[Note]]`, `[[Note|what it
 * is called]]` or `[text](https://…)`. Drawn as typed, the brackets are noise
 * in every row; the rows draw the words instead, as links, and the places a
 * row is already one thing to tap — a calendar's chip, a search result — draw
 * them as plain words.
 */

export type TitlePart =
    | { kind: 'text'; text: string }
    /** A note in the vault: `[[target]]`, or a Markdown link to a path. */
    | { kind: 'note'; text: string; target: string }
    /** Somewhere outside: `[text](https://…)`. */
    | { kind: 'url'; text: string; href: string };

const LINK = /!?\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** How a wiki link reads without an alias: the note, and "› heading" when it points into one. */
function linkText(target: string): string {
    const [note, ...rest] = target.replace(/#\^[^#]*$/, '').split('#');
    const heading = rest.join(' › ');
    return heading ? `${note} › ${heading}` : note;
}

export function titleParts(title: string): TitlePart[] {
    const parts: TitlePart[] = [];
    let at = 0;
    const text = (upTo: number) => {
        if (upTo > at) parts.push({ kind: 'text', text: title.slice(at, upTo) });
    };
    LINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK.exec(title)) !== null) {
        text(m.index);
        if (m[1] !== undefined) {
            const target = m[1].trim();
            parts.push({ kind: 'note', text: (m[2] ?? linkText(target)).trim(), target });
        } else if (SCHEME.test(m[4])) {
            parts.push({ kind: 'url', text: m[3], href: m[4] });
        } else {
            let target = m[4];
            try {
                target = decodeURI(target);
            } catch {
                // Left as written: a malformed escape is still a path to try.
            }
            parts.push({ kind: 'note', text: m[3], target: target.replace(/\.md$/i, '') });
        }
        at = m.index + m[0].length;
    }
    text(title.length);
    return parts;
}

/** The title as words, links and all. */
export function plainTitle(title: string): string {
    return title.includes('[') ? titleParts(title).map((part) => part.text).join('') : title;
}
