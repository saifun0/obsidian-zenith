import React, {
    useCallback,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type FC,
    type KeyboardEvent,
    type PointerEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useCrossFade, useReducedMotion } from '../../../components/shared/useCrossFade';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { summarizeTracker } from './trackerSummary';
import { TrackerPanel } from './TrackerPanel';
import { TrackerStrip } from './TrackerStrip';
import { useCountUp } from '../../../components/shared/useCountUp';
import { useAutoAdvance } from './useAutoAdvance';

/**
 * How far a finger travels across the deck before it counts as a swipe.
 *
 * Far enough that a tap with a bit of drift in it is still a tap, short enough
 * that the gesture answers on the first flick rather than on the second.
 */
const SWIPE_PX = 44;

/**
 * Whether an element is focused the way a KEYBOARD focuses it.
 *
 * The deck holds still while somebody is reading it, and focus is one of the
 * ways it knows. Plain focus is the wrong test: clicking an arrow focuses the
 * arrow, and the focus stays there after the pointer has moved on — so one
 * click froze the deck until something else on the page was clicked. A mouse
 * click does not make a button `:focus-visible`; a Tab to it does, and that is
 * exactly the case that means somebody is steering by keyboard.
 */
function keyboardFocused(el: EventTarget | null): boolean {
    if (!(el instanceof Element)) return false;
    try {
        return el.matches(':focus-visible');
    } catch {
        // An engine that cannot answer keeps the older, safer behaviour:
        // treat any focus as a reader rather than advance under one.
        return true;
    }
}

/**
 * Swiping the deck from one tracker to the next.
 *
 * Touch and pen only. A mouse gets the arrows — a pointer that can hover has
 * somewhere to put them, and a mouse drag inside a card is how the dashboard's
 * own grid is rearranged; claiming it here would fight the board.
 *
 * The gesture fires the moment it is unambiguous rather than on release, so the
 * card answers under the finger; clearing the origin is what stops one long
 * drag from stepping through several trackers at once.
 */
function useSwipe(step: (delta: 1 | -1) => void) {
    const from = useRef<{ x: number; y: number } | null>(null);
    const clear = useCallback(() => {
        from.current = null;
    }, []);

    const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse') return;
        from.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLDivElement>) => {
            const origin = from.current;
            if (!origin) return;
            const dx = e.clientX - origin.x;
            const dy = e.clientY - origin.y;
            // Sideways has to win outright, or a card on a scrolling board
            // steps a tracker every time somebody scrolls past it.
            if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
            from.current = null;
            step(dx < 0 ? 1 : -1);
        },
        [step]
    );

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp: clear,
        onPointerCancel: clear,
        onPointerLeave: clear,
    };
}

export interface TrackerDeckScale {
    /** "avg · 3 d" under the figure. */
    showBasis: boolean;
    /** The active tracker's window, drawn under the deck. Zero leaves it out. */
    plotHeight: number;
}

interface TrackerDeckProps {
    stats: TrackerStat[];
    scale: TrackerDeckScale;
}

/**
 * The figure that is animating, formatted the way its tracker wants.
 *
 * `summarizeTracker` returns the value already formatted, which is right for a
 * row and wrong for a figure that counts up to it: the count-up needs the
 * number, and the formatting has to be re-applied at every frame. So the shape
 * of the answer comes from the summary and the number does not.
 */
function useAnimatedFigure(stat: TrackerStat, enabled: boolean): string {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);

    const target = stat.tracker.kind === 'scale' ? (stat.average ?? 0) : stat.total;

    const live = useCountUp(target, enabled);
    const nothing = stat.tracker.kind === 'scale' ? stat.average === null : stat.days === 0;

    if (nothing) return summary.value;
    return stat.tracker.kind === 'scale' ? live.toFixed(1) : String(Math.round(live));
}

