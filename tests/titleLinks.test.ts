import { describe, expect, it } from 'vitest';
import { plainTitle, titleParts } from '../src/modules/tasks/services/titleLinks';

describe('links in a task title', () => {
    it('reads a wiki link as the note, or its alias', () => {
        expect(titleParts('Read [[Dune]] again')).toEqual([
            { kind: 'text', text: 'Read ' },
            { kind: 'note', text: 'Dune', target: 'Dune' },
            { kind: 'text', text: ' again' },
        ]);
        expect(titleParts('[[Books/Dune|the book]]')).toEqual([
            { kind: 'note', text: 'the book', target: 'Books/Dune' },
        ]);
    });

    it('names a heading it points into, and leaves a block id out', () => {
        expect(plainTitle('See [[Plan#Week 2]]')).toBe('See Plan › Week 2');
        expect(plainTitle('See [[Plan#^a1b2]]')).toBe('See Plan');
    });

    it('reads a Markdown link to a page or to a note', () => {
        expect(titleParts('Pay [the bill](https://bank.example/pay)')).toEqual([
            { kind: 'text', text: 'Pay ' },
            { kind: 'url', text: 'the bill', href: 'https://bank.example/pay' },
        ]);
        expect(titleParts('[plan](Projects/My%20Plan.md)')).toEqual([
            { kind: 'note', text: 'plan', target: 'Projects/My Plan' },
        ]);
    });

    it('takes an embed as a link, and leaves plain words as they are', () => {
        expect(plainTitle('![[Scan.pdf]] to sign')).toBe('Scan.pdf to sign');
        expect(titleParts('Buy milk')).toEqual([{ kind: 'text', text: 'Buy milk' }]);
        expect(plainTitle('Brackets [like this] stay')).toBe('Brackets [like this] stay');
    });
});
