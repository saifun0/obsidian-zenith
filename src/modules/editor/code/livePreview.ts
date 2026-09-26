import { editorLivePreviewField, MarkdownPreviewRenderer } from 'obsidian';
import {
    RangeSet,
    StateEffect,
    StateField,
    type EditorState,
    type Extension,
    type Range,
} from '@codemirror/state';
import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    type DecorationSet,
    type ViewUpdate,
} from '@codemirror/view';
import { buildCodeHeader } from './codeHeader';
import { findFencedBlocks } from './fences';
import { resolveLanguage, type CodeLanguage } from './languages';
import { startsFolded, type CodeBlockOptions } from './options';
import { applyLanguage } from './readingView';

/**
 * Code blocks while writing, in Live Preview.
 *
 * Obsidian already draws these: every line of a block carries its
 * `HyperMD-codeblock` classes, and while the block is not being edited it
 * hides both fences' text and pins a small language label to the top line.
 * Nothing of that is replaced here — Code Styler's trouble came from fighting
 * it. This only adds:
 *
 *   · a header above the opening fence, as a block widget;
 *   · a class on every line of the block, for the stripe, and a number on each
 *     line of code;
 *   · while the block is not being edited, a class that folds its two fence
 *     lines away — Obsidian has already emptied them, and the header stands in
 *     for the top one.
 *
 * "Being edited" is Obsidian's own test, repeated in `foldFences`: the editor
 * has focus and the selection touches the block, fences included. Were the two
 * to disagree, a fence line Obsidian shows for editing could be folded under
 * the cursor. Blocks another plugin renders (`dataview`, `mermaid`, …) are left
 * alone: while not edited they are its widget, not lines.
 *
 * A block folded to its header is replaced by the header whole, fences and
 * all, and the cursor steps over it (`atomicRanges`) rather than typing into
 * lines nobody can see. Which blocks are folded is kept here, per editor:
 * starting from each block's marker and the setting, flipped by the arrow, and
 * carried through edits by position. A selection that lands inside a folded
 * block — a search result, a link to a line — opens it.
 *
 * Only in Live Preview. Source mode is the note as text, and stays that way.
 */

interface LiveBlock {
    /** CodeMirror line numbers (from 1) of the fences; `close` null when unclosed. */
    open: number;
    close: number | null;
    /** From the opening fence's start to the closing fence's end, or the note's. */
    from: number;
    to: number;
    language: CodeLanguage;
    title: string;
    folded: boolean;
}

interface LiveState {
    live: boolean;
    blocks: LiveBlock[];
    decorations: DecorationSet;
    /** The folded blocks' ranges, for the cursor to step over. */
    folds: DecorationSet;
    /** Where a block starts whose fold the arrow flipped from how it would start. */
    flipped: readonly number[];
}

/** Flip the fold of the block starting at this position. */
const toggleFold = StateEffect.define<number>();

export function codeBlockExtension(options: CodeBlockOptions): Extension {
    const field: StateField<LiveState> = StateField.define<LiveState>({
        create: (state) => build(state, options, []),
        update(value, tr) {
            let flipped = value.flipped;
            if (tr.docChanged) flipped = flipped.map((pos) => tr.changes.mapPos(pos));
            for (const effect of tr.effects) {
                if (effect.is(toggleFold)) flipped = flip(flipped, effect.value);
            }
            if (tr.selection && !tr.docChanged) {
                const heads = tr.state.selection.ranges.map((r) => r.head);
                for (const block of value.blocks) {
                    if (block.folded && heads.some((h) => h > block.from && h < block.to)) {
                        flipped = flip(flipped, block.from);
                    }
                }
            }
            if (tr.docChanged || flipped !== value.flipped || isLive(tr.state) !== value.live) {
                return build(tr.state, options, flipped);
            }
            return value;
        },
        provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
    });

    const blocksOf = (state: EditorState): LiveBlock[] => state.field(field, false)?.blocks ?? [];

    const fences = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            constructor(view: EditorView) {
                this.decorations = foldFences(view, blocksOf(view.state));
            }
            update(update: ViewUpdate) {
                if (
                    update.docChanged ||
                    update.selectionSet ||
                    update.focusChanged ||
                    blocksOf(update.startState) !== blocksOf(update.state)
                ) {
                    this.decorations = foldFences(update.view, blocksOf(update.state));
                }
            }
        },
        { decorations: (plugin) => plugin.decorations }
    );

    const atomic = EditorView.atomicRanges.of(
        (view) => view.state.field(field, false)?.folds ?? RangeSet.empty
    );

    return [field, fences, atomic];
}

