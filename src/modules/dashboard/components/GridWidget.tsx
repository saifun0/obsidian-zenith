import React, { useEffect, useRef, type CSSProperties, type FC } from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import { prettifyWidgetId } from '../widgets';
import type { DashboardWidgetContext, DashboardWidgetDefinition } from '../widgets';
import { useTranslation } from '../../../core/i18n';

/** Travel that turns a tap into a drag. Below it, a press is a click. */
const TAP_SLOP_PX = 6;

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
    /**
     * This card's layout id. The same as the widget's own id for the first
     * copy; `picture.frame#2` and up for the rest. It is what the widget's own
     * settings are stored under, so it goes to both faces of the card.
     */
    instanceId: string;
    ctx: DashboardWidgetContext;
    /** Absolute placement (grid mode) or plain height (stacked mode). */
    style: CSSProperties;
    editing?: boolean;
    dragging?: boolean;
    /** Pointer handlers from `useGridDrag`. */
    dragProps?: Partial<React.ComponentProps<'div'>>;
    /** Showing its settings instead of itself. */
    flipped?: boolean;
    /** Turn the card over, or back. */
    onFlip?: (flipped: boolean) => void;
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
    /** Extra controls appended to the settings face — the bundle inspector. */
    panelExtra?: React.ReactNode;
}

/**
 * A single widget positioned on the dashboard grid. The card always fills its
 * cell exactly — that's what makes neighbouring widgets line up — so the body
 * scrolls internally when the content is taller than the chosen size preset.
 *
 * While arranging, the cell is a two-sided card: the widget on the front, its
 * settings on the back, and a tap turns it over. They used to live in a pill
 * floating above the card's corner, which had to stay small enough not to cover
 * the neighbours — so the width and height steppers were two-character buttons,
 * and a bundle's inspector had to grow a second, block-shaped variant of the
 * same panel to fit at all. The back of the card is exactly as wide as the
 * widget, always, and it costs the dashboard no space when it is not open.
 */
