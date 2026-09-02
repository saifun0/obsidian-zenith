import React, { useCallback, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useCrossFade, useReducedMotion } from '../../../components/shared/useCrossFade';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { summarizeTracker } from './trackerSummary';
import { TrackerPanel } from './TrackerPanel';
import { useCountUp } from './useCountUp';
import { useAutoAdvance } from './useAutoAdvance';
import { dialAngles, dialPoint, nearestTurn } from './dialGeometry';

/**
 * The ring's radius, in the 100×100 viewBox the circle is drawn in — which is
 * also a percentage of the stage, so the icons can be placed against the same
 * number the circle uses. The stylesheet holds it a second time as `--jdial-r`,
 * for the travelling mark; they have to agree.
 *
 * Thirty-four because nothing that stands on the ring is as thin as the ring.
 * An icon is a fixed 26px however large the ring is and it is centred ON the
 * line; the travelling mark is a 30px halo with 12px of glow, 27px from its own
 * centre. The dial is clipped to its own box — see `.zenith-jdial` — so the
 * stage has to be wide enough for the radius plus the widest of those, or the
 * mark reaches twelve o'clock with its glow cut off along a straight line. At
 * the smallest ring the card will draw before falling back to pips, forty left
 * 14.8px and thirty-four leaves 23.7px.
 */
const RING_R = 34;

export interface TrackerDialScale {
    /** "avg · 3 d" under the figure. */
    showBasis: boolean;
    /** The active tracker's window, drawn under the dial. Zero hides it. */
    plotHeight: number;
}

interface TrackerDialProps {
    stats: TrackerStat[];
    scale: TrackerDialScale;
}

/**
 * The figure that is animating, formatted the way its tracker wants.
 *
 * `summarizeTracker` returns the value already formatted, which is right for a
 * row and wrong for a centre that counts up to it: the count-up needs the
 * number, and the formatting has to be re-applied at every frame. So the shape
 * of the answer comes from the summary and the number does not.
 */
function useAnimatedFigure(stat: TrackerStat, enabled: boolean): string {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);

    const target =
        stat.tracker.kind === 'scale'
            ? (stat.average ?? 0)
            : stat.tracker.kind === 'check'
              ? stat.total
              : stat.total;

    const live = useCountUp(target, enabled);
    const nothing = stat.tracker.kind === 'scale' ? stat.average === null : stat.days === 0;

    if (nothing) return summary.value;
    return stat.tracker.kind === 'scale' ? live.toFixed(1) : String(Math.round(live));
}

/** One tracker in the middle of the dial: its figure, its name, its basis. */
const DialFace: FC<{ stat: TrackerStat; scale: TrackerDialScale; animate: boolean }> = ({
    stat,
    scale,
    animate,
}) => {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);
    const figure = useAnimatedFigure(stat, animate);

    return (
        <div className="zenith-jdial__face">
            <span className="zenith-jdial__value">
                {figure}
                {summary.suffix && <span className="zenith-jdial__unit">{summary.suffix}</span>}
            </span>
            <span className="zenith-jdial__name">
                <DynamicIcon name={stat.tracker.icon} size={12} />
                {stat.tracker.label}
            </span>
            {scale.showBasis && <span className="zenith-jdial__basis">{summary.basis}</span>}
        </div>
    );
};

/**
 * One tracker at the centre, the rest of them standing round it.
 *
 * The card used to be a list: every tracker got a row, a row got a name, a
 * 12-pixel plot and a figure, and the figure — the thing the row exists to say
 * — was the smallest of the three. Four trackers made four cramped rows and a
 * line reading "one more, in the journal", which is a list apologising for
 * being a list.
 *
 * So one tracker is the card and the others are on the ring around it. The
 * centre is large enough to read across a room; the ring says how many there
 * are, which one this is, and how to get to any other in one click. The dial
 * moves on by itself every few seconds, and stops the moment anybody looks —
 * see `useAutoAdvance` for the three ways it knows to hold still.
 *
 * Beside the ring stands the panel, and between them they hold two different
 * kinds of claim. The ring is about the SET of trackers — how many, which one,
 * how to reach another. The panel is about the one in the middle: how much of
 * the window it was written down on, how long the current run is, how stale the
 * last mark is. The coverage used to be a coloured arc on the ring, which put
 * one tracker's reading on the furniture belonging to all of them, and said it
 * as a length with no scale beside it. See `TrackerPanel`.
 */
