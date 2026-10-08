import { createContext, useContext } from 'react';

/**
 * What a card that follows its content tells the widget inside it.
 *
 * Most widgets need nothing from this: they draw what they have, top-down, and
 * the card measures the result. The exception is a widget that decides *what*
 * to draw from the room it has — the tasks card plans how many tasks fit — and
 * would otherwise be measuring a card that is in turn measuring it. For that
 * widget the room is this number: the most the card's body may be, which is
 * the height the user gave the card and does not move with the content.
 */
export interface CardFit {
    /** The body's ceiling, in px. Zero until the card has been measured once. */
    maxBody: number;
}

export const CardFitContext = createContext<CardFit | null>(null);

/** The card's ceiling, when the card follows its content; null when it does not. */
export function useCardFit(): CardFit | null {
    return useContext(CardFitContext);
}
