import { describe, expect, it } from 'vitest';
import {
    PICKER_LIMIT,
    mediaLabel,
    mediaSource,
    mediaTitle,
    pickerView,
    type VaultImage,
} from '../src/modules/media/mediaService';

/**
 * The banner's picture picker has one line where there were two fields: typed
 * in, it searches; given a link, it shows what is at the link. This is the
 * part of it that decides which of the two a line of text is, and what is
 * shown for it.
 */

const image = (path: string, mtime = 0): VaultImage => ({
    path,
    name: (path.split('/').pop() ?? path).replace(/\.\w+$/, ''),
    mtime,
});

const IMAGES = [
    image('Pictures/Sea at dawn.png'),
    image('Pictures/Night sky.jpg'),
    image('Attachments/Pasted image 2026.png'),
];
const SAVED = ['Pictures/Night sky.jpg', 'https://example.com/art/waves.gif'];

describe("the banner picker's one line", () => {
    it('shows everything when nothing is typed, the saved ones apart', () => {
        const view = pickerView('', SAVED, IMAGES);
        expect(view.link).toBeNull();
        expect(view.saved).toEqual(SAVED);
        // A saved picture is not drawn a second time among the vault's.
        expect(view.vault.map((i) => i.path)).toEqual([
            'Pictures/Sea at dawn.png',
            'Attachments/Pasted image 2026.png',
        ]);
        expect(view.more).toBe(0);
    });

    it('finds by name and by folder, whatever the case', () => {
        expect(pickerView('SEA', [], IMAGES).vault.map((i) => i.name)).toEqual(['Sea at dawn']);
        expect(pickerView('attachments/', [], IMAGES).vault.map((i) => i.name)).toEqual([
            'Pasted image 2026',
        ]);
        // Saved ones are searched too — a link by its file name.
        expect(pickerView('waves', SAVED, IMAGES)).toMatchObject({
            saved: ['https://example.com/art/waves.gif'],
            vault: [],
        });
        expect(pickerView('  night ', SAVED, IMAGES).saved).toEqual(['Pictures/Night sky.jpg']);
    });

    it('takes a link for a link, not for a search', () => {
        for (const link of ['https://example.com/a.gif', 'HTTP://example.com/a.png', 'data:image/png;base64,AAAA']) {
            expect(pickerView(` ${link} `, SAVED, IMAGES)).toEqual({
                link,
                saved: [],
                vault: [],
                more: 0,
            });
        }
        // Something that only looks like the start of one is still a search.
        expect(pickerView('https', SAVED, IMAGES).link).toBeNull();
        expect(pickerView('www.example.com/a.png', SAVED, IMAGES).link).toBeNull();
    });

    it('draws only so many of a large vault, and says how many it left out', () => {
        const many = Array.from({ length: PICKER_LIMIT + 30 }, (_, n) => image(`Shots/${n}.png`));
        const view = pickerView('', [], many);
        expect(view.vault).toHaveLength(PICKER_LIMIT);
        expect(view.more).toBe(30);
        // A search that brings it under the limit leaves nothing out.
        expect(pickerView('Shots/12', [], many)).toMatchObject({ more: 0 });
        expect(pickerView('Shots/12', [], many).vault.map((i) => i.name)).toEqual([
            '12',
            '120',
            '121',
            '122',
            '123',
            '124',
            '125',
            '126',
            '127',
            '128',
            '129',
        ]);
    });
});

describe('what a picture is called', () => {
    it('by its file name, without the extension', () => {
        expect(mediaTitle('Pictures/Night sky.jpg')).toBe('Night sky');
        expect(mediaTitle('https://example.com/art/waves%20at%20sea.gif?size=2')).toBe('waves at sea');
        expect(mediaLabel('Pictures/Night sky.jpg')).toBe('Night sky.jpg');
        // A dot inside a name is not an extension.
        expect(mediaTitle('Shots/v1.2 final')).toBe('v1.2 final');
        expect(mediaTitle('Shots/archive.tar.gz')).toBe('archive.tar');
    });

    it('by nothing, when the address is the picture itself', () => {
        expect(mediaLabel('data:image/png;base64,AAAA')).toBe('');
        expect(mediaTitle('data:image/png;base64,AAAA')).toBe('');
        expect(mediaSource('data:image/png;base64,AAAA')).toBe('');
    });

    it('and where it is from: a host, or a folder', () => {
        expect(mediaSource('https://www.example.com/art/waves.gif')).toBe('example.com');
        expect(mediaSource('Pictures/Sky/Night sky.jpg')).toBe('Pictures/Sky');
        expect(mediaSource('Night sky.jpg')).toBe('');
    });
});
