import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The room a widget has been given, as the card measured it.
 *
 * A widget used to be told a word — `sm`, `md`, `lg` — and to draw one of
 * three pictures. The word is a preset, though, not a size: a card's width and
 * height can be set apart from it, a board has anywhere from two columns to
 * six, and on a phone every preset is the same 343 pixels wide. So `md` meant
 * 1200 pixels on one board, 608 on another and a phone's column on a third,
 * and a widget that drew "the wide picture" for it drew it into all three.
 * That is where the half-empty cards came from.
 *
 * The room is the truth instead: how wide the card's body is, and how tall it
 * may be. A widget lays itself out from that — in CSS through the card's
 * container (`@container zenith-card`), and here for the decisions CSS cannot
 * make, like how many rows of a list fit.
 */
export interface CardRoom {
    /** The body's inner width, in px. Zero until the card has been measured once. */
    width: number;
    /**
     * The most the content may be tall, in px. On a card held at its height
     * this is the height; on one that follows its content it is the ceiling,
     * which does not move with what is drawn.
     */
    height: number;
    /** The card follows its content, so `height` is a limit rather than a size. */
    fit: boolean;
}

const UNMEASURED: CardRoom = { width: 0, height: 0, fit: false };

export const CardRoomContext = createContext<CardRoom>(UNMEASURED);

/** The room the card has given this widget. Zeros before the first measure, and off a card. */
export function useCardRoom(): CardRoom {
    return useContext(CardRoomContext);
}

/**
 * The widths a card's composition changes at, in px of body width.
 *
 * Stated once because the stylesheet has to agree with them: a container query
 * cannot read a variable, so `widget-kit.css` repeats these three numbers and
 * says so.
 *
 * - under MEDIUM: one column. A phone, a third of a six-column board.
 * - MEDIUM up: room for two things side by side — a figure and its rows.
 * - WIDE up: two panes, or a list in columns. Half a default board.
 * - GRAND up: the whole board's width.
 */
export const ROOM_MEDIUM = 380;
export const ROOM_WIDE = 560;
export const ROOM_GRAND = 820;

export type RoomSpan = 'narrow' | 'medium' | 'wide' | 'grand';

/** Which of the four compositions a body of this width gets. */
export function roomSpan(width: number): RoomSpan {
    if (width >= ROOM_GRAND) return 'grand';
    if (width >= ROOM_WIDE) return 'wide';
    if (width >= ROOM_MEDIUM) return 'medium';
    return 'narrow';
}

/**
 * The height of a list row (`--zenith-w-row` in widget-kit.css): thirty pixels
 * under a pointer, thirty-six under a finger.
 */
export function rowPx(): number {
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
        ? 36
        : 30;
}

/** How many columns a list in `zenith-wlist--columns` runs in at this width. */
export function listColumns(width: number): number {
    const span = roomSpan(width);
    return span === 'grand' ? 3 : span === 'wide' ? 2 : 1;
}

/**
 * How many rows of `rowPx` fit in `room` px, with `reserved` px spoken for.
 *
 * Never fewer than `min`: a list that shows nothing because the card is short
 * is worse than one that runs a line over.
 */
export function rowsThatFit(room: number, rowPx: number, reserved = 0, min = 1): number {
    if (room <= 0 || rowPx <= 0) return min;
    return Math.max(min, Math.floor((room - reserved) / rowPx));
}

/**
 * The inner box of a card's body: what is left of it inside its padding.
 *
 * Read before the first paint, so a widget that plans from its room plans once
 * rather than drawing a guess and correcting it.
 */
export function useBodyBox(ref: RefObject<HTMLElement>, deps: readonly unknown[] = []): {
    width: number;
    height: number;
} {
    const [box, setBox] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const read = () => {
            const cs = getComputedStyle(el);
            const px = (v: string) => parseFloat(v) || 0;
            const width = Math.max(0, el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight));
            const height = Math.max(0, el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom));
            setBox((prev) =>
                Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
                    ? prev
                    : { width, height }
            );
        };
        read();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller says what remounts the body.
    }, deps);
    return box;
}

/**
 * What a card that follows its content tells the widget inside it.
 *
 * Kept for the widget that asked first: the tasks card plans how many tasks
 * fit, and would otherwise be measuring a card that is in turn measuring it.
 * It is the room's height under its older name, and only on a card that fits.
 */
export interface CardFit {
    /** The body's ceiling, in px. Zero until the card has been measured once. */
    maxBody: number;
}

/** The card's ceiling, when the card follows its content; null when it does not. */
export function useCardFit(): CardFit | null {
    const room = useCardRoom();
    return room.fit ? { maxBody: room.height } : null;
}
