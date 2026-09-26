import type { FenceInfo } from './fences';

/**
 * How code blocks are drawn right now: the editor module's features and
 * settings, read once and handed to both modes, and to the debug gallery.
 */
export interface CodeBlockOptions {
    lineNumbers: boolean;
    icons: boolean;
    stripe: boolean;
    /** The fold arrow, and the `+` / `-` markers. */
    fold: boolean;
    /** How a block with no marker starts. */
    foldDefault: CodeFoldDefault;
    /** With `long`: folded when it holds more lines than this. */
    foldLines: number;
}

export type CodeFoldDefault = 'open' | 'closed' | 'long';

export const DEFAULT_CODE_OPTIONS: CodeBlockOptions = {
    lineNumbers: true,
    icons: true,
    stripe: true,
    fold: true,
    foldDefault: 'open',
    foldLines: 30,
};

/**
 * Whether a block starts folded to its header: its own marker first, then
 * the setting. Nothing starts folded while folding is switched off.
 */
export function startsFolded(
    options: CodeBlockOptions,
    marker: FenceInfo['fold'],
    lines: number
): boolean {
    if (!options.fold) return false;
    if (marker) return marker === 'closed';
    if (options.foldDefault === 'closed') return true;
    return options.foldDefault === 'long' && lines > Math.max(1, options.foldLines);
}

export function sameOptions(a: CodeBlockOptions, b: CodeBlockOptions): boolean {
    return (Object.keys(a) as Array<keyof CodeBlockOptions>).every((k) => a[k] === b[k]);
}
