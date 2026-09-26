import { LANGUAGE_NAMES, LANGUAGE_STYLES } from './languageData';

/**
 * What a code block's language is called and how it looks: the word after the
 * fence, turned into a name, a colour and an icon.
 *
 * The tables are Code Styler's (see `languageData.ts`), so a note written for
 * it reads the same here. On top of them, a few words it left without an icon
 * are sent to the icon of the language they are: `bash` and `zsh` are shells,
 * `rs` is Rust.
 */

export interface CodeLanguage {
    /** The word as written after the fence, lower case; empty for none. */
    id: string;
    /** What the header calls it; empty for a block with no language. */
    name: string;
    /** The language's colour, for the stripe; null when it has none. */
    colour: string | null;
    /** The icon as an image address; null when it has none. */
    icon: string | null;
}

/** Words Code Styler does not know, named after a language it does. */
const EXTRA_NAMES: Readonly<Record<string, string>> = {
    rs: 'Rust',
    'c++': 'C++',
    ps1: 'PowerShell',
    pwsh: 'PowerShell',
    bat: 'Batch',
    cmd: 'Batch',
    golang: 'Go',
    py3: 'Python',
    kt: 'Kotlin',
};

const PLAIN_TEXT = 'Plain text';

/** Names that have no icon of their own, and the one they borrow. */
const BORROWED_STYLE: Readonly<Record<string, string>> = {
    Bash: 'Shell',
    Zsh: 'Shell',
    Fish: 'Shell',
    TeX: 'LaTeX',
};

/**
 * The language of a fence's first word.
 *
 * A word nobody knows is shown as written, capitalised, with no icon and no
 * colour — as Code Styler does, so a private name like `todo` still reads as
 * a header rather than disappearing.
 */
export function resolveLanguage(raw: string): CodeLanguage {
    const id = raw.trim().toLowerCase();
    if (!id) {
        // No language: plain text, with its icon, under a name the header
        // translates.
        const plain = LANGUAGE_STYLES[PLAIN_TEXT];
        return {
            id: '',
            name: '',
            colour: plain.colour ?? null,
            icon: iconUrl(PLAIN_TEXT, plain.icon),
        };
    }

    const name = EXTRA_NAMES[id] ?? LANGUAGE_NAMES[id] ?? capitalise(raw.trim());
    const style = LANGUAGE_STYLES[name] ?? LANGUAGE_STYLES[BORROWED_STYLE[name] ?? ''];
    return {
        id,
        name,
        colour: style?.colour ?? null,
        icon: style ? iconUrl(name, style.icon) : null,
    };
}

export interface LanguageEntry {
    language: CodeLanguage;
    /** The words after a fence that lead to it, sorted. */
    words: string[];
}

/**
 * Every language Zenith can name, split by whether it has an icon — for the
 * debug gallery, where the whole table is checked at a glance.
 */
export function languageTable(): { styled: LanguageEntry[]; plain: LanguageEntry[] } {
    const words = new Map<string, string[]>();
    for (const [word, name] of Object.entries({ ...LANGUAGE_NAMES, ...EXTRA_NAMES })) {
        words.set(name, [...(words.get(name) ?? []), word]);
    }
    const names = new Set([...words.keys(), ...Object.keys(LANGUAGE_STYLES)]);

    const styled: LanguageEntry[] = [];
    const plain: LanguageEntry[] = [];
    for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
        const list = (words.get(name) ?? []).sort();
        const style = LANGUAGE_STYLES[name] ?? LANGUAGE_STYLES[BORROWED_STYLE[name] ?? ''];
        const language: CodeLanguage = {
            id: list[0] ?? name.toLowerCase(),
            name,
            colour: style?.colour ?? null,
            icon: style ? iconUrl(name, style.icon) : null,
        };
        (style ? styled : plain).push({ language, words: list });
    }
    return { styled, plain };
}

/** The language of a code element, from Obsidian's `language-…` class. */
export function languageOfClass(className: string): string {
    const cls = className.split(/\s+/).find((c) => c.startsWith('language-'));
    return cls ? cls.slice('language-'.length) : '';
}

const icons = new Map<string, string>();

/**
 * An icon as an image address rather than inline SVG.
 *
 * Inlined, two blocks in one note would carry the same gradient ids, and the
 * second would paint with the first one's; an `<img>` keeps each icon in a
 * document of its own. Built once per language.
 */
function iconUrl(name: string, markup: string): string {
    let url = icons.get(name);
    if (!url) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32">${markup}</svg>`;
        url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        icons.set(name, url);
    }
    return url;
}

function capitalise(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
