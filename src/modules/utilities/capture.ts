import { appendBlock, insertUnderHeading } from '../../services/markdownSections';

/**
 * The quick-note widget, as data.
 *
 * A line typed on the board and filed in a note: today's daily note, or one
 * the user chose. What is written is decided here — one line, as a list item,
 * with the hour in front of it when asked — so the format can be tested
 * without a vault.
 */

export type CaptureTarget = 'daily' | 'note';
export const CAPTURE_TARGETS: readonly CaptureTarget[] = ['daily', 'note'] as const;

export interface CaptureSettings extends Record<string, unknown> {
    /**
     * Where a line goes. Unset until chosen: then today's note for whoever
     * keeps the journal, and a note of their own for whoever does not.
     */
    captureTo: CaptureTarget | null;
    /** Vault-relative path, used when the target is `note`. */
    capturePath: string;
    /** Put the time in front of the line. */
    captureStamp: boolean;
}

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
    captureTo: null,
    capturePath: '',
    captureStamp: true,
};

export function normalizeCaptureSettings(
    raw: Record<string, unknown> | undefined
): CaptureSettings {
    if (!raw) return DEFAULT_CAPTURE_SETTINGS;
    return {
        captureTo: raw.captureTo === 'daily' || raw.captureTo === 'note' ? raw.captureTo : null,
        capturePath: typeof raw.capturePath === 'string' ? raw.capturePath : '',
        captureStamp: raw.captureStamp !== false,
    };
}

/**
 * Where this card writes, once the journal's state is known.
 *
 * A card set to the daily note falls back to the chosen note while the journal
 * module is off: there is no daily note to write to then, and a line typed
 * into a card must land somewhere it can be found.
 */
export function captureTarget(settings: CaptureSettings, journalOn: boolean): CaptureTarget {
    if (!journalOn) return 'note';
    return settings.captureTo ?? 'daily';
}

/** A list or task marker the user typed themselves: `- `, `* `, `+ `, `1. `, `- [ ] `. */
const OWN_MARKER = /^(?:[-*+]|\d+[.)])\s+/;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The line as it goes into the note, or empty when there is nothing to write.
 *
 * Always one line: a note typed here is a thought, and a pasted paragraph is
 * folded into one. It becomes a list item, so a day's worth reads as a list —
 * unless it was typed as one already (`- [ ] buy milk` stays a task, with no
 * second dash and no hour pushed in front of its checkbox).
 */
export function captureLine(text: string, at: Date, stamp: boolean): string {
    const line = text.replace(/\s*\r?\n\s*/g, ' ').trim();
    if (!line) return '';
    if (OWN_MARKER.test(line)) return line;
    const time = stamp ? `${pad(at.getHours())}:${pad(at.getMinutes())} ` : '';
    return `- ${time}${line}`;
}

/**
 * A daily note with one more line in it: at the end of its notes section when
 * it has one, and at the end of the note when it does not.
 *
 * `headings` are tried in order. The section is called whatever the journal's
 * template called it on the day the note was made, which is not always what
 * the interface is in today — so the caller passes the current name first and
 * the other languages after it.
 */
export function fileInDailyNote(data: string, line: string, headings: readonly string[]): string {
    const lines = data.split('\n');
    for (const heading of headings) {
        const placed = insertUnderHeading(lines, heading, [line]);
        if (placed) return placed.join('\n');
    }
    return appendBlock(data, line);
}

/**
 * The path a note is written at: what was typed, as a Markdown file.
 *
 * `Inbox` and `Inbox.md` are the same note; a wikilink copied out of a note is
 * unwrapped. Empty when nothing usable was typed.
 */
export function capturePath(raw: string): string {
    let path = raw.trim();
    const wiki = path.match(/^\[\[([^\]]+)\]\]$/);
    if (wiki) path = wiki[1].split('|')[0].split('#')[0].trim();
    path = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!path) return '';
    return /\.md$/i.test(path) ? path : `${path}.md`;
}

/** What the card remembers of a line it filed, to show it was. */
export interface CapturedLine {
    text: string;
    /** `HH:mm`, when it was filed. */
    time: string;
}

/** How many filed lines a card keeps in view. */
export const CAPTURED_SHOWN = 4;

/** The newest line first, and no more than the card shows. */
export function withCaptured(
    list: readonly CapturedLine[],
    text: string,
    at: Date
): CapturedLine[] {
    const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    return [{ text: text.replace(/\s*\r?\n\s*/g, ' ').trim(), time }, ...list].slice(
        0,
        CAPTURED_SHOWN
    );
}
