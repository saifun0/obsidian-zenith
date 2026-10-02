// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState, StateField, type Extension } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';

/**
 * Code blocks in Live Preview, kept up to date without rescanning the note.
 *
 * Every keystroke used to scan every line for fences and rebuild every
 * decoration. Typing inside an ordinary line cannot make or break a block,
 * so that edit now carries what was built along instead. The two things that
 * matter: it comes out exactly as a rebuild would, and it does not rescan.
 */

const scans = vi.hoisted(() => ({ count: 0 }));

vi.mock('obsidian', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('./mocks/obsidian');
    const { StateField: Field } = await import('@codemirror/state');
    return {
        ...actual,
        editorLivePreviewField: Field.define<boolean>({ create: () => true, update: (v) => v }),
        MarkdownPreviewRenderer: {},
    };
});

vi.mock('../src/modules/editor/code/fences', async () => {
    const actual = await vi.importActual<typeof import('../src/modules/editor/code/fences')>(
        '../src/modules/editor/code/fences'
    );
    return {
        ...actual,
        findFencedBlocks: (lines: Iterable<string>) => {
            scans.count++;
            return actual.findFencedBlocks(lines);
        },
    };
});

const { editorLivePreviewField } = (await import('obsidian')) as unknown as {
    editorLivePreviewField: StateField<boolean>;
};
const { codeBlockExtension, editsStayWithinLines } = await import(
    '../src/modules/editor/code/livePreview'
);
const { DEFAULT_CODE_OPTIONS } = await import('../src/modules/editor/code/options');

const NOTE = [
    '# A note',
    '',
    'Some prose.',
    '```ts',
    'const a = 1;',
    'const b = 2;',
    '```',
    '',
    'More prose.',
    '~~~python',
    'print("hi")',
    '~~~',
    'The end.',
].join('\n');

function extensions(): Extension[] {
    return [editorLivePreviewField, codeBlockExtension(DEFAULT_CODE_OPTIONS)];
}

function stateOf(doc: string): EditorState {
    return EditorState.create({ doc, extensions: extensions() });
}

/** The field's decorations, as plain data that two states can be compared by. */
function decorations(state: EditorState): unknown[] {
    const out: unknown[] = [];
    for (const source of state.facet(EditorView.decorations)) {
        if (typeof source === 'function') continue;
        (source as DecorationSet).between(0, state.doc.length, (from, to, deco) => {
            const spec = deco.spec as { class?: string; attributes?: unknown; block?: boolean };
            out.push({ from, to, cls: spec.class, attrs: spec.attributes, block: !!spec.block });
        });
    }
    return out;
}

const posOf = (doc: string, needle: string) => doc.indexOf(needle);

describe('typing inside a line', () => {
    beforeEach(() => {
        scans.count = 0;
    });

    it('comes out exactly as a rebuild would, without rescanning the note', () => {
        const start = stateOf(NOTE);
        scans.count = 0;

        // Inside a code line, inside prose, and in two places at once. Each
        // position is found in the note as it stands after the edit before.
        const at = (state: EditorState, needle: string) => posOf(state.doc.toString(), needle);
        let state = start;
        state = state.update({ changes: { from: at(state, '1;'), insert: '00' } }).state;
        state = state.update({ changes: { from: at(state, 'More'), insert: 'Much ' } }).state;
        state = state.update({
            changes: [
                { from: at(state, 'print'), insert: '  ' },
                { from: at(state, 'The end'), to: at(state, 'The end') + 3 },
            ],
        }).state;

        expect(scans.count).toBe(0);
        expect(decorations(state)).toEqual(decorations(stateOf(state.doc.toString())));
    });

    it('rescans when a line becomes a fence', () => {
        const start = stateOf(NOTE);
        scans.count = 0;
        const at = posOf(NOTE, 'Some prose.');
        const next = start.update({ changes: { from: at, to: at + 'Some prose.'.length, insert: '```' } }).state;

        expect(scans.count).toBe(1);
        expect(decorations(next)).toEqual(decorations(stateOf(next.doc.toString())));
    });

    it('rescans when a line is added or a fence edited', () => {
        const start = stateOf(NOTE);
        const tr1 = start.update({ changes: { from: posOf(NOTE, 'const b'), insert: 'x\n' } });
        const tr2 = start.update({ changes: { from: posOf(NOTE, '```ts') + 5, insert: ' title' } });
        const tr3 = start.update({ changes: { from: 0, insert: '-' } });

        expect(editsStayWithinLines(tr1)).toBe(false);
        expect(editsStayWithinLines(tr2)).toBe(false);
        // The first line could be opening frontmatter.
        expect(editsStayWithinLines(tr3)).toBe(false);
        expect(decorations(tr1.state)).toEqual(decorations(stateOf(tr1.state.doc.toString())));
    });

    it('carries a block folded to its header along too', () => {
        const folded = ['# Title', 'Before', '```js - Folded', 'let a;', 'let b;', '```', 'After'].join('\n');
        const start = stateOf(folded);
        scans.count = 0;
        const next = start
            .update({ changes: { from: posOf(folded, 'Before'), insert: 'Text ' } })
            .state.update({ changes: { from: folded.length + 5, insert: ' all' } }).state;

        expect(scans.count).toBe(0);
        expect(decorations(next)).toEqual(decorations(stateOf(next.doc.toString())));
        expect(decorations(next).some((d) => (d as { block: boolean }).block)).toBe(true);
    });

    it('keeps an unclosed block running to the end of the note', () => {
        const open = 'Prose\n```js\nlet x';
        const start = stateOf(open);
        const next = start.update({ changes: { from: open.length, insert: ' = 1' } }).state;
        expect(decorations(next)).toEqual(decorations(stateOf(next.doc.toString())));
    });
});
