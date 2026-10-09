/**
 * The text widget, as data.
 *
 * A card of words: either typed on the back of the card, or the top of a note
 * in the vault. Which of the two, and whether there is anything to show at
 * all, is decided here as a pure function of the settings — the same split
 * the picture widget makes (`pictureSource.ts`), for the same reason: the
 * awkward cases can then be tested rather than eyeballed.
 */

export type TextSource = 'own' | 'note';
export type TextSize = 'sm' | 'md' | 'lg';
export type TextAlign = 'start' | 'center';
/** The theme's own face, or the planner's serif — for a line that is a motto rather than a note. */
export type TextFace = 'plain' | 'serif';

export const TEXT_SOURCES: readonly TextSource[] = ['own', 'note'] as const;
export const TEXT_SIZES: readonly TextSize[] = ['sm', 'md', 'lg'] as const;
export const TEXT_ALIGNS: readonly TextAlign[] = ['start', 'center'] as const;
export const TEXT_FACES: readonly TextFace[] = ['plain', 'serif'] as const;

/** One card's worth of settings — per copy, like every widget's. */
export interface TextSettings extends Record<string, unknown> {
    /** Words typed on the card, or a note in the vault. */
    textSource: TextSource;
    /** Markdown, used when the source is `own`. */
    text: string;
    /** Vault-relative path of a note, used when the source is `note`. */
    textPath: string;
    textSize: TextSize;
    textAlign: TextAlign;
    textFace: TextFace;
}

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
    textSource: 'own',
    text: '',
    textPath: '',
    textSize: 'md',
    textAlign: 'start',
    textFace: 'plain',
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Coerce a stored bucket into usable settings; every field falls back. */
export function normalizeTextSettings(raw: Record<string, unknown> | undefined): TextSettings {
    if (!raw) return DEFAULT_TEXT_SETTINGS;
    return {
        textSource: oneOf(raw.textSource, TEXT_SOURCES, DEFAULT_TEXT_SETTINGS.textSource),
        text: text(raw.text),
        textPath: text(raw.textPath),
        textSize: oneOf(raw.textSize, TEXT_SIZES, DEFAULT_TEXT_SETTINGS.textSize),
        textAlign: oneOf(raw.textAlign, TEXT_ALIGNS, DEFAULT_TEXT_SETTINGS.textAlign),
        textFace: oneOf(raw.textFace, TEXT_FACES, DEFAULT_TEXT_SETTINGS.textFace),
    };
}

export type TextState =
    /** Nothing typed and no note chosen. The widget says where to do it. */
    | { kind: 'empty' }
    | { kind: 'own'; markdown: string }
    /** A note to read. Whether it exists is only known once the vault is asked. */
    | { kind: 'note'; path: string };

export function textState(settings: TextSettings): TextState {
    if (settings.textSource === 'note') {
        const path = settings.textPath.trim();
        return path ? { kind: 'note', path } : { kind: 'empty' };
    }
    return settings.text.trim() ? { kind: 'own', markdown: settings.text } : { kind: 'empty' };
}

/**
 * How much of a note a card draws.
 *
 * A card shows the top of a note, not the note: rendering forty screens of
 * Markdown into a cell two rows tall costs the whole board its first paint
 * and shows nobody anything.
 */
export const NOTE_LIMIT = 12_000;

/** The mark some editors put before the first character of a file. */
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

/** A leading `---` block. Empty frontmatter (`---\n---`) counts. */
const FRONTMATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * What a note says, for a card: without its frontmatter, and cut at a line
 * once it runs past `limit`.
 */
export function noteBody(content: string, limit = NOTE_LIMIT): string {
    const body = content.replace(BOM, '').replace(FRONTMATTER, '').trim();
    if (body.length <= limit) return body;
    const cut = body.lastIndexOf('\n', limit);
    return `${body.slice(0, cut > 0 ? cut : limit).trimEnd()}\n\n…`;
}

/** A note's name as the card says it: the file's, without folder or `.md`. */
export function noteName(path: string): string {
    return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}
