import React, { useEffect, useRef, type CSSProperties, type FC } from 'react';
import { X } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import { prettifyWidgetId } from '../widgets';
import type { DashboardWidgetContext, DashboardWidgetDefinition } from '../widgets';
import { useTranslation } from '../../../core/i18n';

/**
 * Host for framework-agnostic (DOM) widgets contributed by third-party modules.
 * Gives the module a plain element to render into and cleans up on unmount.
 *
 * Exported because bundles render members themselves and would otherwise drop
 * every third-party widget the moment it was put in one.
 */
export const DomWidgetHost: FC<{ def: DashboardWidgetDefinition; ctx: DashboardWidgetContext }> = ({
    def,
    ctx,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || !def.mount) return;
        let cleanup: void | (() => void);
        try {
            cleanup = def.mount(el, ctx);
        } catch (err) {
            console.error(`Zenith: widget "${def.id}" failed to mount`, err);
        }
        return () => {
            try {
                if (typeof cleanup === 'function') cleanup();
            } catch (err) {
                console.error(`Zenith: widget "${def.id}" cleanup failed`, err);
            }
            el.innerHTML = '';
        };
    }, [def, ctx]);

    return <div ref={ref} className="zenith-widget__dom" />;
};

interface GridWidgetProps {
    def: DashboardWidgetDefinition;
    ctx: DashboardWidgetContext;
    /** Absolute placement (grid mode) or plain height (stacked mode). */
    style: CSSProperties;
    editing?: boolean;
    dragging?: boolean;
    /** Pointer handlers from `useGridDrag`. */
    dragProps?: Partial<React.ComponentProps<'div'>>;
    /** Preset the widget is currently rendered at. */
    size: WidgetSize;
    /** Presets this widget offers, smallest first. */
    sizes: readonly WidgetSize[];
    /** Current width in columns, and the grid's column count. */
    width: number;
    columns: number;
    /** Current height in rows, and the ceiling. */
    height: number;
    maxRows: number;
    /** The size came from the steppers, not from the preset. */
    customWidth: boolean;
    onResize: (size: WidgetSize) => void;
    onSetWidth: (w: number) => void;
    onSetHeight: (h: number) => void;
    onRemove: () => void;
    /**
     * Replaces the card body entirely. Used by bundles, which draw their own
     * cards — one per member — inside the cell this component provides.
     */
    children?: React.ReactNode;
    /** Extra controls appended to the size panel — the bundle inspector. */
    panelExtra?: React.ReactNode;
}

/**
 * A single widget positioned on the dashboard grid. The card always fills its
 * cell exactly — that's what makes neighbouring widgets line up — so the body
 * scrolls internally when the content is taller than the chosen size preset.
 */
export const GridWidget: FC<GridWidgetProps> = ({
    def,
    ctx,
    style,
    editing = false,
    dragging = false,
    dragProps,
    size,
    sizes,
    width,
    columns,
    height,
    maxRows,
    customWidth,
    onResize,
    onSetWidth,
    onSetHeight,
    onRemove,
    children,
    panelExtra,
}) => {
    const t = useTranslation();
    const Body = def.component;

    return (
        <div
            className={`zenith-grid__item ${editing ? 'is-editing' : ''} ${
                dragging ? 'is-dragging' : ''
            }`}
            style={style}
            data-widget-id={def.id}
            {...dragProps}
        >
            {/* Removing only takes the widget off the grid — it stays available
                in the add panel, so there's nothing to confirm. */}
            {editing && !dragging && (
                <button
                    className="zenith-grid__remove"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onRemove}
                    aria-label={t('dashboard.widget.removeFromDashboard')}
                    title={t('dashboard.widget.removeFromDashboard')}
                >
                    <X size={13} strokeWidth={3} />
                </button>
            )}

            {/* Size controls sit outside the card body, which is inert while
                arranging, and swallow pointerdown so tapping them can't start a drag.
                The presets set a shape; the span sets an exact width in columns —
                without it the column count would have nothing to act on, since
                every preset is either half the grid or all of it. */}
            {editing && !dragging && (
                <div
                    className={`zenith-grid__sizes ${panelExtra ? 'has-extra' : ''}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    role="group"
                    aria-label={t('dashboard.grid.columns')}
                >
                    <div className="zenith-grid__sizes-row">
                    {sizes.length > 1 &&
                        sizes.map((s) => (
                            <button
                                key={s}
                                className={`zenith-grid__size ${
                                    s === size && !customWidth ? 'is-active' : ''
                                }`}
                                onClick={() => onResize(s)}
                                aria-pressed={s === size}
                                title={`Size: ${SIZE_LABEL[s]}`}
                            >
                                {SIZE_LABEL[s]}
                            </button>
                        ))}

                    <span className="zenith-grid__span">
                        <button
                            className="zenith-grid__size"
                            onClick={() => onSetWidth(width - 1)}
                            disabled={width <= 1}
                            aria-label={t('dashboard.widget.narrower')}
                            title={t('dashboard.widget.narrower')}
                        >
                            −
                        </button>
                        <span className="zenith-grid__span-value" title={t('dashboard.widget.widthHint')}>
                            {width}/{columns}
                        </span>
                        <button
                            className="zenith-grid__size"
                            onClick={() => onSetWidth(width + 1)}
                            disabled={width >= columns}
                            aria-label={t('dashboard.widget.wider')}
                            title={t('dashboard.widget.wider')}
                        >
                            +
                        </button>
                    </span>

                    <span className="zenith-grid__span">
                        <button
                            className="zenith-grid__size"
                            onClick={() => onSetHeight(height - 1)}
                            disabled={height <= 1}
                            aria-label={t('dashboard.widget.shorter')}
                            title={t('dashboard.widget.shorter')}
                        >
                            −
                        </button>
                        <span className="zenith-grid__span-value" title={t('dashboard.widget.heightHint')}>
                            {height}
                            <span className="zenith-grid__span-unit">r</span>
                        </span>
                        <button
                            className="zenith-grid__size"
                            onClick={() => onSetHeight(height + 1)}
                            disabled={height >= maxRows}
                            aria-label={t('dashboard.widget.taller')}
                            title={t('dashboard.widget.taller')}
                        >
                            +
                        </button>
                    </span>
                    </div>

                    {panelExtra}
                </div>
            )}

            {children ?? (
                <div className="zenith-widget-card">
                    {/* Every widget wears the same header. A widget that thinks
                        its own hero line says enough still gets one, because a
                        dashboard of cards that disagree about whether they have
                        a title reads as unfinished rather than as minimal. */}
                    <div className="zenith-widget-card__header">
                        <DynamicIcon name={def.icon} size={15} />
                        <span className="zenith-widget-card__title">
                            {def.title ?? prettifyWidgetId(def.id)}
                        </span>
                    </div>
                    <div className="zenith-widget-card__body">
                        {Body ? <Body size={size} /> : <DomWidgetHost def={def} ctx={ctx} />}
                    </div>
                </div>
            )}
        </div>
    );
};
