import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation, type Translator } from '../../../core/i18n';
import { moduleNameKey } from '../../../core/moduleLabels';
import { useZenithStore } from '../../../store';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { GridWidget } from '../../../modules/dashboard/components/GridWidget';
import { rowsFor } from '../../../modules/dashboard/grid/gridEngine';
import {
    CANVAS_WIDTH,
    MAX_ROWS,
    SIZE_LABEL,
    normalizeGridConfig,
    pxHeight,
    sizeDims,
    type GridConfig,
    type WidgetSize,
} from '../../../modules/dashboard/grid/gridTypes';
import {
    useDashboardWidgets,
    widgetLabel,
    widgetSizes,
    type DashboardWidgetDefinition,
} from '../../../modules/dashboard/widgets';
import { Segmented, Select } from '../../controls';

/**
 * Every dashboard widget at every size it offers, on one page.
 *
 * A widget is drawn three ways and lives on a board that shows one of them, so
 * checking a change to a card meant resizing it twice on the real dashboard —
 * and checking a change to what all cards share meant doing that for each of
 * twenty. Here they stand side by side, in the board's own card, at the board's
 * own measures and on the vault's own data, the way the gallery next door does
 * for controls.
 *
 * Two things can be asked of it: the pane the cards are drawn for — the board,
 * or a phone's one column — and whether a card wider than this window is drawn
 * to scale or at full size with a scrollbar. To scale is the default, because
 * the window the settings live in is narrower than a board.
 *
 * And a third, since a widget lays itself out from the room it has rather than
 * from its preset's name: the cell. A preset is only the cell a card starts
 * with — its width and its height are set apart from it on the card's back —
 * so the width and the height can be set here too, and every widget is then
 * drawn once, in that cell. A third of the board and one row tall is a cell no
 * preset names, and one a board is full of.
 *
 * What it does not show is a widget's own states — empty, erroring, set up some
 * other way. Those depend on what is in the vault and cannot be listed; the
 * cards here are the ones the dashboard would draw right now.
 *
 * The little labels naming each size are deliberately NOT translated: they are
 * the preset's name and its cells, as the layout stores them.
 */

/** A phone's column: a 375px screen less the board's inset either side. */
const PHONE_WIDTH = 343;

/** The room between two specimens, and what a specimen keeps for its caption. */
const SPECIMEN_GAP = 16;

/** The module a widget is from — the namespace of its id, as in the dashboard's gallery. */
function moduleOf(id: string): string {
    const [head, ...rest] = id.split('.');
    return rest.length > 0 ? head : 'other';
}

function moduleLabel(key: string, t: Translator): string {
    const nameKey = moduleNameKey(key);
    if (t.has(nameKey)) return t(nameKey);
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, ' ');
}

/** The width of whatever the gallery is drawn in (0 until first measured). */
function useWidth<T extends HTMLElement>(ref: React.RefObject<T>): number {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        setWidth(el.clientWidth);
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            const next = el.clientWidth;
            setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return width;
}

const noop = () => {};

/** A width to draw every widget at, as a share of the board; `preset` leaves it to the preset. */
type WidthChoice = 'preset' | 'third' | 'half' | 'twoThirds' | 'full';
const WIDTH_CHOICES: readonly WidthChoice[] = ['preset', 'third', 'half', 'twoThirds', 'full'];
const WIDTH_SIGN: Record<Exclude<WidthChoice, 'preset'>, string> = {
    third: '⅓',
    half: '½',
    twoThirds: '⅔',
    full: '1',
};

/** That share, in whole columns of a grid of `columns`. */
function columnsOf(choice: Exclude<WidthChoice, 'preset'>, columns: number): number {
    const share = { third: 1 / 3, half: 1 / 2, twoThirds: 2 / 3, full: 1 }[choice];
    return Math.min(columns, Math.max(1, Math.round(columns * share)));
}

/** Heights offered, in rows. Zero is "as the preset has it". */
const HEIGHT_CHOICES: readonly number[] = [0, 1, 2, 3, 4, 6];

