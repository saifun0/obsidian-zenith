import { describe, it, expect } from 'vitest';
import { overlap } from '../src/core/mobileInsets';

// A 390 × 844 phone: 47 px of cut-out and status bar, 34 px of gesture bar,
// and Obsidian's navbar 64 px tall above the bottom edge.
const HEIGHT = 844;

describe('what the phone covers', () => {
    it('is nothing for a view Obsidian already keeps clear', () => {
        // Below the view header, above the navbar.
        const box = { top: 91, bottom: HEIGHT - 64 };
        expect(overlap(box, HEIGHT, { top: 47, bottom: 64 })).toEqual({ top: 0, bottom: 0 });
    });

    it('is the covered part of a view that runs under the camera and the buttons', () => {
        // A theme that hides the header, a navbar floating over the pane.
        const box = { top: 0, bottom: HEIGHT };
        expect(overlap(box, HEIGHT, { top: 47, bottom: 64 })).toEqual({ top: 47, bottom: 64 });
    });

    it('counts only what reaches the view', () => {
        // Starts 20 px into the status bar; ends 30 px into the navbar.
        const box = { top: 27, bottom: HEIGHT - 34 };
        expect(overlap(box, HEIGHT, { top: 47, bottom: 64 })).toEqual({ top: 20, bottom: 30 });
    });

    it('rounds to whole pixels', () => {
        expect(overlap({ top: 0.4, bottom: HEIGHT }, HEIGHT, { top: 47.6, bottom: 0 })).toEqual({
            top: 47,
            bottom: 0,
        });
    });
});
