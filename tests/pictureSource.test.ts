import { describe, it, expect } from 'vitest';
import {
    DEFAULT_PICTURE_SETTINGS,
    normalizePictureSettings,
    pictureState,
    type PictureSettings,
} from '../src/modules/picture/pictureSource';

const base: PictureSettings = {
    pictureSource: 'vault',
    pictureUrl: '',
    picturePath: '',
    pictureFit: 'cover',
};

const settings = (over: Partial<PictureSettings>): PictureSettings => ({ ...base, ...over });

/** Stands in for Obsidian's resolver. */
const resolve = (path: string) => `app://local/vault/${path}?1700000000`;

describe('pictureState — nothing chosen', () => {
    it('is empty for a blank vault path', () => {
        expect(pictureState(base, resolve)).toEqual({ kind: 'empty' });
    });

    it('is empty for a blank address', () => {
        expect(pictureState(settings({ pictureSource: 'url' }), resolve)).toEqual({
            kind: 'empty',
        });
    });

    it('treats whitespace as blank rather than as a path', () => {
        expect(pictureState(settings({ picturePath: '   ' }), resolve)).toEqual({ kind: 'empty' });
    });
});

describe('pictureState — an address', () => {
    it('takes an http(s) link', () => {
        const state = pictureState(
            settings({ pictureSource: 'url', pictureUrl: 'https://example.com/cat.gif' }),
            resolve
        );
        expect(state).toEqual({ kind: 'ready', src: 'https://example.com/cat.gif' });
    });

    it('takes an inline image', () => {
        const src = 'data:image/png;base64,iVBORw0KGgo=';
        expect(pictureState(settings({ pictureSource: 'url', pictureUrl: src }), resolve)).toEqual({
            kind: 'ready',
            src,
        });
    });

    it('refuses a script URL rather than rendering it', () => {
        const state = pictureState(
            settings({ pictureSource: 'url', pictureUrl: 'javascript:alert(1)' }),
            resolve
        );
        expect(state).toEqual({ kind: 'unusable' });
    });

    it('refuses an inline document dressed as a picture', () => {
        const state = pictureState(
            settings({ pictureSource: 'url', pictureUrl: 'data:text/html,<script>x</script>' }),
            resolve
        );
        expect(state).toEqual({ kind: 'unusable' });
    });

    // A link is only ever typed with a stray space at one end or the other.
    it('trims before deciding', () => {
        const state = pictureState(
            settings({ pictureSource: 'url', pictureUrl: '  https://example.com/a.png  ' }),
            resolve
        );
        expect(state).toEqual({ kind: 'ready', src: 'https://example.com/a.png' });
    });
});

describe('pictureState — the vault', () => {
    it('resolves a picture in the vault', () => {
        const state = pictureState(settings({ picturePath: 'Attachments/cat.gif' }), resolve);
        expect(state).toEqual({
            kind: 'ready',
            src: 'app://local/vault/Attachments/cat.gif?1700000000',
        });
    });

    // Obsidian hands back a resource path for anything, a note included, and an
    // `<img>` pointed at one draws nothing — which looks exactly like the
    // setting having been ignored.
    it('refuses a path that is not a picture', () => {
        expect(pictureState(settings({ picturePath: 'Notes/today.md' }), resolve)).toEqual({
            kind: 'unusable',
        });
    });

    it('keeps the percent-encoding Obsidian puts in a resource path', () => {
        const state = pictureState(settings({ picturePath: 'My Files/a b.png' }), resolve);
        expect(state).toEqual({
            kind: 'ready',
            src: 'app://local/vault/My Files/a b.png?1700000000',
        });
    });

    it('is unusable when the resolver gives back nothing renderable', () => {
        expect(pictureState(settings({ picturePath: 'a.png' }), () => '')).toEqual({
            kind: 'unusable',
        });
    });

    // A mobile vault resolves to `capacitor://`, not `app://`.
    it('accepts the scheme a phone resolves to', () => {
        const state = pictureState(
            settings({ picturePath: 'a.png' }),
            (p) => `capacitor://localhost/_capacitor_file_/${p}`
        );
        expect(state).toEqual({
            kind: 'ready',
            src: 'capacitor://localhost/_capacitor_file_/a.png',
        });
    });
});

describe('normalizePictureSettings', () => {
    it('gives an unconfigured card the defaults', () => {
        expect(normalizePictureSettings(undefined)).toEqual(DEFAULT_PICTURE_SETTINGS);
        expect(normalizePictureSettings({})).toEqual(DEFAULT_PICTURE_SETTINGS);
    });

    it('keeps a bucket that is already right', () => {
        const stored = {
            pictureSource: 'url',
            pictureUrl: 'https://example.test/cat.gif',
            picturePath: 'Attachments/old.png',
            pictureFit: 'contain',
        };
        expect(normalizePictureSettings(stored)).toEqual(stored);
    });

    // Hand-edited `data.json`, or a bucket written by a version that offered a
    // choice this one no longer does. A card that falls back to its default is
    // one the panel on its own back can fix; a card that throws takes the whole
    // board's render with it.
    it('falls back rather than trusting a stored choice', () => {
        const config = normalizePictureSettings({
            pictureSource: 'ftp',
            pictureFit: 'tile',
        });
        expect(config.pictureSource).toBe(DEFAULT_PICTURE_SETTINGS.pictureSource);
        expect(config.pictureFit).toBe(DEFAULT_PICTURE_SETTINGS.pictureFit);
    });

    it('refuses a path or an address that is not a string', () => {
        const config = normalizePictureSettings({ pictureUrl: 42, picturePath: null });
        expect(config.pictureUrl).toBe('');
        expect(config.picturePath).toBe('');
    });

    it('drops anything it does not know about', () => {
        const config = normalizePictureSettings({ pictureCaption: 'hello' });
        expect(config).toEqual(DEFAULT_PICTURE_SETTINGS);
    });
});