interface SpecimenProps {
    def: DashboardWidgetDefinition;
    size: WidgetSize;
    /** The cell's width in columns and height in rows, where they are not the preset's. */
    wide?: number;
    tall?: number;
    cfg: GridConfig;
    /** The width of the pane being drawn for. */
    pane: number;
    phone: boolean;
    scale: number;
}

/**
 * One widget at one size, in the card the board would give it.
 *
 * Its height is the board's too: a card of lines is drawn at the rows its
 * content needs — exactly its content's height on a phone — and never past the
 * height its preset gives it. That is state of its own, per specimen, because
 * the three sizes of one widget share an instance id and so would otherwise
 * report their heights under one name.
 */
const Specimen: FC<SpecimenProps> = ({ def, size, wide, tall, cfg, pane, phone, scale }) => {
    const [needed, setNeeded] = useState<number | null>(null);
    const onNeeded = useCallback((_id: string, px: number) => setNeeded(px), []);

    const preset = sizeDims(size, cfg.columns);
    const dims = { w: wide ?? preset.w, h: tall ?? preset.h };
    const column = (pane - (cfg.columns - 1) * cfg.gap) / cfg.columns;
    const width = phone ? pane : Math.round(dims.w * column + (dims.w - 1) * cfg.gap);
    const ceiling = pxHeight(dims.h, cfg.rowHeight, cfg.gap);
    const fitted =
        needed === null
            ? ceiling
            : phone
              ? Math.max(needed, 1)
              : pxHeight(rowsFor(needed, cfg.rowHeight, cfg.gap), cfg.rowHeight, cfg.gap);
    const height = def.autoHeight ? Math.min(ceiling, fitted) : ceiling;
    const fit = useMemo(
        () => (def.autoHeight ? { ceilingPx: ceiling, onNeeded } : null),
        [def.autoHeight, ceiling, onNeeded]
    );

    return (
        <figure className="zenith-debug__specimen" style={{ width: Math.round(width * scale) }}>
            <figcaption className="zenith-debug__demo-label">
                {wide === undefined && tall === undefined ? SIZE_LABEL[size] : ''}
                <em className="zenith-debug__demo-source">
                    {phone ? `${width}` : `${dims.w}/${cfg.columns}`} × {Math.round(height)}
                </em>
            </figcaption>
            {/* Scaled as a picture, laid out at full size: the card's own
                queries ask how big it is, and have to be told the truth. */}
            <div
                className="zenith-debug__specimen-box"
                style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
            >
                <GridWidget
                    def={def}
                    instanceId={def.id}
                    style={{
                        position: 'relative',
                        width,
                        height,
                        transform: scale === 1 ? undefined : `scale(${scale})`,
                        transformOrigin: '0 0',
                        transition: 'none',
                    }}
                    fit={fit}
                    canFit={!!def.autoHeight}
                    size={size}
                    sizes={[size]}
                    width={dims.w}
                    columns={cfg.columns}
                    height={dims.h}
                    maxRows={MAX_ROWS}
                    customWidth={false}
                    onResize={noop}
                    onSetWidth={noop}
                    onSetHeight={noop}
                    onRemove={noop}
                />
            </div>
        </figure>
    );
};

