import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type FC,
} from 'react';
import { LayoutGrid, MoreHorizontal } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import type { DashboardWidgetDefinition } from '../widgets';
import { CardRoomContext, useBodyBox, type CardRoom } from '../cardRoom';
import { BUNDLE_MAX_PIPS, type WidgetBundle } from '../grid/bundleTypes';
import { useCrossFade } from '../../../components/shared/useCrossFade';
import { claimSwipes } from '../../../core/useSwipeActions';

/** Horizontal travel that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

interface MemberViewProps {
    def: DashboardWidgetDefinition;
    /** What the card is called: the user's name for it, or the widget's. */
    label: string;
    /** The member's layout id — the same string its own settings live under. */
    instanceId: string;
    size: WidgetSize;
    /** Reserve space in the header so the title can't run under the rail. */
    railReserve?: number;
    /** The bundle's size isn't one this widget offers — show the compact form. */
    compact?: boolean;
}

/**
 * One widget as it appears inside a bundle: its own header, its own body.
 *
 * A widget that doesn't support the bundle's size is not stretched to fit —
 * that's how you get a clock rendered as a billboard. It gets a compact strip
 * instead: header, one line saying why, and nothing pretending to be data.
 */
const MemberView: FC<MemberViewProps> = ({
    def,
    label,
    instanceId,
    size,
    railReserve,
    compact,
}) => {
    const t = useTranslation();
    const Body = def.component;
    // A bundle holds the height it was given, so the body's box is the room.
    const bodyEl = useRef<HTMLDivElement>(null);
    const box = useBodyBox(bodyEl);
    const room = useMemo<CardRoom>(
        () => ({ width: box.width, height: box.height, fit: false }),
        [box.width, box.height]
    );

    return (
        <div className="zenith-widget-card zenith-bundle__member">
            <div className="zenith-widget-card__header">
                <DynamicIcon name={def.icon} size={15} />
                <span className="zenith-widget-card__title">{label}</span>
                {railReserve ? (
                    <span
                        className="zenith-bundle__reserve"
                        style={{ width: railReserve }}
                        aria-hidden="true"
                    />
                ) : null}
            </div>
            <div className="zenith-widget-card__body" ref={bodyEl}>
                {compact ? (
                    <div className="zenith-bundle__compact">
                        {t('dashboard.bundle.compact', { name: label, size: SIZE_LABEL[size] })}
                    </div>
                ) : Body ? (
                    <CardRoomContext.Provider value={room}>
                        <Body size={size} instanceId={instanceId} />
                    </CardRoomContext.Provider>
                ) : null}
            </div>
        </div>
    );
};

interface BundlePipsProps {
    /** The members to draw, in rail order. */
    members: readonly string[];
    /** The one on top. */
    activeId: string;
    defsById: Map<string, DashboardWidgetDefinition>;
    labelOf: (widgetId: string) => string;
    onPick: (widgetId: string) => void;
    /** Members left out of the row, shown as "+N". */
    overflow?: number;
}

/**
 * A bundle's members as a row of their own icons, the one on top lit.
 *
 * Drawn twice: in the rail on the front, where it switches the widget being
 * shown, and in the header of the back, where it switches the widget being set
 * up. It is the same choice either way — a bundle has one widget on top — so
 * it is the same control in the same corner on both faces.
 */
export const BundlePips: FC<BundlePipsProps> = ({
    members,
    activeId,
    defsById,
    labelOf,
    onPick,
    overflow = 0,
}) => {
    const t = useTranslation();
    return (
        <div className="zenith-bundle__pips" role="tablist" aria-label={t('dashboard.bundle.role')}>
            {members.map((id) => (
                <button
                    key={id}
                    type="button"
                    className={`zenith-bundle__pip ${id === activeId ? 'is-active' : ''}`}
                    role="tab"
                    aria-selected={id === activeId}
                    aria-label={labelOf(id)}
                    title={labelOf(id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onPick(id);
                    }}
                >
                    <DynamicIcon name={defsById.get(id)?.icon} fallback={LayoutGrid} size={13} />
                </button>
            ))}
            {overflow > 0 && <span className="zenith-bundle__pip-more">+{overflow}</span>}
        </div>
    );
};

interface BundleCardProps {
    bundle: WidgetBundle;
    /** Definitions for the members, in rail order. Missing ones are skipped. */
    defsById: Map<string, DashboardWidgetDefinition>;
    size: WidgetSize;
    /** Members that can't render at `size` and fall back to the compact strip. */
    unsupported: Set<string>;
    editing: boolean;
    onSetActive: (widgetId: string) => void;
    /** What a member is called — its own name where the user gave one. */
    labelOf: (widgetId: string) => string;
    /** Turn the card over to the settings of the widget on top. */
    onConfigure?: () => void;
}

/**
 * A bundle in its cell.
 *
 * It *is* the active widget — same card, same header, no second frame around
 * it. What marks it as a bundle is two small things: the rail on the header's
 * own line, and the shoulder peeking out below the bottom edge (which lives in
 * the grid's gap and so costs the widget no space at all).
 *
 * The rail is the members' own icons, the one on top lit. It used to be a row
 * of dots, which said how many widgets were in the stack and nothing about
 * which — the only way to find the journal was to press dots until it came up.
 *
 * There is deliberately no way to unfold every member at once. Growing the cell
 * to stack them was a second layout the dashboard never asked for — the point
 * of a bundle is that it occupies one cell — and the controls that view carried
 * now live in the inspector, alongside the rest of the bundle's settings.
 *
 * Design: `Zenith Bundles.dc.html`, model C.
 */
