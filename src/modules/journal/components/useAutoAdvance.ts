import { useEffect, useState } from 'react';

/** How long one tracker holds the centre before the dial moves on. */
export const DWELL_MS = 7000;

interface AutoAdvanceOptions {
    /**
     * What is showing now. Changing it restarts the dwell — otherwise steering
     * the dial by hand would be overruled by a timer that was already half
     * spent, and a tracker chosen near the end of a dwell would last a blink.
     */
    key: string;
    /** Nothing to advance through below two. */
    count: number;
    /** The user's motion setting, and the system's. Off means off, not slower. */
    enabled: boolean;
    /** Held while a pointer is on the card or something inside it has focus. */
    paused: boolean;
    onAdvance: () => void;
    dwellMs?: number;
}

/** Whether the window is out of sight. Live, so coming back re-arms the dwell. */
function useWindowHidden(): boolean {
    const [hidden, setHidden] = useState(() =>
        typeof document === 'undefined' ? false : document.hidden
    );
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const onChange = () => setHidden(document.hidden);
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
    }, []);
    return hidden;
}

/**
 * A dial that moves on by itself, and knows when not to.
 *
 * Three things stop it, and each is a different kind of "not now".
 *
 * **The motion setting.** A card that rearranges itself every few seconds is
 * the most animated thing on the board, so it is the first thing that should
 * stop when someone has asked for less of that. Off is off — not a longer
 * dwell.
 *
 * **A reader.** While the pointer is on the card or something in it has focus,
 * the dial holds still. A figure that slides away mid-sentence is the failure
 * of every rotating panel ever built, and hovering is what somebody does at
 * exactly the moment they have decided to read it.
 *
 * **A window nobody is looking at.** A timer firing into a minimised window
 * spends battery to animate nothing. Coming back restarts the dwell rather
 * than advancing on arrival — the tracker you left is the one you come back
 * to, and it gets its full turn.
 */
export function useAutoAdvance({
    key,
    count,
    enabled,
    paused,
    onAdvance,
    dwellMs = DWELL_MS,
}: AutoAdvanceOptions): void {
    const hidden = useWindowHidden();

    useEffect(() => {
        if (!enabled || paused || hidden || count < 2) return;
        const timer = window.setTimeout(onAdvance, dwellMs);
        return () => window.clearTimeout(timer);
        // `key` is not read in the body. It is a dependency so that the tracker
        // changing re-arms the timer, which is the reason the caller passes it.
    }, [key, count, enabled, paused, hidden, onAdvance, dwellMs]);
}