/**
 * One tracker, shown whole: its icon, its figure, its name, its basis.
 *
 * The icon is the thing that changes — it is how you know at a glance that the
 * card is talking about a different habit now — so it is the largest mark on
 * the face and it arrives with an entrance of its own. Bare, too: it had a
 * tinted plate and a glow under it, and that was the ring's old job of putting
 * the tracker's colour on the card, done by a shape nobody asked for.
 * Everything under it is the reading.
 *
 * The tracker's colour is set here rather than only on the deck, because a
 * layer on its way out has to keep the colour it was drawn in: one variable on
 * the root would repaint the outgoing face in the incoming tracker's colour
 * halfway through the swap.
 */
const DeckFace: FC<{ stat: TrackerStat; scale: TrackerDeckScale; animate: boolean }> = ({
    stat,
    scale,
    animate,
}) => {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);
    const figure = useAnimatedFigure(stat, animate);

    return (
        <div
            className="zenith-jdeck__face"
            style={{ ['--jdeck-color' as string]: stat.tracker.color } as CSSProperties}
        >
            <span className="zenith-jdeck__badge" aria-hidden="true">
                <DynamicIcon name={stat.tracker.icon} size={30} strokeWidth={1.75} />
            </span>
            <span className="zenith-jdeck__value">
                {figure}
                {summary.suffix && <span className="zenith-jdeck__unit">{summary.suffix}</span>}
            </span>
            <span className="zenith-jdeck__name">{stat.tracker.label}</span>
            {scale.showBasis && <span className="zenith-jdeck__basis">{summary.basis}</span>}
        </div>
    );
};

/**
 * The trackers, one at a time, with a way through them.
 *
 * This was a ring: every tracker stood on a circle drawn across the card, a
 * light travelled round the track to whichever one was showing, and the figure
 * sat in the hole in the middle. That is a great deal of furniture for three
 * claims — how many trackers there are, which one this is, how to reach another
 * — and the circle took the whole height of a card whose job is to report
 * numbers.
 *
 * So the ring is gone and the icon does the work. One tracker's icon stands
 * over its figure and swaps for the next one's, and the swap IS the signal: the
 * old face slides out, the new one slides in behind it, and its icon lands with
 * a small rise. Nothing has to be drawn around the card for that to read.
 *
 * Three ways to steer it, one per kind of input:
 *
 * * **A mouse** gets the two arrows, which appear while the pointer is on the
 *   card. Hidden at rest, because a card at rest is something to read rather
 *   than a control panel — and shown the instant they might be wanted.
 * * **A finger** gets a swipe, and keeps the arrows in view: a coarse pointer
 *   cannot hover, so an affordance that waits for hover never appears at all.
 * * **A keyboard** gets the arrows as real buttons, and left/right anywhere in
 *   the card.
 *
 * It also moves on by itself every few seconds and stops the moment anybody
 * looks — see `useAutoAdvance` for the three ways it knows to hold still.
 *
 * Beside the face stands the panel, and between them they hold two different
 * kinds of claim. The deck is about the SET of trackers; the panel is about the
 * one showing — how much of the window it was written down on, how long the
 * current run is, how stale the last mark is. See `TrackerPanel`.
 */
