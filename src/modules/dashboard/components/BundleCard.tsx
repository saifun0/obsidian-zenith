import React, { useCallback, useEffect, useRef, useState, type CSSProperties, type FC } from 'react';
import { Folder } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import type { DashboardWidgetContext, DashboardWidgetDefinition } from '../widgets';
import { prettifyWidgetId } from '../widgets';
import { DomWidgetHost } from './GridWidget';
import { BUNDLE_MAX_PIPS, type WidgetBundle } from '../grid/bundleTypes';
import { useCrossFade } from '../../../components/shared/useCrossFade';

/** Horizontal travel that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

interface MemberViewProps {
    def: DashboardWidgetDefinition;
    /** The member's layout id — the same string its own settings live under. */
    instanceId: string;
    ctx: DashboardWidgetContext;
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
const MemberView: FC<MemberViewProps> = ({ def, instanceId, ctx, size, railReserve, compact }) => {
    const t = useTranslation();
    const Body = def.component;
    const label = def.title ?? prettifyWidgetId(def.id);

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
            <div className="zenith-widget-card__body">
                {compact ? (
                    <div className="zenith-bundle__compact">
                        {t('dashboard.bundle.compact', { name: label, size: SIZE_LABEL[size] })}
                    </div>
                ) : Body ? (
                    <Body size={size} instanceId={instanceId} />
                ) : (
                    <DomWidgetHost def={def} ctx={ctx} />
                )}
            </div>
        </div>
    );
};

interface BundleCardProps {
    bundle: WidgetBundle;
    /** Definitions for the members, in rail order. Missing ones are skipped. */
    defsById: Map<string, DashboardWidgetDefinition>;
    ctx: DashboardWidgetContext;
    size: WidgetSize;
    /** Members that can't render at `size` and fall back to the compact strip. */
    unsupported: Set<string>;
    editing: boolean;
    onSetActive: (widgetId: string) => void;
}

/**
 * A bundle in its cell.
 *
 * It *is* the active widget — same card, same header, no second frame around
 * it. What marks it as a bundle is two small things: the rail of pips sitting
 * on the header's own line, and the shoulder peeking out below the bottom edge
 * (which lives in the grid's gap and so costs the widget no space at all).
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
    ctx,
    size,
    unsupported,
    editing,
    onSetActive,
}) => {
    const t = useTranslation();
    const members = bundle.members;

    const { layers, targetId, layerRef, switchTo, step } = useCrossFade({
        items: members,
        activeId: bundle.activeId,
        onCommit: onSetActive,
    });

    const swipeStart = useRef<{ x: number; y: number } | null>(null);

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
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(e.clientY - start.y)) return;
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
                    instanceId={id}
                    ctx={ctx}
                    size={size}
                    railReserve={railReserve}
                    compact={unsupported.has(id)}
                />
            );
        },
        [ctx, defsById, size, unsupported]
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
        () => shown.length * 13 + 38 + (overflow > 0 ? 26 : 0)
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

    const label = (id: string) => defsById.get(id)?.title ?? prettifyWidgetId(id);

    return (
        <div
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
                        {/* What the pips are pips OF. Without it a rail of
                            dots is just a rail of dots — the shoulder behind the
                            card says "there is more here" only to someone who
                            already knows to look for it. */}
                        <span className="zenith-bundle__mark" title={t('dashboard.bundle.role')}>
                            <Folder size={12} />
                        </span>

                        <div
                            className="zenith-bundle__pips"
                            role="tablist"
                            aria-label={t('dashboard.bundle.role')}
                        >
                            {shown.map((id) => (
                                <button
                                    key={id}
                                    className={`zenith-bundle__pip ${id === targetId ? 'is-active' : ''}`}
                                    role="tab"
                                    aria-selected={id === targetId}
                                    aria-label={label(id)}
                                    title={label(id)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        switchTo(id);
                                    }}
                                >
                                    <span className="zenith-bundle__pip-dot" />
                                </button>
                            ))}
                            {overflow > 0 && (
                                <span className="zenith-bundle__pip-more">+{overflow}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
