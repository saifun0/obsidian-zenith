import React, { useCallback, useLayoutEffect, useRef, type CSSProperties, type FC } from 'react';
import {
    ArrowUp,
    ArrowUpToLine,
    ChevronsDownUp,
    ChevronsUpDown,
    CornerUpRight,
    GripVertical,
} from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import type { DashboardWidgetContext, DashboardWidgetDefinition } from '../widgets';
import { prettifyWidgetId } from '../widgets';
import { DomWidgetHost } from './GridWidget';
import { BUNDLE_MAX_PIPS, type WidgetBundle } from '../grid/bundleTypes';
import { EASE, useBundleSwitch, useReducedMotion } from '../grid/useBundleSwitch';

/** Horizontal travel that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

interface MemberViewProps {
    def: DashboardWidgetDefinition;
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
const MemberView: FC<MemberViewProps> = ({ def, ctx, size, railReserve, compact }) => {
    const t = useTranslation();
    const Body = def.component;
    const label = def.title ?? prettifyWidgetId(def.id);

    return (
        <div className="zenith-widget-card zenith-bundle__member">
            {!def.bare && def.title && (
                <div className="zenith-widget-card__header">
                    <DynamicIcon name={def.icon} size={15} />
                    <span className="zenith-widget-card__title">{def.title}</span>
                    {railReserve ? (
                        <span
                            className="zenith-bundle__reserve"
                            style={{ width: railReserve }}
                            aria-hidden="true"
                        />
                    ) : null}
                </div>
            )}
            <div className="zenith-widget-card__body">
                {compact ? (
                    <div className="zenith-bundle__compact">
                        {t('dashboard.bundle.compact', { name: label, size: SIZE_LABEL[size] })}
                    </div>
                ) : Body ? (
                    <Body size={size} />
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
    expanded: boolean;
    editing: boolean;
    /**
     * Height of the cell before expansion, in px. The active widget keeps it
     * while expanded — it's the anchor that shows the bundle stayed put.
     */
    baseHeight: number;
    onSetActive: (widgetId: string) => void;
    onToggleExpanded: () => void;
    /** Expanded view only, and only while arranging. */
    onExtract?: (widgetId: string) => void;
    onReorder?: (widgetId: string, index: number) => void;
}

/**
 * A bundle in its cell.
 *
 * At rest it *is* the active widget — same card, same header, no second frame
 * around it. What marks it as a bundle is two small things: the rail of pips in
 * the header, and the shoulder peeking out below the bottom edge (which lives
 * in the grid's gap and so costs the widget no space at all).
 *
 * Expanded, the active widget stays exactly where it was — it's the anchor that
 * shows the bundle didn't move — and the others appear beneath it as sections
 * divided by hairlines.
 *
 * Design: `Zenith Bundles.dc.html`, model C.
 */
