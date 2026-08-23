import { describe, it, expect } from 'vitest';
import { isRemoteCover, coverBaseName, extensionFor } from '../src/modules/content/services/coverCache';

describe('isRemoteCover', () => {
    it('only treats http(s) references as cacheable', () => {
        expect(isRemoteCover('https://cdn/x.jpg')).toBe(true);
        expect(isRemoteCover('http://cdn/x.jpg')).toBe(true);
        expect(isRemoteCover('covers/x.jpg')).toBe(false);
        expect(isRemoteCover('data:image/png;base64,AAA')).toBe(false);
        expect(isRemoteCover(undefined)).toBe(false);
    });
});

describe('coverBaseName', () => {
    it('slugifies a title into a safe filename', () => {
        expect(coverBaseName('The Great Gatsby')).toBe('the-great-gatsby');
        expect(coverBaseName('Bleach: Thousand-Year Blood War')).toBe('bleach-thousand-year-blood-war');
    });

    it('keeps Cyrillic, which is legal in vault filenames', () => {
        expect(coverBaseName('Дневные заметки')).toBe('дневные-заметки');
    });

    it('never returns an empty name', () => {
        expect(coverBaseName('***')).toBe('cover');
        expect(coverBaseName('')).toBe('cover');
    });

    it('caps the length so a long title cannot break the path', () => {
        expect(coverBaseName('a'.repeat(200)).length).toBeLessThanOrEqual(60);
    });
});

describe('extensionFor', () => {
    it('prefers the response content type', () => {
        expect(extensionFor('image/png', 'https://cdn/x')).toBe('png');
        expect(extensionFor('image/webp; charset=binary', 'https://cdn/x')).toBe('webp');
    });

    it('falls back to the URL, ignoring the query string', () => {
        expect(extensionFor(undefined, 'https://cdn/poster.PNG?v=2')).toBe('png');
        expect(extensionFor('application/octet-stream', 'https://cdn/a.jpeg')).toBe('jpg');
    });

    it('defaults to jpg when nothing says otherwise', () => {
        expect(extensionFor(undefined, 'https://cdn/image')).toBe('jpg');
    });
});
