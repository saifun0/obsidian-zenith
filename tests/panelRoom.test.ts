import { describe, it, expect } from 'vitest';
import { PANEL_WIDTH_PX, panelFitsBeside } from '../src/modules/dashboard/grid/panelRoom';

/**
 * Whether the arranging panel opens by itself with arrange mode.
 *
 * It does where the pane holds the board, the panel and the rail in one line at
 * the board's own width. The numbers are a desktop pane's: a 32px inset, a 34px
 * rail and a 16px gap, so a gutter of 82px either side of the board.
 */

const GUTTER = 82;
const RAIL = 34;

const fits = (pane: number, board: number) => panelFitsBeside(pane, board, GUTTER, RAIL);

describe('panelFitsBeside', () => {
    it('is the board, the panel and the rail in a line, an inset either side', () => {
        // 32 + 920 + 16 + 320 + 16 + 34 + 32
        const line = 920 + PANEL_WIDTH_PX + 2 * GUTTER - RAIL;
        expect(line).toBe(1370);
        expect(fits(1370, 920)).toBe(true);
        expect(fits(1369, 920)).toBe(false);
    });

    it('says no to the pane that used to squeeze the board into one column', () => {
        // A 920px board of six columns in a 1249px pane: over the old fixed
        // 1240px, so the panel opened and took 336px out of the board.
        expect(fits(1249, 920)).toBe(false);
    });

    it('asks for more pane the wider the board is', () => {
        expect(fits(1700, 920)).toBe(true);
        expect(fits(1700, 1200)).toBe(true);
        expect(fits(1600, 1200)).toBe(false);
    });

    it('never fits a board that fills its pane', () => {
        for (const pane of [800, 1280, 1920, 2560]) {
            expect(fits(pane, pane - 2 * GUTTER)).toBe(false);
        }
    });

    it('does not fit a board that has not been measured yet', () => {
        expect(fits(1920, 0)).toBe(false);
    });
});