export const WidgetGallery: FC = () => {
    const t = useTranslation();
    const registered = useDashboardWidgets();
    const savedGrid = useZenithStore((s) => s.settings.dashboardGrid);
    const cfg = useMemo(() => normalizeGridConfig(savedGrid), [savedGrid]);

    const [module, setModule] = useState('all');
    const [pane, setPane] = useState<'board' | 'phone'>('board');
    const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
    const [widthChoice, setWidthChoice] = useState<WidthChoice>('preset');
    const [rows, setRows] = useState(0);

    const host = useRef<HTMLDivElement>(null);
    const room = useWidth(host);

    const groups = useMemo(() => {
        const byModule = new Map<string, DashboardWidgetDefinition[]>();
        for (const def of registered) {
            const key = moduleOf(def.id);
            byModule.set(key, [...(byModule.get(key) ?? []), def]);
        }
        return [...byModule.entries()]
            .map(([key, defs]) => ({ key, label: moduleLabel(key, t), defs }))
            .sort((a, b) => a.label.localeCompare(b.label, t.locale));
    }, [registered, t]);

    const variants = registered.reduce((n, def) => n + widgetSizes(def).sizes.length, 0);
    const shown = module === 'all' ? groups : groups.filter((g) => g.key === module);

    const phone = pane === 'phone';
    // A cell of one's own choosing: every widget once, in it, rather than once
    // per preset. On a phone a card is the column's width whatever it is set to.
    const wide = phone || widthChoice === 'preset' ? undefined : columnsOf(widthChoice, cfg.columns);
    const tall = rows > 0 ? rows : undefined;
    const custom = wide !== undefined || tall !== undefined;
    // The board the cards are drawn for: the canvas as it is set, or the
    // default where it is set to run to the edges of whatever pane it is in.
    const width = phone ? PHONE_WIDTH : cfg.maxWidth > 0 ? cfg.maxWidth : CANVAS_WIDTH;
    const scale = zoom === 'fit' && room > 0 ? Math.min(1, room / width) : 1;

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-debug__toolbar">
                <Select
                    value={module}
                    onChange={setModule}
                    options={[
                        { value: 'all', label: t('debug.widgets.all') },
                        ...groups.map((g) => ({ value: g.key, label: g.label })),
                    ]}
                />
                <Segmented
                    value={pane}
                    onChange={(v) => setPane(v as 'board' | 'phone')}
                    options={[
                        { value: 'board', label: t('debug.widgets.board'), icon: 'layout-dashboard' },
                        { value: 'phone', label: t('debug.widgets.phone'), icon: 'smartphone' },
                    ]}
                />
                <Select
                    value={widthChoice}
                    onChange={(v) => setWidthChoice(v as WidthChoice)}
                    options={WIDTH_CHOICES.map((choice) => ({
                        value: choice,
                        label: `${t('debug.widgets.width')}: ${
                            choice === 'preset' ? t('debug.widgets.preset') : WIDTH_SIGN[choice]
                        }`,
                    }))}
                />
                <Select
                    value={String(rows)}
                    onChange={(v) => setRows(Number(v))}
                    options={HEIGHT_CHOICES.map((n) => ({
                        value: String(n),
                        label: `${t('debug.widgets.height')}: ${
                            n === 0 ? t('debug.widgets.preset') : n
                        }`,
                    }))}
                />
                <Segmented
                    value={zoom}
                    onChange={(v) => setZoom(v as 'fit' | 'full')}
                    options={[
                        { value: 'fit', label: t('debug.widgets.fit') },
                        { value: 'full', label: '100%' },
                    ]}
                />
            </div>
            <div className="zenith-debug__note">
                {t('debug.widgets.count', { widgets: registered.length, variants })}
            </div>

            <div className="zenith-debug__widgets" ref={host}>
                {registered.length === 0 && (
                    <div className="zenith-debug__note">{t('debug.widgets.none')}</div>
                )}
                {/* Not before the first measure: a card drawn to a guessed
                    scale would be drawn twice. */}
                {room > 0 &&
                    shown.map((group) => (
                        <section className="zenith-debug__section" key={group.key}>
                            <div className="zenith-settings__section-label">{group.label}</div>
                            {group.defs.map((def) => (
                                <div className="zenith-debug__widget" key={def.id}>
                                    <div className="zenith-debug__widget-head">
                                        <DynamicIcon name={def.icon} size={14} />
                                        <span className="zenith-debug__row-title">
                                            {widgetLabel(def, t)}
                                        </span>
                                        <span className="zenith-debug__row-id">{def.id}</span>
                                    </div>
                                    <div
                                        className="zenith-debug__specimens"
                                        style={{ gap: SPECIMEN_GAP }}
                                    >
                                        {(custom
                                            ? [widgetSizes(def).defaultSize]
                                            : widgetSizes(def).sizes
                                        ).map((size) => (
                                            <Specimen
                                                key={`${size}:${pane}:${wide ?? ''}:${tall ?? ''}`}
                                                def={def}
                                                size={size}
                                                wide={wide}
                                                tall={tall}
                                                cfg={cfg}
                                                pane={width}
                                                phone={phone}
                                                scale={scale}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </section>
                    ))}
            </div>
        </div>
    );
};
