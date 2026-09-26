import { editorLivePreviewField, MarkdownPreviewRenderer } from 'obsidian';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
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
import { applyLanguage, type CodeBlockOptions } from './readingView';

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
 * "Being edited" is Obsidian's own test, repeated in `FenceFolding`: the editor
 * has focus and the selection touches the block, fences included. Were the two
 * to disagree, a fence line Obsidian shows for editing could be folded under
 * the cursor. Blocks another plugin renders (`dataview`, `mermaid`, …) are left
 * alone: while not edited they are its widget, not lines.
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
}

interface LiveState {
    live: boolean;
    blocks: LiveBlock[];
    decorations: DecorationSet;
}

export function codeBlockExtension(options: CodeBlockOptions): Extension {
    const field: StateField<LiveState> = StateField.define<LiveState>({
        create: (state) => build(state, options),
        update(value, tr) {
            if (tr.docChanged || isLive(tr.state) !== value.live) return build(tr.state, options);
            return value;
        },
        provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
    });

    const blocksOf = (state: EditorState): LiveBlock[] => state.field(field, false)?.blocks ?? [];

    const folding = ViewPlugin.fromClass(
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

    return [field, folding];
}

// ── Building ─────────────────────────────────────────

const NO_BLOCKS: LiveState = { live: false, blocks: [], decorations: Decoration.none };

function build(state: EditorState, options: CodeBlockOptions): LiveState {
    if (!isLive(state)) return NO_BLOCKS;
    const doc = state.doc;

    const blocks: LiveBlock[] = [];
    for (const found of findFencedBlocks(doc.iterLines())) {
        if (rendersItself(found.language)) continue;
        const open = found.open + 1;
        const close = found.close === null ? null : found.close + 1;
        blocks.push({
            open,
            close,
            from: doc.line(open).from,
            to: doc.line(close ?? doc.lines).to,
            language: resolveLanguage(found.language),
        });
    }

    // The fences take the numbered lines' indent too, so an edited fence
    // lines up with the code under it.
    const base = options.lineNumbers ? 'zenith-code has-numbers' : 'zenith-code';
    const ranges: Range<Decoration>[] = [];
    for (const block of blocks) {
        // The first line after the code: the closing fence, or past the end.
        const after = block.close ?? doc.lines + 1;
        const digits = String(Math.max(1, after - block.open - 1)).length;
        const style = lineStyle(block.language, digits);

        ranges.push(
            Decoration.widget({
                widget: new HeaderWidget(block.language),
                block: true,
                side: -1,
            }).range(block.from)
        );
        ranges.push(
            Decoration.line({
                class: `${base} zenith-code-open`,
                attributes: { style },
            }).range(block.from)
        );
        for (let n = block.open + 1; n < after; n++) {
            ranges.push(
                Decoration.line({
                    class: `${base} zenith-code-line`,
                    attributes: options.lineNumbers
                        ? { style, 'data-zenith-ln': String(n - block.open) }
                        : { style },
                }).range(doc.line(n).from)
            );
        }
        if (block.close !== null) {
            ranges.push(
                Decoration.line({
                    class: `${base} zenith-code-close`,
                    attributes: { style },
                }).range(doc.line(block.close).from)
            );
        }
    }

    return { live: true, blocks, decorations: Decoration.set(ranges, true) };
}

function lineStyle(language: CodeLanguage, digits: number): string {
    const accent = language.colour ? `--zenith-code-accent: ${language.colour}; ` : '';
    return `${accent}--zenith-code-digits: ${digits};`;
}

/**
 * The fences of every block not being edited, folded.
 *
 * A block that never closes keeps its fence: Obsidian does not hide the text
 * of one, and folding it would hide text.
 */
function foldFences(view: EditorView, blocks: LiveBlock[]): DecorationSet {
    const ranges = view.hasFocus ? view.state.selection.ranges : [];
    const folded = Decoration.line({ class: 'zenith-code-folded' });
    const out: Range<Decoration>[] = [];
    for (const block of blocks) {
        if (block.close === null) continue;
        if (ranges.some((r) => r.from <= block.to && r.to >= block.from)) continue;
        out.push(folded.range(block.from));
        out.push(folded.range(view.state.doc.line(block.close).from));
    }
    return Decoration.set(out, true);
}

// ── The header ───────────────────────────────────────

class HeaderWidget extends WidgetType {
    constructor(readonly language: CodeLanguage) {
        super();
    }

    eq(other: HeaderWidget): boolean {
        return other.language.id === this.language.id && other.language.name === this.language.name;
    }

    toDOM(view: EditorView): HTMLElement {
        // The code is read when the button is pressed, not now: the widget
        // outlives edits to the block, and the text it was made with goes stale.
        const header = buildCodeHeader(this.language, () => blockText(view, header));
        header.addClass('is-live');
        applyLanguage(header, this.language);
        return header;
    }

    /** The copy button is the widget's own; a click anywhere else opens the block for editing. */
    ignoreEvent(event: Event): boolean {
        return event.target instanceof Element && !!event.target.closest('.zenith-code__copy');
    }

    get estimatedHeight(): number {
        return 34;
    }
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