export const GridWidget: FC<GridWidgetProps> = ({
    def,
    instanceId,
    ctx,
    style,
    editing = false,
    dragging = false,
    dragProps,
    flipped = false,
    onFlip,
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
    const Settings = def.settings;
    const title = def.title ?? prettifyWidgetId(def.id);

    const press = useRef<{ x: number; y: number } | null>(null);
    const front = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLDivElement>(null);

    /* A face keeps existing while it turns away — unmounting its content on the
       way out would empty it in full view — so whichever one is facing back is
       taken out of the tab order and out of the pointer's reach instead. Hiding
       it is not enough: a bundle's pips stay live on the front, and would
       otherwise still be reachable by Tab from behind the settings. */
    useEffect(() => {
        const turn = (el: HTMLElement | null, away: boolean) => {
            if (!el) return;
            if (away) el.setAttribute('inert', '');
            else el.removeAttribute('inert');
        };
        turn(front.current, flipped);
        turn(back.current, !flipped);
    }, [flipped]);

    const {
        onPointerDown: dragDown,
        onPointerMove: dragMove,
        onPointerUp: dragUp,
        onPointerCancel: dragCancel,
        ...restDragProps
    } = dragProps ?? {};

    /* A press is a drag or a tap, and which one it was is only known on release.
       Controls that sit on the card — the badges, a bundle's pips — stop
       `pointerdown` from reaching here, so a press that started on one never
       records a start and can never be read as a tap on the card. */
    const pointerProps =
        flipped || !editing
            ? {}
            : {
                  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
                      press.current = { x: e.clientX, y: e.clientY };
                      dragDown?.(e);
                  },
                  onPointerMove: dragMove,
                  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
                      dragUp?.(e);
                      const from = press.current;
                      press.current = null;
                      if (!from || !onFlip) return;
                      if (Math.abs(e.clientX - from.x) > TAP_SLOP_PX) return;
                      if (Math.abs(e.clientY - from.y) > TAP_SLOP_PX) return;
                      onFlip(true);
                  },
                  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
                      press.current = null;
                      dragCancel?.(e);
                  },
              };

    const stepper = (
        label: string,
        value: React.ReactNode,
        hint: string,
        onLess: () => void,
        onMore: () => void,
        canLess: boolean,
        canMore: boolean,
        lessLabel: string,
        moreLabel: string
    ) => (
        <div className="zenith-widget-settings__row">
            <span className="zenith-widget-settings__label">{label}</span>
            <span className="zenith-widget-settings__stepper">
                <button
                    onClick={onLess}
                    disabled={!canLess}
                    aria-label={lessLabel}
                    title={lessLabel}
                >
                    −
                </button>
                <span className="zenith-widget-settings__value" title={hint}>
                    {value}
                </span>
                <button
                    onClick={onMore}
                    disabled={!canMore}
                    aria-label={moreLabel}
                    title={moreLabel}
                >
                    +
                </button>
            </span>
        </div>
    );

    return (
        <div
            className={`zenith-grid__item ${editing ? 'is-editing' : ''} ${
                dragging ? 'is-dragging' : ''
            } ${flipped ? 'is-flipped' : ''}`}
            style={style}
            data-widget-id={def.id}
            {...restDragProps}
            {...pointerProps}
        >
            {/* Removing only takes the widget off the grid — it stays available
                in the add panel, so there's nothing to confirm. */}
            {editing && !dragging && !flipped && (
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

            {/* Tapping the card anywhere turns it over; this badge says so, and
                is what a keyboard can reach. */}
            {editing && !dragging && !flipped && (
                <button
                    className="zenith-grid__configure"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onFlip?.(true)}
                    aria-label={t('dashboard.widget.settings', { name: title })}
                    title={t('dashboard.widget.settings', { name: title })}
                >
                    <SlidersHorizontal size={12} strokeWidth={2.5} />
                </button>
            )}

            <div className="zenith-widget-flip__front" ref={front} aria-hidden={flipped}>
                {children ?? (
                    <div className="zenith-widget-card">
                        {/* Every widget wears the same header. A widget that
                            thinks its own hero line says enough still gets one,
                            because a dashboard of cards that disagree about
                            whether they have a title reads as unfinished rather
                            than as minimal. */}
                        <div className="zenith-widget-card__header">
                            <DynamicIcon name={def.icon} size={15} />
                            <span className="zenith-widget-card__title">{title}</span>
                        </div>
                        <div className="zenith-widget-card__body">
                            {Body ? (
                                <Body size={size} instanceId={instanceId} />
                            ) : (
                                <DomWidgetHost def={def} ctx={ctx} />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editing && (
                <div className="zenith-widget-settings" ref={back} aria-hidden={!flipped}>
                    <div className="zenith-widget-settings__header">
                        <DynamicIcon name={def.icon} size={14} />
                        <span className="zenith-widget-settings__title">{title}</span>
                        <button
                            className="zenith-widget-settings__done"
                            onClick={() => onFlip?.(false)}
                            aria-label={t('dashboard.widget.settingsDone')}
                            title={t('dashboard.widget.settingsDone')}
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>

                    <div className="zenith-widget-settings__body">
                        {/* Presets set a shape; the steppers set an exact size.
                            Without them the column count would have nothing to
                            act on, since every preset is either half the grid or
                            all of it. */}
                        {sizes.length > 1 && (
                            <div className="zenith-widget-settings__row">
                                <span className="zenith-widget-settings__label">
                                    {t('dashboard.widget.preset')}
                                </span>
                                <span className="zenith-widget-settings__presets">
                                    {sizes.map((s) => (
                                        <button
                                            key={s}
                                            className={
                                                s === size && !customWidth ? 'is-active' : ''
                                            }
                                            onClick={() => onResize(s)}
                                            aria-pressed={s === size && !customWidth}
                                        >
                                            {SIZE_LABEL[s]}
                                        </button>
                                    ))}
                                </span>
                            </div>
                        )}

                        {stepper(
                            t('dashboard.widget.width'),
                            `${width}/${columns}`,
                            t('dashboard.widget.widthHint'),
                            () => onSetWidth(width - 1),
                            () => onSetWidth(width + 1),
                            width > 1,
                            width < columns,
                            t('dashboard.widget.narrower'),
                            t('dashboard.widget.wider')
                        )}

                        {stepper(
                            t('dashboard.widget.height'),
                            t.plural('dashboard.widget.rows', height),
                            t('dashboard.widget.heightHint'),
                            () => onSetHeight(height - 1),
                            () => onSetHeight(height + 1),
                            height > 1,
                            height < maxRows,
                            t('dashboard.widget.shorter'),
                            t('dashboard.widget.taller')
                        )}

                        {/* The widget's own settings, under the ones every
                            widget has. They belong to THIS card rather than to
                            the widget, which is why they are here and not on a
                            module's settings page: that page has no way to say
                            which of three pictures is being talked about. */}
                        {Settings && <Settings instanceId={instanceId} />}

                        {panelExtra}
                    </div>
                </div>
            )}
        </div>
    );
};