function flip(list: readonly number[], pos: number): readonly number[] {
    return list.includes(pos) ? list.filter((p) => p !== pos) : [...list, pos];
}

// ── Building ─────────────────────────────────────────

const NO_BLOCKS: LiveState = {
    live: false,
    blocks: [],
    decorations: Decoration.none,
    folds: Decoration.none,
    flipped: [],
};

function build(
    state: EditorState,
    options: CodeBlockOptions,
    flipped: readonly number[]
): LiveState {
    if (!isLive(state)) return { ...NO_BLOCKS, flipped };
    const doc = state.doc;

    const blocks: LiveBlock[] = [];
    for (const found of findFencedBlocks(doc.iterLines())) {
        if (rendersItself(found.language)) continue;
        const open = found.open + 1;
        const close = found.close === null ? null : found.close + 1;
        const from = doc.line(open).from;
        const code = (close ?? doc.lines + 1) - open - 1;
        blocks.push({
            open,
            close,
            from,
            to: doc.line(close ?? doc.lines).to,
            language: resolveLanguage(found.language),
            title: found.title,
            // A block nobody closed runs to the end of the note: folding it
            // would hide everything after it too.
            folded:
                close !== null &&
                startsFolded(options, found.fold, code) !== flipped.includes(from),
        });
    }

    // The fences take the numbered lines' indent too, so an edited fence
    // lines up with the code under it.
    const base = options.lineNumbers ? 'zenith-code has-numbers' : 'zenith-code';
    const ranges: Range<Decoration>[] = [];
    const folds: Range<Decoration>[] = [];
    for (const block of blocks) {
        if (block.folded) {
            const fold = Decoration.replace({
                widget: new HeaderWidget(block, options, true),
                block: true,
            }).range(block.from, block.to);
            ranges.push(fold);
            folds.push(fold);
            continue;
        }

        // The first line after the code: the closing fence, or past the end.
        const after = block.close ?? doc.lines + 1;
        const digits = String(Math.max(1, after - block.open - 1)).length;
        const style = lineStyle(block.language, options, digits);
        const cls = options.stripe ? base : `${base} no-stripe`;

        ranges.push(
            Decoration.widget({
                widget: new HeaderWidget(block, options, false),
                block: true,
                side: -1,
            }).range(block.from)
        );
        ranges.push(
            Decoration.line({ class: `${cls} zenith-code-open`, attributes: { style } }).range(
                block.from
            )
        );
        for (let n = block.open + 1; n < after; n++) {
            ranges.push(
                Decoration.line({
                    class: `${cls} zenith-code-line`,
                    attributes: options.lineNumbers
                        ? { style, 'data-zenith-ln': String(n - block.open) }
                        : { style },
                }).range(doc.line(n).from)
            );
        }
        if (block.close !== null) {
            ranges.push(
                Decoration.line({ class: `${cls} zenith-code-close`, attributes: { style } }).range(
                    doc.line(block.close).from
                )
            );
        }
    }

    return {
        live: true,
        blocks,
        decorations: Decoration.set(ranges, true),
        folds: Decoration.set(folds, true),
        // Only positions that still start a block: the rest were deleted.
        flipped: flipped.filter((pos) => blocks.some((b) => b.from === pos)),
    };
}

function lineStyle(language: CodeLanguage, options: CodeBlockOptions, digits: number): string {
    const accent =
        options.stripe && language.colour ? `--zenith-code-accent: ${language.colour}; ` : '';
    return `${accent}--zenith-code-digits: ${digits};`;
}

