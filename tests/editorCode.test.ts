import { describe, expect, it } from 'vitest';
import { codeText, findFencedBlocks, lineCount } from '../src/modules/editor/code/fences';
import { languageOfClass, resolveLanguage } from '../src/modules/editor/code/languages';

const lines = (text: string) => text.split('\n');

describe('finding fenced code blocks', () => {
    it('finds a block, its fences and its language', () => {
        const blocks = findFencedBlocks(lines('Intro\n```html\n<p>hi</p>\n```\nAfter'));
        expect(blocks).toEqual([{ open: 1, close: 3, language: 'html' }]);
    });

    it('takes the first word of the info as the language', () => {
        const [block] = findFencedBlocks(lines('```python title:"demo"\nx = 1\n```'));
        expect(block.language).toBe('python');
    });

    it('gives a block with no language an empty one', () => {
        expect(findFencedBlocks(lines('```\nplain\n```'))[0].language).toBe('');
    });

    it('closes only on the same character, at least as long', () => {
        const blocks = findFencedBlocks(lines('````md\n```\ninner\n```\n~~~~\n````'));
        expect(blocks).toEqual([{ open: 0, close: 5, language: 'md' }]);
    });

    it('accepts tilde fences and indented fences', () => {
        const blocks = findFencedBlocks(lines('~~~js\na\n~~~\n  ```css\nb\n  ```'));
        expect(blocks).toEqual([
            { open: 0, close: 2, language: 'js' },
            { open: 3, close: 5, language: 'css' },
        ]);
    });

    it('does not take inline code for a fence', () => {
        expect(findFencedBlocks(lines('```inline``` code\ntext'))).toEqual([]);
    });

    it('does not look for fences in frontmatter', () => {
        const blocks = findFencedBlocks(lines('---\nnote: ```\n---\n```js\nx\n```'));
        expect(blocks).toEqual([{ open: 3, close: 5, language: 'js' }]);
    });

    it('runs a block nobody closed to the end of the note', () => {
        expect(findFencedBlocks(lines('text\n```ts\nlet a\nlet b'))).toEqual([
            { open: 1, close: null, language: 'ts' },
        ]);
    });

    it('is not closed by a fence with words after it', () => {
        // "```js" inside a block is code, not a new block, and a fence with
        // words after it cannot close one.
        const blocks = findFencedBlocks(lines('```md\n```js\n``` not closed\n```'));
        expect(blocks).toEqual([{ open: 0, close: 3, language: 'md' }]);
    });
});

describe('a block’s text', () => {
    it('drops the final line break, as a copy should', () => {
        expect(codeText('a\nb\n')).toBe('a\nb');
        expect(codeText('a\nb')).toBe('a\nb');
    });

    it('counts lines for the gutter', () => {
        expect(lineCount('a\nb\nc\n')).toBe(3);
        expect(lineCount('')).toBe(1);
    });
});

describe('languages', () => {
    it('names a language and gives it a colour and an icon', () => {
        const html = resolveLanguage('html');
        expect(html.name).toBe('HTML');
        expect(html.colour).toMatch(/^#/);
        expect(html.icon).toMatch(/^data:image\/svg\+xml/);
    });

    it('reads the word whatever its case', () => {
        expect(resolveLanguage('HTML').name).toBe('HTML');
        expect(resolveLanguage('Js').name).toBe('JavaScript');
    });

    it('knows the short names people write', () => {
        expect(resolveLanguage('ts').name).toBe('TypeScript');
        expect(resolveLanguage('py').name).toBe('Python');
        expect(resolveLanguage('rs').name).toBe('Rust');
        expect(resolveLanguage('c++').name).toBe('C++');
    });

    it('gives shells an icon even where Code Styler had none', () => {
        expect(resolveLanguage('bash').icon).not.toBeNull();
        expect(resolveLanguage('bash').colour).toBe(resolveLanguage('sh').colour);
        expect(resolveLanguage('zsh').colour).toBe(resolveLanguage('sh').colour);
    });

    it('shows a word it does not know as written, without an icon', () => {
        const own = resolveLanguage('todo');
        expect(own.name).toBe('Todo');
        expect(own.icon).toBeNull();
        expect(own.colour).toBeNull();
    });

    it('treats no language as plain text', () => {
        const none = resolveLanguage('');
        expect(none.name).toBe('');
        expect(none.icon).not.toBeNull();
    });

    it('draws each icon once', () => {
        expect(resolveLanguage('js').icon).toBe(resolveLanguage('javascript').icon);
    });

    it('reads the language off Obsidian’s class', () => {
        expect(languageOfClass('language-html is-loaded')).toBe('html');
        expect(languageOfClass('is-loaded')).toBe('');
    });
});