export const TrackerDial: FC<TrackerDialProps> = ({ stats, scale }) => {
    const t = useTranslation();
    const animations = useZenithStore((s) => s.settings.uiAnimations);
    const reduced = useReducedMotion();
    const animate = animations && !reduced;

    const ids = useMemo(() => stats.map((s) => s.tracker.id), [stats]);
    const [activeId, setActiveId] = useState(() => ids[0] ?? '');

    // A tracker deleted in settings must not leave the dial pointing at
    // nothing; falling back to the first is what the ring already shows.
    const current = ids.includes(activeId) ? activeId : (ids[0] ?? '');

    const { layers, targetId, layerRef, switchTo, step } = useCrossFade({
        items: ids,
        activeId: current,
        onCommit: setActiveId,
    });

    const [held, setHeld] = useState(false);
    const advance = useCallback(() => step(1), [step]);
    useAutoAdvance({
        key: targetId,
        count: ids.length,
        enabled: animate,
        paused: held,
        onAdvance: advance,
    });

    const byId = useMemo(() => new Map(stats.map((s) => [s.tracker.id, s])), [stats]);
    const angles = useMemo(() => dialAngles(stats.length), [stats.length]);
    const activeIndex = Math.max(0, ids.indexOf(targetId));
    const active = byId.get(targetId) ?? stats[0];

    /**
     * The mark's rotation, accumulated rather than normalised.
     *
     * Held in a ref and advanced on every change, so the mark takes the short
     * way round the wrap instead of unwinding three hundred degrees to travel
     * thirty. See `nearestTurn`.
     */
    const turn = useRef(angles[0] ?? 0);
    turn.current = nearestTurn(turn.current, angles[activeIndex] ?? 0);

    if (!active) return null;

    const dialStyle = {
        ['--jdial-color' as string]: active.tracker.color,
        ['--jdial-turn' as string]: `${turn.current}deg`,
    } as CSSProperties;

    return (
        <div
            className="zenith-jdial"
            style={dialStyle}
            // Holding still while somebody reads is the whole contract with an
            // auto-advancing card. Focus counts as reading: a keyboard user
            // stepping through the pips is steering it.
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
        >
            <div className="zenith-jdial__body">
                <div
                    className="zenith-jdial__stage"
                    role="group"
                    aria-label={t('journal.dial.aria')}
                >
                    <div className="zenith-jdial__ring-layer" data-slots={stats.length}>
                        {/* The ring the trackers stand on, and nothing else. It
                            used to carry a second, coloured circle for the
                            active tracker's coverage — one figure, drawn
                            rather than written, on a ring that already said
                            how many trackers there are, which one is showing
                            and how to reach another. The coverage is a number
                            in the panel beside it now, with the three things
                            an arc could never have said next to it. */}
                        <svg
                            className="zenith-jdial__ring"
                            viewBox="0 0 100 100"
                            aria-hidden="true"
                        >
                            <circle className="zenith-jdial__track" cx="50" cy="50" r={RING_R} />
                        </svg>

                        {/* The travelling mark: one element turned about the
                            dial's centre. It moves rather than the icons,
                            which stay where they were put — a click target
                            that walks away every seven seconds is not one. */}
                        <span className="zenith-jdial__mark" aria-hidden="true">
                            <span className="zenith-jdial__mark-dot" />
                        </span>

                        {stats.map((stat, i) => {
                            const { x, y } = dialPoint(angles[i], RING_R);
                            const on = stat.tracker.id === targetId;
                            return (
                                <button
                                    key={stat.tracker.id}
                                    className={`zenith-jdial__slot ${on ? 'is-active' : ''}`}
                                    style={{
                                        left: `${50 + x}%`,
                                        top: `${50 + y}%`,
                                        ['--hmon-color' as string]: stat.tracker.color,
                                    }}
                                    onClick={() => switchTo(stat.tracker.id)}
                                    aria-pressed={on}
                                    aria-label={stat.tracker.label}
                                    title={stat.tracker.label}
                                >
                                    <DynamicIcon name={stat.tracker.icon} size={14} />
                                </button>
                            );
                        })}
                    </div>

                    {/* Keyed by tracker id, never by slot — a positional layer is
                    reconciled from one slot into the other when the switch
                    ends, which remounts the face and restarts its count-up
                    from zero a moment after it arrived. */}
                    <div className="zenith-jdial__centre">
                        {layers.map((id) => {
                            const stat = byId.get(id);
                            return stat ? (
                                <div className="zenith-jdial__layer" key={id} ref={layerRef(id)}>
                                    <DialFace stat={stat} scale={scale} animate={animate} />
                                </div>
                            ) : null;
                        })}
                    </div>
                </div>

                {/* Beside the ring, never under it. The panel is about the one
                    tracker in the middle, and a column of figures under a
                    circle reads as a caption to the whole card instead — which
                    is what the journal's own metrics strip already is. The
                    stylesheet drops the panel when the card is too narrow to
                    seat it next to a square. */}
                <TrackerPanel stat={active} plotHeight={scale.plotHeight} />
            </div>

            {/* The same three things in a tenth of the room — how many, which
                one, how to reach another — for a card too short to hold a ring.
                Both are drawn and the stylesheet picks; `display: none` takes
                the unused one out of the accessibility tree as well, so there
                is never a second set of tab stops for the same choice. */}
            {stats.length > 1 && (
                <div
                    className="zenith-jdial__pips"
                    role="tablist"
                    aria-label={t('journal.dial.aria')}
                >
                    {stats.map((stat) => (
                        <button
                            key={stat.tracker.id}
                            className={`zenith-jdial__pip ${stat.tracker.id === targetId ? 'is-active' : ''}`}
                            style={{ ['--hmon-color' as string]: stat.tracker.color }}
                            role="tab"
                            aria-selected={stat.tracker.id === targetId}
                            aria-label={stat.tracker.label}
                            title={stat.tracker.label}
                            onClick={() => switchTo(stat.tracker.id)}
                        >
                            <span className="zenith-jdial__pip-dot" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
