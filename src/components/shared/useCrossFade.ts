import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Cross-fading between the members of a set, one at a time.
 *
 * Written for a bundle's widgets and shared because the journal's dial wants
 * exactly the same thing: a set of things, one of them showing, and a swap
 * that reads as a swap. Nothing in here knows what a member is — it is a
 * string, and the caller renders one layer per id.
 *
 * Driven by the Web Animations API rather than CSS classes, for one reason: a
 * class-based transition can't be *interrupted* cleanly. Tap the rail twice
 * quickly — or let a dial advance on its own while someone is steering it —
 * and the second transition has to start from wherever the first one got to,
 * not snap to zero first. WAAPI gives us the running animations to cancel and
 * the computed values to resume from; CSS gives us neither.
 *
 * Timings come from the design's motion table:
 *   outgoing  translateX 0 → ∓10px, opacity → 0   150ms  in
 *   incoming  translateX ±10 → 0,   opacity 0 → 1 200ms  out, delay 60
 */

const EASE = {
    in: 'cubic-bezier(.4,0,1,1)',
    out: 'cubic-bezier(0,0,.2,1)',
    std: 'cubic-bezier(.4,0,.2,1)',
    spring: 'cubic-bezier(.34,1.28,.64,1)',
} as const;

const OUT_MS = 150;
const IN_MS = 200;
const IN_DELAY = 60;
/** How far a layer slides. Small on purpose — this is a swap, not a journey. */
const SHIFT_PX = 10;
/** A resumed transition shorter than this doesn't read as motion at all. */
const MIN_REMAINING_MS = 120;
/** Reduced motion keeps a cross-fade, so the content visibly *changed*. */
const REDUCED_MS = 100;
/** Grace before the outgoing widget unmounts, so its last frame isn't cut. */
const UNMOUNT_DELAY_MS = 250;

export { EASE };