export const TrackerDeck: FC<TrackerDeckProps> = ({ stats, scale }) => {
    const t = useTranslation();
    const animations = useZenithStore((s) => s.settings.uiAnimations);
    const reduced = useReducedMotion();
    const animate = animations && !reduced;

    const ids = useMemo(() => stats.map((s) => s.tracker.id), [stats]);
    const [activeId, setActiveId] = useState(() => ids[0] ?? '');

    // A tracker deleted in settings must not leave the deck pointing at
    // nothing; falling back to the first is what the pips already show.
    const current = ids.includes(activeId) ? activeId : (ids[0] ?? '');

    const { layers, targetId, layerRef, switchTo, step } = useCrossFade({
        items: ids,
        activeId: current,
        onCommit: setActiveId,
    });

    // Two ways to be read, and they end differently: a pointer leaves, a
    // keyboard focus moves on. Kept apart so neither can strand the other —
    // one state flag for both meant a click that focused an arrow was
    // indistinguishable from somebody reading, and the deck never restarted.
    const [hovered, setHovered] = useState(false);
    const [steering, setSteering] = useState(false);

    const advance = useCallback(() => step(1), [step]);
    useAutoAdvance({
        key: targetId,
        count: ids.length,
        enabled: animate,
        paused: hovered || steering,
        onAdvance: advance,
    });

    const swipe = useSwipe(step);

    const byId = useMemo(() => new Map(stats.map((s) => [s.tracker.id, s])), [stats]);
    const active = byId.get(targetId) ?? stats[0];
    const many = stats.length > 1;

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!many) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            step(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            step(-1);
        }
    };

    if (!active) return null;

    const deckStyle = { ['--jdeck-color' as string]: active.tracker.color } as CSSProperties;

    return (
        <div
            className={`zenith-jdeck ${animate ? '' : 'is-still'}`}
            style={deckStyle}
            // Holding still while somebody reads is the whole contract with a
            // card that advances on its own. A keyboard focus counts as
            // reading — somebody is stepping through the trackers by hand —
            // and the focus a click leaves behind does not. See
            // `keyboardFocused`.
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={(e) => setSteering(keyboardFocused(e.target))}
            onBlur={() => setSteering(false)}
            onKeyDown={onKeyDown}
        >
            <div className="zenith-jdeck__body">
                <div
                    className="zenith-jdeck__stage"
                    role="group"
                    aria-label={t('journal.deck.aria')}
                    {...(many ? swipe : {})}
                >
                    {many && (
                        <button
                            type="button"
                            className="zenith-jdeck__nav zenith-jdeck__nav--prev"
                            onClick={() => step(-1)}
                            aria-label={t('journal.deck.prev')}
                            title={t('journal.deck.prev')}
                        >
                            <ChevronLeft size={16} strokeWidth={2.25} />
                        </button>
                    )}

                    {/* Keyed by tracker id, never by position — a positional
                        layer is reconciled from one slot into the other when
                        the swap ends, which remounts the face and restarts its
                        count-up from zero a moment after it arrived. */}
                    <div className="zenith-jdeck__deck">
                        {layers.map((id) => {
                            const stat = byId.get(id);
                            return stat ? (
                                <div className="zenith-jdeck__layer" key={id} ref={layerRef(id)}>
                                    <DeckFace stat={stat} scale={scale} animate={animate} />
                                </div>
                            ) : null;
                        })}
                    </div>

                    {many && (
                        <button
                            type="button"
                            className="zenith-jdeck__nav zenith-jdeck__nav--next"
                            onClick={() => step(1)}
                            aria-label={t('journal.deck.next')}
                            title={t('journal.deck.next')}
                        >
                            <ChevronRight size={16} strokeWidth={2.25} />
                        </button>
                    )}
                </div>

                {/* Beside the face, never under it. The panel is about the one
                    tracker showing, and a column of figures under the figure
                    reads as a caption to the whole card instead — which is what
                    the journal's own metrics strip already is. The stylesheet
                    drops the panel when the card is too narrow to seat it. */}
                <TrackerPanel stat={active} plotHeight={scale.plotHeight} />
            </div>

            {/* Under the deck: the pips, which say how many trackers there are
                and which one this is, and — on a card too narrow for the panel
                — what the panel would have said. The strip is keyed by the
                tracker so a swap remounts it and its chips play their entrance;
                it is the small card's whole answer to "which habit is this",
                and it has to be seen to change. See `TrackerStrip`. */}
            <div className="zenith-jdeck__foot">
                <TrackerStrip key={targetId} stat={active} />

                {many && (
                    <div
                        className="zenith-jdeck__pips"
                        role="tablist"
                        aria-label={t('journal.deck.aria')}
                    >
                        {stats.map((stat) => (
                            <button
                                key={stat.tracker.id}
                                className={`zenith-jdeck__pip ${
                                    stat.tracker.id === targetId ? 'is-active' : ''
                                }`}
                                style={{ ['--jdeck-color' as string]: stat.tracker.color }}
                                role="tab"
                                aria-selected={stat.tracker.id === targetId}
                                aria-label={stat.tracker.label}
                                title={stat.tracker.label}
                                onClick={() => switchTo(stat.tracker.id)}
                            >
                                <span className="zenith-jdeck__pip-dot" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