/**
 * The fences of every open block not being edited, folded.
 *
 * A block that never closes keeps its fence: Obsidian does not hide the text
 * of one, and folding it would hide text.
 */
function foldFences(view: EditorView, blocks: LiveBlock[]): DecorationSet {
    const ranges = view.hasFocus ? view.state.selection.ranges : [];
    const folded = Decoration.line({ class: 'zenith-code-folded' });
    const out: Range<Decoration>[] = [];
    for (const block of blocks) {
        if (block.close === null || block.folded) continue;
        if (ranges.some((r) => r.from <= block.to && r.to >= block.from)) continue;
        out.push(folded.range(block.from));
        out.push(folded.range(view.state.doc.line(block.close).from));
    }
    return Decoration.set(out, true);
}

// ── The header ───────────────────────────────────────

class HeaderWidget extends WidgetType {
    readonly language: CodeLanguage;
    readonly title: string;

    constructor(
        block: LiveBlock,
        readonly options: CodeBlockOptions,
        readonly folded: boolean
    ) {
        super();
        this.language = block.language;
        this.title = block.title;
    }

    eq(other: HeaderWidget): boolean {
        return (
            other.language.id === this.language.id &&
            other.language.name === this.language.name &&
            other.title === this.title &&
            other.folded === this.folded &&
            other.options === this.options
        );
    }

    toDOM(view: EditorView): HTMLElement {
        // Everything is read when it is pressed, not now: the widget outlives
        // edits to the block, and what it was made with goes stale.
        const header = buildCodeHeader(this.language, {
            title: this.title,
            icons: this.options.icons,
            textOf: () => blockText(view, header),
            fold: this.options.fold
                ? { folded: this.folded, toggle: () => toggleAt(view, header) }
                : undefined,
        });
        header.addClass('is-live');
        applyLanguage(header, this.language, this.options);

        // The rest of the header folds, as in reading view. Without folding,
        // it puts the cursor at the end of the fence, where the language and
        // the title are — not at the start, where a keystroke would break it.
        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) {
                return;
            }
            e.preventDefault();
            if (this.options.fold) {
                toggleAt(view, header);
                return;
            }
            const line = view.state.doc.lineAt(view.posAtDOM(header));
            view.dispatch({ selection: { anchor: line.to } });
            view.focus();
        });
        return header;
    }

    /** The header handles its own clicks; see `toDOM`. */
    ignoreEvent(): boolean {
        return true;
    }

    get estimatedHeight(): number {
        return 34;
    }
}

function toggleAt(view: EditorView, header: HTMLElement): void {
    const from = view.state.doc.lineAt(view.posAtDOM(header)).from;
    view.dispatch({ effects: toggleFold.of(from) });
}

/** The code under a header: the lines between its fences, as they are now. */
function blockText(view: EditorView, header: HTMLElement): string {
    const doc = view.state.doc;
    const open = doc.lineAt(view.posAtDOM(header)).number;
    const found = findFencedBlocks(doc.iterLines()).find((b) => b.open + 1 === open);
    if (!found) return '';
    // `close` counts from 0, so as a line number from 1 it is the last line of
    // code; a block nobody closed runs to the end.
    const first = open + 1;
    const last = found.close ?? doc.lines;
    if (first > last) return '';
    return doc.sliceString(doc.line(first).from, doc.line(last).to);
}

// ── Asking Obsidian ──────────────────────────────────

function isLive(state: EditorState): boolean {
    return state.field(editorLivePreviewField, false) ?? false;
}

/**
 * Whether Obsidian draws this language itself, as its own rendered widget.
 *
 * The same three cases Obsidian checks: Mermaid, search queries, and any
 * language a plugin registered a code-block processor for. That registry is
 * not in the published typings, so it is read with care and an empty answer
 * when it is not there.
 */
function rendersItself(language: string): boolean {
    if (language === 'mermaid' || language === 'query') return true;
    const registry = (MarkdownPreviewRenderer as unknown as { codeBlockPostProcessors?: unknown })
        .codeBlockPostProcessors;
    return (
        typeof registry === 'object' &&
        registry !== null &&
        Object.prototype.hasOwnProperty.call(registry, language)
    );
}
