import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type FC,
} from 'react';
import { MoreHorizontal, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import { widgetLabel } from '../widgets';
import type { DashboardWidgetDefinition } from '../widgets';
import { useTranslation } from '../../../core/i18n';
import { useWidgetBodiesReady } from '../startupGate';
import { useZenithStore } from '../../../store';
import { useLongPress } from '../../../core/useLongPress';
import { CARD_NAME_KEY, MAX_CARD_NAME, cardNameOf, useWidgetConfig } from '../widgetConfig';

/** Travel that turns a tap into a drag. Below it, a press is a click. */
const TAP_SLOP_PX = 6;

/** How long the card takes to turn, and so how long its back outlives the turn. */
const FLIP_MS = 460;

/** A bucket read only for the card's own name; the widget reads the rest. */
const asIs = (raw: Record<string, unknown> | undefined): Record<string, unknown> => raw ?? {};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

interface GridWidgetProps {
    def: DashboardWidgetDefinition;
    /**
     * This card's layout id. The same as the widget's own id for the first
     * copy; `picture.frame#2` and up for the rest. It is what the widget's own
     * settings are stored under, so it goes to both faces of the card.
     */
    instanceId: string;
    /** Absolute placement (grid mode) or plain height (stacked mode). */
    style: CSSProperties;
    editing?: boolean;
    dragging?: boolean;
    /** Pointer handlers from `useGridDrag`. */
    dragProps?: Partial<React.ComponentProps<'div'>>;
    /** Showing its settings instead of itself. */
    flipped?: boolean;
    /** Just added from the gallery: marked for a moment so it can be found. */
    fresh?: boolean;
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
 * The cell is a two-sided card: the widget on the front, its settings on the
 * back. While arranging, a tap turns it over; the rest of the time the ⋯ in
 * its header does — or a long press on the header, on a phone — so setting a
 * card up does not mean putting the whole board into arrange mode first. They used to live in a pill
 * floating above the card's corner, which had to stay small enough not to cover
 * the neighbours — so the width and height steppers were two-character buttons,
 * and a bundle's inspector had to grow a second, block-shaped variant of the
 * same panel to fit at all. The back of the card is exactly as wide as the
 * widget, always, and it costs the dashboard no space when it is not open.
 */
export const GridWidget: FC<GridWidgetProps> = ({
    def,
    instanceId,
    style,
    editing = false,
    dragging = false,
    dragProps,
    flipped = false,
    fresh = false,
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
    const ready = useWidgetBodiesReady();
    const Body = def.component;
    const Settings = def.settings;
    // The user's own name for this card, when they gave it one. Only a card
    // that can be placed more than once can be named: one clock needs no name
    // to tell it from the others.
    const nameable = !!def.multiple;
    const ownName = useZenithStore((s) =>
        nameable ? cardNameOf(s.settings.widgetConfig, instanceId) : ''
    );
    const [, setBucket] = useWidgetConfig(instanceId, asIs);
    const title = ownName || widgetLabel(def, t);

    const front = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLDivElement>(null);

    /* Turning the card is two steps, not one. The back does not exist until it
       is asked for — a board of twelve cards should not carry twelve settings
       forms — so it is mounted first, facing away, and only then turned;
       mounted already turned it would simply appear. Turned back, it stays for
       as long as the turn takes and is then let go. While arranging it is
       always there, as it was. */
    const [backMounted, setBackMounted] = useState(flipped);
    const [turned, setTurned] = useState(false);
    useEffect(() => {
        if (flipped) {
            setBackMounted(true);
            return;
        }
        setTurned(false);
        const timer = window.setTimeout(() => setBackMounted(false), FLIP_MS + 40);
        return () => window.clearTimeout(timer);
    }, [flipped]);
    const hasBack = editing || backMounted;

    /* The second step. Reading the back's width makes the browser work out
       where it stands *now*, facing away — which is what the turn then starts
       from. Waiting a frame would do the same on a visible page and nothing at
       all on a hidden one, where frames do not come. */
    useLayoutEffect(() => {
        if (!flipped || turned || !back.current) return;
        void back.current.offsetWidth;
        setTurned(true);
    }, [flipped, turned, hasBack]);

    // Outside arrange mode the header is the way to the back: a right-click,
    // or a long press where there is no pointer to hover the ⋯ with.
    const headerPress = useLongPress(
        () => onFlip?.(true),
        (e) => {
            e.preventDefault();
            onFlip?.(true);
        }
    );

    const press = useRef<{ x: number; y: number } | null>(null);

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
        turn(front.current, turned);
        turn(back.current, !turned);
    }, [turned, hasBack]);

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
            } ${turned ? 'is-flipped' : ''} ${hasBack ? 'has-back' : ''} ${fresh ? 'is-new' : ''}`}
            style={style}
            data-widget-id={def.id}
            data-instance-id={instanceId}
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

            <div className="zenith-widget-flip__front" ref={front} aria-hidden={turned}>
                {children ?? (
                    <div className="zenith-widget-card">
                        {/* Every widget wears the same header. A widget that
                            thinks its own hero line says enough still gets one,
                            because a dashboard of cards that disagree about
                            whether they have a title reads as unfinished rather
                            than as minimal. */}
                        <div
                            className="zenith-widget-card__header"
                            {...(editing
                                ? {}
                                : {
                                      onContextMenu: headerPress.onContextMenu,
                                      onPointerDown: headerPress.onPointerDown,
                                      onPointerMove: headerPress.onPointerMove,
                                      onPointerUp: headerPress.onPointerUp,
                                      onPointerCancel: headerPress.onPointerCancel,
                                  })}
                        >
                            <DynamicIcon name={def.icon} size={13} />
                            <span className="zenith-widget-card__title">{title}</span>
                            {!editing && onFlip && (
                                <button
                                    type="button"
                                    className="zenith-widget-card__more"
                                    onClick={() => onFlip(true)}
                                    aria-label={t('dashboard.widget.settings', { name: title })}
                                    title={t('dashboard.widget.settings', { name: title })}
                                >
                                    <MoreHorizontal size={14} />
                                </button>
                            )}
                        </div>
                        <div className="zenith-widget-card__body">
                            {ready && Body && <Body size={size} instanceId={instanceId} />}
                        </div>
                    </div>
                )}
            </div>

            {hasBack && (
                <div className="zenith-widget-settings" ref={back} aria-hidden={!turned}>
                    <div className="zenith-widget-settings__header">
                        <DynamicIcon name={def.icon} size={13} />
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
                        {/* What this card is called, for the cards a board
                            may hold several of. Empty means the widget's own
                            name — which is what the field shows, greyed. */}
                        {nameable && (
                            <div className="zenith-widget-settings__row">
                                <span className="zenith-widget-settings__label">
                                    {t('dashboard.widget.name')}
                                </span>
                                <input
                                    type="text"
                                    className="zenith-input zenith-input--sm zenith-widget-settings__name"
                                    value={ownName}
                                    maxLength={MAX_CARD_NAME}
                                    placeholder={widgetLabel(def, t)}
                                    aria-label={t('dashboard.widget.name')}
                                    onChange={(e) => setBucket({ [CARD_NAME_KEY]: e.target.value })}
                                    onPointerDown={stop}
                                />
                            </div>
                        )}

                        {/* The widget's own settings. They belong to THIS card
                            rather than to the widget, which is why they are
                            here and not on a module's settings page: that page
                            has no way to say which of three pictures is being
                            talked about. */}
                        {Settings && <Settings instanceId={instanceId} />}

                        {/* How big the card is belongs to arranging the board,
                            so it is here only while that is what is being done.
                            Turned over on its own, the card shows what it is
                            for: its name and what is in it. */}
                        {editing && (
                            <>
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
                                                        s === size && !customWidth
                                                            ? 'is-active'
                                                            : ''
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
                            </>
                        )}

                        {panelExtra}

                        {/* The back is reachable without arranging the board,
                            so taking the card off it has to be as well. It only
                            leaves the board — it stays in the gallery — so
                            there is nothing to confirm. */}
                        <button
                            type="button"
                            className="zenith-widget-settings__remove"
                            onClick={onRemove}
                        >
                            <Trash2 size={12} />
                            {t('dashboard.widget.removeFromDashboard')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