/** Whether the user asked for less motion. Live — the OS toggle takes effect. */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(
        () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!mq) return;
        const onChange = () => setReduced(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

interface Transition {
    from: string;
    to: string;
    dir: 1 | -1;
}

interface UseCrossFadeOptions {
    items: string[];
    /** The member showing now — committed state, wherever the caller keeps it. */
    activeId: string;
    /** Called once the transition lands, to persist the new active member. */
    onCommit: (id: string) => void;
}

export interface CrossFade {
    /**
     * Widget ids that must be mounted right now — one at rest, two mid-switch.
     *
     * The caller renders one layer per id **keyed by the id**. That's not a
     * detail: with positional layers ("base" and "incoming") React reconciles
     * the incoming widget from slot 1 into slot 0 when the transition ends,
     * which unmounts and remounts it. The widget then loses its state and
     * re-fetches — the card visibly blanks a second after the switch. Keyed
     * layers keep each widget instance exactly where it was mounted.
     */
    layers: string[];
    /** The member the user is heading to (the committed one at rest). */
    targetId: string;
    /** Ref registry — one element per layer id. */
    layerRef: (id: string) => (el: HTMLDivElement | null) => void;
    switchTo: (id: string) => void;
    step: (delta: 1 | -1) => void;
}

export function useCrossFade({ items, activeId, onCommit }: UseCrossFadeOptions): CrossFade {
    const reduced = useReducedMotion();

    const [transition, setTransition] = useState<Transition | null>(null);
    const transitionRef = useRef<Transition | null>(null);
    transitionRef.current = transition;

    /** Layer elements by widget id — populated by the ref callbacks. */
    const layerEls = useRef(new Map<string, HTMLDivElement>());
    const refCallbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
    /** Bumped on every request; a stale `finished` handler checks it and bails. */
    const generation = useRef(0);
    const unmountTimer = useRef<number | null>(null);

    // Held in a ref rather than read from the closure: the grid hands down a
    // fresh `onCommit` on every render, and depending on it would restart the
    // animation mid-flight.
    const commitRef = useRef(onCommit);
    commitRef.current = onCommit;

    // Stable per id, so a re-render doesn't detach and re-attach the element.
    const layerRef = useCallback((id: string) => {
        const existing = refCallbacks.current.get(id);
        if (existing) return existing;
        const fn = (el: HTMLDivElement | null) => {
            if (el) layerEls.current.set(id, el);
            else layerEls.current.delete(id);
        };
        refCallbacks.current.set(id, fn);
        return fn;
    }, []);

    // The set can change under a running transition — a bundle member extracted,
    // widget under us; drop any in-flight transition rather than animating to
    // something that no longer exists.
    useEffect(() => {
        if (transition && !items.includes(transition.to)) setTransition(null);
    }, [items, transition]);

    useEffect(
        () => () => {
            if (unmountTimer.current != null) window.clearTimeout(unmountTimer.current);
        },
        []
    );

    const switchTo = useCallback(
        (id: string) => {
            const current = transitionRef.current?.to ?? activeId;
            if (id === current || !items.includes(id)) return;
            const dir: 1 | -1 = items.indexOf(id) > items.indexOf(current) ? 1 : -1;
            // The queue is never longer than one: a third request replaces the
            // second rather than joining it, so holding the arrow key doesn't
            // build a backlog of transitions to sit through.
            setTransition({ from: transitionRef.current?.from ?? activeId, to: id, dir });
        },
        [activeId, items]
    );

    const step = useCallback(
        (delta: 1 | -1) => {
            const current = transitionRef.current?.to ?? activeId;
            const index = items.indexOf(current);
            if (index === -1 || items.length === 0) return;
            switchTo(items[(index + delta + items.length) % items.length]);
        },
        [activeId, items, switchTo]
    );

    useLayoutEffect(() => {
        if (!transition) return;
        const gen = ++generation.current;
        const base = layerEls.current.get(transition.from) ?? null;
        const incoming = layerEls.current.get(transition.to) ?? null;

        // Resume from whatever is on screen, not from a fresh 0/1.
        const baseOpacity = base ? getComputedStyle(base).opacity : '1';
        base?.getAnimations().forEach((a) => a.cancel());
        incoming?.getAnimations().forEach((a) => a.cancel());

        const settle = () => {
            if (generation.current !== gen) return;
            commitRef.current(transition.to);
            setTransition(null);
            // The widget that just arrived stays mounted and keeps its
            // animation's final frame; clearing it lets the layer fall back to
            // its resting style without a flash.
            unmountTimer.current = window.setTimeout(() => {
                layerEls.current
                    .get(transition.to)
                    ?.getAnimations()
                    .forEach((a) => a.cancel());
            }, UNMOUNT_DELAY_MS);
        };

        if (reduced) {
            // Not "no animation": a hard swap of a whole card leaves no clue
            // that anything changed. A short cross-fade is the smallest thing
            // that still says "this content was replaced".
            base?.animate([{ opacity: baseOpacity }, { opacity: 0 }], {
                duration: REDUCED_MS,
                easing: 'linear',
                fill: 'both',
            });
            const a = incoming?.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: REDUCED_MS,
                easing: 'linear',
                fill: 'both',
            });
            if (a) a.finished.then(settle).catch(() => undefined);
            else settle();
            return;
        }

        base?.animate(
            [
                { transform: 'translateX(0px)', opacity: baseOpacity },
                { transform: `translateX(${-SHIFT_PX * transition.dir}px)`, opacity: 0 },
            ],
            { duration: Math.max(MIN_REMAINING_MS, OUT_MS), easing: EASE.in, fill: 'both' }
        );

        const enter = incoming?.animate(
            [
                { transform: `translateX(${SHIFT_PX * transition.dir}px)`, opacity: 0 },
                { transform: 'translateX(0px)', opacity: 1 },
            ],
            {
                duration: Math.max(MIN_REMAINING_MS, IN_MS),
                delay: IN_DELAY,
                easing: EASE.out,
                fill: 'both',
            }
        );

        if (enter) enter.finished.then(settle).catch(() => undefined);
        else settle();
    }, [transition, reduced]);

    return {
        layers: transition ? [transition.from, transition.to] : [activeId],
        targetId: transition ? transition.to : activeId,
        layerRef,
        switchTo,
        step,
    };
}