export const BundleCard: FC<BundleCardProps> = ({
    bundle,
    defsById,
    ctx,
    size,
    unsupported,
    expanded,
    editing,
    baseHeight,
    onSetActive,
    onToggleExpanded,
    onExtract,
    onReorder,
}) => {
    const t = useTranslation();
    const reduced = useReducedMotion();
    const members = bundle.members;

    const { layers, targetId, layerRef, switchTo, step } = useBundleSwitch({
        members,
        activeId: bundle.activeId,
        onCommit: onSetActive,
    });

    const swipeStart = useRef<{ x: number; y: number } | null>(null);
    const sectionsRef = useRef<HTMLDivElement>(null);

    /** Sections cascade in on expand; on collapse they leave bottom-up. */
    useLayoutEffect(() => {
        const host = sectionsRef.current;
        if (!host || !expanded) return;
        const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-bundle-row]'));
        rows.forEach((row, i) => {
            row.getAnimations().forEach((a) => a.cancel());
            if (reduced) {
                row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, fill: 'both' });
                return;
            }
            row.animate(
                [
                    { opacity: 0, transform: 'translateY(8px)' },
                    { opacity: 1, transform: 'translateY(0px)' },
                ],
                { duration: 200, delay: Math.min(i * 40, 200), easing: EASE.out, fill: 'both' }
            );
        });
    }, [expanded, reduced, members]);

    const onPointerDown = (e: React.PointerEvent) => {
        // Arranging owns the pointer (that's a drag), and an expanded bundle
        // shows everything already — there's nothing to swipe to.
        if (editing || expanded || e.pointerType === 'mouse') return;
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
            case 'Enter':
                e.preventDefault();
                onToggleExpanded();
                break;
            case 'Escape':
                if (expanded) {
                    e.preventDefault();
                    onToggleExpanded();
                }
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
    // widget's own title can spare, and the full list lives in the expansion.
    const shown = members.slice(0, BUNDLE_MAX_PIPS);
    const overflow = members.length - shown.length;
    const railWidth = shown.length * 9 + 8 + (overflow > 0 ? 22 : 0);

    const others = members.filter((id) => id !== targetId);
    const label = (id: string) => defsById.get(id)?.title ?? prettifyWidgetId(id);

    return (
        <div
            className={`zenith-bundle ${expanded ? 'is-expanded' : ''}`}
            role="group"
            aria-roledescription={t('dashboard.bundle.role')}
            aria-label={bundle.name || t.plural('dashboard.bundle.count', members.length)}
            tabIndex={editing ? undefined : 0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
            style={{ '--zenith-bundle-base': `${baseHeight}px` } as CSSProperties}
        >
            {/* The shoulder sits in the grid gap, below the card — it marks a
                bundle without taking a pixel from the widget. Two at most:
                deeper piles stop reading as depth and start reading as noise. */}
            <span className="zenith-bundle__shoulder" aria-hidden="true" />
            {members.length > 2 && (
                <span className="zenith-bundle__shoulder is-second" aria-hidden="true" />
            )}

            <div className="zenith-bundle__card">
                <div className="zenith-bundle__stage" style={{ '--zenith-bundle-rail': `${railWidth}px` } as CSSProperties}>
                    {/* Keyed by widget id, never by slot — see `BundleSwitch.layers`. */}
                    {layers.map((id) => (
                        <div
                            className={`zenith-bundle__layer ${id === targetId ? '' : 'is-leaving'}`}
                            key={id}
                            ref={layerRef(id)}
                        >
                            {renderMember(id, railWidth)}
                        </div>
                    ))}

                    <div className="zenith-bundle__rail">
                        {!expanded && (
                            <div className="zenith-bundle__pips" role="tablist" aria-label={t('dashboard.bundle.role')}>
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
                        )}
                        <button
                            className="zenith-bundle__toggle"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpanded();
                            }}
                            aria-expanded={expanded}
                            aria-label={t(expanded ? 'dashboard.bundle.collapse' : 'dashboard.bundle.expand')}
                            title={t(expanded ? 'dashboard.bundle.collapse' : 'dashboard.bundle.expand')}
                        >
                            {expanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                        </button>
                    </div>
                </div>

                {expanded && (
                    <div className="zenith-bundle__sections" ref={sectionsRef}>
                        {others.map((id, i) => (
                            <div className="zenith-bundle__row" data-bundle-row key={id}>
                                {editing && (
                                    <span
                                        className="zenith-bundle__grip"
                                        aria-hidden="true"
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <GripVertical size={13} />
                                    </span>
                                )}
                                <div className="zenith-bundle__row-body">{renderMember(id, 52)}</div>
                                <div className="zenith-bundle__row-actions">
                                    {editing && onReorder && i > 0 && (
                                        <button
                                            className="zenith-bundle__row-btn"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={() => onReorder(id, members.indexOf(id) - 1)}
                                            aria-label={t('dashboard.bundle.moveUp')}
                                            title={t('dashboard.bundle.moveUp')}
                                        >
                                            <ArrowUp size={12} />
                                        </button>
                                    )}
                                    {onExtract && (
                                        <button
                                            className="zenith-bundle__row-btn"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={() => onExtract(id)}
                                            aria-label={t('dashboard.bundle.extract')}
                                            title={t('dashboard.bundle.extract')}
                                        >
                                            <CornerUpRight size={12} />
                                        </button>
                                    )}
                                    <button
                                        className="zenith-bundle__row-btn"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={() => switchTo(id)}
                                        aria-label={t('dashboard.bundle.bringToTop')}
                                        title={t('dashboard.bundle.bringToTop')}
                                    >
                                        <ArrowUpToLine size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
