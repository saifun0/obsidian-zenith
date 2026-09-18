import { describe, it, expect } from 'vitest';
import {
    isCopyId,
    newCopyId,
    widgetIdOf,
} from '../src/modules/dashboard/grid/widgetInstances';

describe('widgetIdOf', () => {
    it('leaves a plain widget id alone', () => {
        expect(widgetIdOf('picture.frame')).toBe('picture.frame');
    });

    it('strips the copy number', () => {
        expect(widgetIdOf('picture.frame#2')).toBe('picture.frame');
        expect(widgetIdOf('picture.frame#17')).toBe('picture.frame');
    });

    // A bundle is the other kind of layout id that names no registered widget.
    // It must survive this unchanged, or every bundle stops resolving.
    it('leaves a bundle id alone', () => {
        expect(widgetIdOf('bundle:3')).toBe('bundle:3');
    });
});

describe('isCopyId', () => {
    it('tells the first copy from the rest', () => {
        expect(isCopyId('picture.frame')).toBe(false);
        expect(isCopyId('picture.frame#2')).toBe(true);
        expect(isCopyId('bundle:1')).toBe(false);
    });
});

describe('newCopyId', () => {
    // The first copy is the bare id, which every board saved before copies
    // existed already refers to — so a new one can never be #1.
    it('starts at two', () => {
        expect(newCopyId('picture.frame', ['picture.frame'])).toBe('picture.frame#2');
    });

    it('skips the numbers already in use', () => {
        const used = ['picture.frame', 'picture.frame#2', 'picture.frame#3'];
        expect(newCopyId('picture.frame', used)).toBe('picture.frame#4');
    });

    it('fills a gap left by a copy that was removed', () => {
        const used = ['picture.frame', 'picture.frame#3'];
        expect(newCopyId('picture.frame', used)).toBe('picture.frame#2');
    });

    it('counts only its own widget', () => {
        const used = ['picture.frame', 'clock.time#2'];
        expect(newCopyId('picture.frame', used)).toBe('picture.frame#2');
    });
});