export const BundleCard: FC<BundleCardProps> = ({
    bundle,
    defsById,
    size,
    unsupported,
    editing,
    onSetActive,
    labelOf,
    onConfigure,
}) => {
    const t = useTranslation();
    const members = bundle.members;

    const { layers, targetId, layerRef, switchTo, step } = useCrossFade({
        items: members,
        activeId: bundle.activeId,
        onCommit: onSetActive,
    });

    const swipeStart = useRef<{ x: number; y: number } | null>(null);

    // A swipe across the card flips it, and Obsidian would also take that
    // swipe to open a sidebar. Claimed touch by touch, so one starting at the
    // very edge of the screen still reaches the sidebar. See `claimSwipes`.
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = rootRef.current;
        if (!el || editing) return;
        return claimSwipes(el);
    }, [editing]);

    const onPointerDown = (e: React.PointerEvent) => {
        // Arranging owns the pointer — there that gesture is a drag, not a swipe.
        if (editing || e.pointerType === 'mouse') return;
        swipeStart.current = { x: e.clientX, y: e.clientY };
        // Capture so the release still reaches us when the finger travels off
        // the card — otherwise a swipe that overshoots simply does nothing.
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* Capture is a nicety; the gesture still works without it. */
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        // Vertical intent wins: the dashboard scrolls, and a swipe that was
        // meant to scroll must not also flip the bundle.
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(e.clientY - start.y))
            return;
        step(dx < 0 ? 1 : -1);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (editing) return;
        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                step(1);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                step(-1);
                break;
            case 'Home':
                e.preventDefault();
                switchTo(members[0]);
                break;
            case 'End':
                e.preventDefault();
                switchTo(members[members.length - 1]);
                break;
        }
    };

    const renderMember = useCallback(
        (id: string, railReserve?: number) => {
            const def = defsById.get(id);
            if (!def) return null;
            return (
                <MemberView
                    def={def}
                    label={labelOf(id)}
                    instanceId={id}
                    size={size}
                    railReserve={railReserve}
                    compact={unsupported.has(id)}
                />
            );
        },
        [defsById, labelOf, size, unsupported]
    );

    // Six pips, then a "+N" — past that the rail costs more header than the
    // widget's own title can spare, and the full list is in the inspector.
    const shown = members.slice(0, BUNDLE_MAX_PIPS);
    const overflow = members.length - shown.length;
    // How wide the rail actually is, measured rather than reckoned.
    //
    // Two things are cut to this width and neither survives being a few pixels
    // out: the spacer that keeps a member's title clear of the rail, and the
    // notch the members are clipped to so the rail has nothing left to cover.
    // The arithmetic that used to stand in for a measurement came out five
    // pixels short — an active pip is wider than a resting one, and the rail's
    // padding follows the density setting — which a spacer can absorb and a
    // clip cannot. It is still the opening guess, for the first paint.
    //
    // This settles once per change of membership, not once per frame: while
    // the pips animate one widens by exactly what the other loses, on the same
    // curve, so the rail's own width never moves.
    const railEl = useRef<HTMLDivElement | null>(null);
    const [railWidth, setRailWidth] = useState(
        () => shown.length * 24 + 44 + (overflow > 0 ? 26 : 0)
    );
    useEffect(() => {
        const el = railEl.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const measure = () => setRailWidth(Math.ceil(el.getBoundingClientRect().width));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={rootRef}
            className="zenith-bundle"
            role="group"
            aria-roledescription={t('dashboard.bundle.role')}
            aria-label={bundle.name || t.plural('dashboard.bundle.count', members.length)}
            tabIndex={editing ? undefined : 0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
        >
            {/* The shoulder sits in the grid gap, below the card — it marks a
                bundle without taking a pixel from the widget. Two at most:
                deeper piles stop reading as depth and start reading as noise. */}
            <span className="zenith-bundle__shoulder" aria-hidden="true" />
            {members.length > 2 && (
                <span className="zenith-bundle__shoulder is-second" aria-hidden="true" />
            )}

            <div className="zenith-bundle__card">
                <div
                    className="zenith-bundle__stage"
                    style={{ '--zenith-bundle-rail': `${railWidth}px` } as CSSProperties}
                >
                    {/* A window of their own around the members, notched where
                        the rail sits — see the stylesheet. The layers cannot
                        carry the notch themselves: `clip-path` travels with an
                        element's transform, and these slide. */}
                    <div className="zenith-bundle__layers">
                        {/* Keyed by widget id, never by slot — see `CrossFade.layers`. */}
                        {layers.map((id) => (
                            <div
                                className={`zenith-bundle__layer ${id === targetId ? '' : 'is-leaving'}`}
                                key={id}
                                ref={layerRef(id)}
                            >
                                {renderMember(id, railWidth)}
                            </div>
                        ))}
                    </div>

                    {/* Outside the layers on purpose: the pips belong to the
                        bundle, not to whichever member is on top, so they hold
                        still while the cards cross-fade underneath them. */}
                    <div className="zenith-bundle__rail" ref={railEl}>
                        <BundlePips
                            members={shown}
                            activeId={targetId}
                            defsById={defsById}
                            labelOf={labelOf}
                            onPick={switchTo}
                            overflow={overflow}
                        />

                        {/* The way to the back of the card, as on every other:
                            the settings of whichever widget is on top. A rule
                            stands between it and the icons, because it is not
                            one of them — they choose a widget, it opens the
                            card. */}
                        {!editing && onConfigure && (
                            <span className="zenith-bundle__sep" aria-hidden="true" />
                        )}
                        {!editing && onConfigure && (
                            <button
                                type="button"
                                className="zenith-widget-card__more zenith-bundle__more"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onConfigure();
                                }}
                                aria-label={t('dashboard.widget.settings', {
                                    name: labelOf(targetId),
                                })}
                                title={t('dashboard.widget.settings', { name: labelOf(targetId) })}
                            >
                                <MoreHorizontal size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
