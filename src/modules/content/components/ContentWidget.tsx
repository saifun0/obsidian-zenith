import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from 'react';
import { Notice } from 'obsidian';
import { ArrowRight, Library, Moon, Star } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useReducedMotion } from '../../../components/shared/useCrossFade';
import { useCountUp } from '../../../components/shared/useCountUp';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { resolveCover } from '../services/coverUrl';
import { useFeature } from '../../../core/useFeature';
import { bumpProgress } from '../services/contentActions';
import { buildContentShelf, shelfRows } from '../services/contentShelf';
import { STALE_DAYS } from '../services/contentStats';
import { formatProgress, progressPercent, shortUnit } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useContentMenu } from './useContentMenu';
import { ProgressPopover } from './ProgressPopover';
import { Meter } from '../../../components/shared';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import type { WidgetSize } from '../../dashboard/grid/gridTypes';

/**
 * ContentWidget — the dashboard face of the library.
 *
 * Three versions of this card have now existed. The first showed three counts
 * and a bare title, which answered nothing anybody would ask at a glance. The
 * second — this one's parent — added a status bar and a list of what was under
 * way, and was right about what to say and wrong about how much room it took to
 * say it: a fixed stack of five blocks, each as tall as its contents, ending
 * wherever it ended. On a library with one item in it the card was four rows of
 * chrome, one row of content, and three hundred pixels of nothing.
 *
 * So the card is a composition with a middle now. The thing you are most likely
 * to open — the item closest to finishing — is drawn large, with its artwork,
 * its meter and the action worth taking on it; the rest of the shelf is compact
 * rows under it; and the shelf is what grows when the card does.
 *
 * This version is about how much room the report at the top was taking and how
 * the shelf knows when to stop. The library used to be stated three times over
 * — a headline total, a proportional bar, and a legend restating the bar in
 * numbers — which is sixty pixels spent before the card mentions a single
 * thing you might read tonight. It is one line now, with the bar ruled under
 * it. And the number of rows was a constant counted against the card's height
 * on the day it was written: when the cards grew a title band, every preset
 * was one row too many, the shelf ran past the bottom, and the footer — drawn
 * after it — landed on top of the last row. The rows are measured now. See
 * `rowBudget`.
 *
 * Which item leads, and what fills the space when nothing is under way, is
 * decided in `buildContentShelf` — away from here, where it can be tested.
 */

/** What each preset shows. How MUCH it shows is measured; see `rowBudget`. */
interface WidgetLayout {
    /**
     * Rows to draw before the card has measured itself — a first paint, not a
     * layout. It used to be the answer, counted in pixels against the height
     * each preset had on the day it was written, and it went wrong the moment
     * anything above the card changed height.
     */
    rows: number;
    /** Draw the leading item large, with its artwork. */
    spotlight: boolean;
    /** The note beside the way out, for what the shelf cannot say. */
    stats: boolean;
}

const LAYOUT: Record<WidgetSize, WidgetLayout> = {
    sm: { rows: 1, spotlight: false, stats: false },
    md: { rows: 3, spotlight: true, stats: true },
    lg: { rows: 5, spotlight: true, stats: true },
};

const STATUS_META: { key: string; i18n: string; color: string }[] = [
    { key: 'in-progress', i18n: 'status.inProgress', color: 'var(--zenith-info)' },
    { key: 'completed', i18n: 'status.completed', color: 'var(--zenith-success)' },
    { key: 'backlog', i18n: 'status.backlog', color: 'var(--zenith-text-faint)' },
    { key: 'dropped', i18n: 'status.dropped', color: 'var(--zenith-danger)' },
];

/** How long a "+1" floats over the row that earned it. Matches the keyframe. */
const CHEER_MS = 900;

/**
 * Fallbacks for the row budget, used only until the card has drawn a row it
 * can measure. They are a first paint, not a layout — see `rowBudget`.
 */
const ROW_H = 44;
/** `gap` on `.zenith-cw__list`. */
const ROW_GAP = 2;
/** A section title and the gap under it. */
const SECTION_H = 26;

/**
 * Everything a row needs to draw itself, worked out once.
 *
 * Both representations — the spotlight and the compact row — ask the same six
 * questions of an item, and they have to answer them identically or the same
 * item reads as two different states depending on where it is on the card.
 */
interface RowFacts {
    type: ContentTypeConfig;
    cover: string | null;
    /** 0–100, or null when the item has no measurable total. */
    pct: number | null;
    /** "141 / 366 ep", or the length of something not yet started. */
    value: string;
    /** Year and creator, for a row with no meter to draw. */
    sub: string;
    canBump: boolean;
}

export const ContentWidget: React.FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const quickOn = useFeature('content.quickIncrement');
    const items = useZenithStore((s) => s.contentItems);
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const setFocusContentId = useZenithStore((s) => s.setFocusContentId);
    const animations = useZenithStore((s) => s.settings.uiAnimations);
    const reduced = useReducedMotion();
    const animate = animations && !reduced;

    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);
    const layout = LAYOUT[size];

    // `now` is read once per render rather than per item: a shelf where two
    // rows disagree about what "today" is has no consistent answer for
    // anything measured in days.
    const shelf = useMemo(
        () => buildContentShelf(items, Date.now(), { staleDays: STALE_DAYS }),
        [items]
    );

    /**
     * How many rows there is actually room for — measured, not budgeted.
     *
     * `LAYOUT` used to say: three rows on `md`, five on `lg`. Those numbers
     * were counted against the height each preset had at the time, and the day
     * the card grew a title band above it they were all one row too many. The
     * shelf ran past the bottom of the card and the footer, which is drawn
     * after it, landed on top of the last row. The row budget cannot be a
     * constant, because nothing about the card's height is one: the user drags
     * it, the density setting rescales it, the chrome above it changes.
     *
     * So the rows are measured against the element that holds them, which is
     * what the card has left after the spotlight. Safe from feeding back on
     * itself: that element takes the leftover height (`flex: 1 1 0`), so it is
     * the same size whether it ends up holding two rows or six, and a row's
     * own height does not depend on how many there are.
     */
    const rowsRef = useRef<HTMLDivElement>(null);
    const firstRowRef = useRef<HTMLLIElement>(null);
    const [room, setRoom] = useState({ area: 0, row: 0 });

    useEffect(() => {
        const el = rowsRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            const area = entry.contentRect.height;
            setRoom((prev) => (Math.abs(prev.area - area) > 1 ? { ...prev, area } : prev));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- Deliberately every render: it measures a row that only exists after layout. The functional update returns `prev` unchanged when nothing moved, and React stops there — so there is no chain.
    useLayoutEffect(() => {
        const row = firstRowRef.current?.offsetHeight ?? 0;
        if (row > 0) setRoom((prev) => (Math.abs(prev.row - row) > 1 ? { ...prev, row } : prev));
    });

    const rowBudget = useMemo(() => {
        if (room.area <= 0) return layout.rows;
        const rowH = room.row > 0 ? room.row : ROW_H;
        // Each section draws a title above its rows, and the second section
        // only exists when the first left room for it — so allowing for both
        // is short by at most half a row and never long by any.
        // Only the "up next" group is labelled, and it exists only when the
        // shelf left room for it — so this is short by at most half a row and
        // never long by any.
        const free = room.area - (shelf.upNext.length > 0 ? SECTION_H : 0);
        const fits = Math.floor((free + ROW_GAP) / (rowH + ROW_GAP));
        // A card drawing the spotlight has already shown the thing it exists
        // to show, so it may honestly show no rows at all. One that is not
        // must never draw nothing.
        return Math.max(layout.spotlight ? 0 : 1, fits);
        // Not `shelf.spotlight`: what this reads is `layout.spotlight`, the
        // decision about whether a spotlight is drawn, and the two parted
        // company when that flag moved onto the layout.
    }, [room, layout, shelf.upNext.length]);

    /**
     * The rows the spotlight left room for.
     *
     * A card that is not drawing a spotlight has that item to place as well, so
     * it goes back on the front of the shelf rather than being dropped — the
     * one thing a small card must not do is hide the item it exists to show.
     */
    const shown = useMemo(() => {
        if (layout.spotlight) return shelfRows(shelf, rowBudget);
        const flat = {
            ...shelf,
            continuing: shelf.spotlight ? [shelf.spotlight, ...shelf.continuing] : shelf.continuing,
        };
        return shelfRows(flat, rowBudget);
    }, [shelf, layout, rowBudget]);

    /** The row that was just advanced, so the card can say so. See `CHEER_MS`. */
    const [cheered, setCheered] = useState<string | null>(null);
    const cheerTimer = useRef<number | null>(null);

    const total = useCountUp(items.length, animate);

    const openContent = useCallback(() => {
        void plugin.moduleManager.get('content')?.activateView();
    }, [plugin]);

    /**
     * Open an item's card in the library.
     *
     * The widget used to open the raw note while the same click in the library
     * opened the detail card; handing the id over means one gesture has one
     * meaning in both places.
     */
    const openItem = useCallback(
        (item: ContentItem) => {
            setFocusContentId(item.id);
            openContent();
        },
        [openContent, setFocusContentId]
    );

    /**
     * Advance an item straight from the dashboard.
     *
     * By any amount, not by one: the control is a menu now, and an evening of
     * three episodes should cost one write rather than three. See
     * `ProgressPopover`.
     */
    const bump = useCallback(
        async (item: ContentItem, delta: number) => {
            try {
                const patch = await bumpProgress(app, item, delta);
                if (!patch) return;
                patchContentItem(item.id, patch);

                // The store update redraws the meter, which is the real
                // feedback; the float is what makes a two-pixel change on a
                // three-pixel bar noticeable at all.
                setCheered(item.id);
                if (cheerTimer.current !== null) window.clearTimeout(cheerTimer.current);
                cheerTimer.current = window.setTimeout(() => setCheered(null), CHEER_MS);
            } catch (err) {
                console.error('Zenith: Failed to save progress:', err);
                new Notice(t('content.error.progress'));
            }
        },
        [app, patchContentItem, t]
    );

    const facts = useCallback(
        (item: ContentItem, mode: 'resume' | 'next'): RowFacts => {
            const type = resolveContentType(types, item.type);
            const progress = { current: item.progressCurrent ?? 0, total: item.progressTotal };
            const tracks = type.fields.includes('progress');
            // Same rule as the poster tiles: no bar until something is under way.
            const pct = tracks && progress.current > 0 ? (progressPercent(progress) ?? null) : null;

            return {
                type,
                cover: resolveCover(app, item.coverImage) || null,
                pct,
                // How far in, for something under way; how long it is, for
                // something you are deciding whether to start.
                value:
                    mode === 'resume' && tracks && progress.current > 0
                        ? formatProgress(progress, type.progressUnit, { short: true })
                        : tracks && progress.total
                          ? `${progress.total} ${shortUnit(type.progressUnit)}`
                          : '',
                // The type is legible from the cover and the colour, so the
                // subtitle spends its one line on what distinguishes the item.
                sub: [item.year, item.creator].filter(Boolean).join(' · ') || type.label,
                canBump:
                    quickOn &&
                    tracks &&
                    item.status === 'in-progress' &&
                    (!progress.total || progress.current < progress.total),
            };
        },
        [app, types, quickOn]
    );

    if (items.length === 0) {
        return (
            <div className="zenith-cw__empty">
                <Library size={28} strokeWidth={1.5} />
                <span>{t('content.widget.noContent')}</span>
                <button className="zenith-cw__cta" onClick={openContent}>
                    {t('content.widget.openLibrary')}
                </button>
            </div>
        );
    }

    const { counts } = shelf;
    const segments = STATUS_META.filter((s) => counts.byStatus[s.key]);

    return (
        <div className="zenith-cw">
            {/* The library, in one line with a bar ruled under it.
             *
             * It used to be three blocks — a 1.5rem total with a rating pill,
             * then the bar, then the four-chip legend — about sixty pixels
             * spent before the card said anything about what to read next. The
             * total was the largest type on a card that is not about how many
             * things you own, the legend restated in numbers what the bar had
             * just drawn to scale, and both wanted a row of their own.
             *
             * One row now: the legend IS the key and the counts, and the bar is
             * its underline rather than a separate claim. Nothing was dropped
             * except the size of the total, which moved to the end of the line
             * where a total belongs. */}
            <div className="zenith-cw__hero">
                <div className="zenith-cw__status">
                    {segments.map((s) => (
                        <span
                            key={s.key}
                            className="zenith-cw__stat"
                            title={`${counts.byStatus[s.key]} · ${t(s.i18n)}`}
                        >
                            <span className="zenith-cw__stat-dot" style={{ background: s.color }} />
                            <span className="zenith-cw__stat-value">{counts.byStatus[s.key]}</span>
                            <span className="zenith-cw__stat-label">{t(s.i18n)}</span>
                        </span>
                    ))}

                    {/* The count and its noun come as one translated string:
                        Russian inflects the noun with the number, so they
                        cannot be split. */}
                    <span className="zenith-cw__total">
                        <span className="zenith-cw__total-value">{Math.round(total)}</span>
                        <span className="zenith-cw__total-label">
                            {t.plural('common.itemsNoun', items.length)}
                        </span>
                        {counts.avgRating > 0 && (
                            <span className="zenith-cw__avg" title={t('content.stats.avgRating')}>
                                <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                                {counts.avgRating.toFixed(1)}
                            </span>
                        )}
                    </span>
                </div>

                {/* The segments grow from nothing on the first paint, which is
                    what makes the bar read as a measurement rather than as a
                    rule ruled across the card.

                    The bar and the counts above it are drawn from the same
                    array, so a colour on one and not the other is not a state
                    this can reach. They add up to the total for the same
                    reason `normalizeContentItem` coerces every status it reads
                    to one of the four: a note saying `status: reading` is
                    counted as backlog rather than as a fifth colour nobody
                    labelled. */}
                <div className="zenith-cw__bar" role="img" aria-label={t('content.stats.byStatus')}>
                    {segments.map((s, i) => (
                        <span
                            key={s.key}
                            className="zenith-cw__bar-seg"
                            style={
                                {
                                    width: `${(counts.byStatus[s.key] / counts.total) * 100}%`,
                                    background: s.color,
                                    ['--cw-at' as string]: i,
                                } as CSSProperties
                            }
                            title={`${counts.byStatus[s.key]} ${t(s.i18n)}`}
                        />
                    ))}
                </div>
            </div>

            <div className="zenith-cw__shelf">
                {layout.spotlight && shelf.spotlight && (
                    <Spotlight
                        item={shelf.spotlight}
                        facts={facts(shelf.spotlight, 'resume')}
                        cheering={cheered === shelf.spotlight.id}
                        onOpen={openItem}
                        onBump={bump}
                    />
                )}

                {/* The rows, and exactly the room there is for them.
                 *
                 * This is the element the row budget is measured against: it
                 * is what the card has left after the spotlight, so nothing
                 * has to be guessed about how tall the spotlight, the status
                 * line or the card's own title band happen to be. See
                 * `rowsRef`. */}
                <div className="zenith-cw__rows" ref={rowsRef}>
                    {/* No heading over these. The rule under the spotlight
                        already says the shelf continues, and "Continue" over
                        rows that each carry a half-finished meter says it a
                        third time — for half a row, on every card that draws a
                        spotlight. The group below IS labelled, because it is a
                        different pool: things not started rather than things
                        under way. */}
                    {shown.continuing.length > 0 && (
                        <>
                            <ul className="zenith-cw__list">
                                {shown.continuing.map((item, i) => (
                                    <Row
                                        key={item.id}
                                        item={item}
                                        at={i}
                                        ref={i === 0 ? firstRowRef : undefined}
                                        facts={facts(item, 'resume')}
                                        cheering={cheered === item.id}
                                        onOpen={openItem}
                                        onBump={bump}
                                    />
                                ))}
                            </ul>
                        </>
                    )}

                    {shown.upNext.length > 0 && (
                        <>
                            <div className="zenith-cw__section-title">
                                {t('content.widget.upNext')}
                            </div>
                            <ul className="zenith-cw__list">
                                {shown.upNext.map((item, i) => (
                                    <Row
                                        key={item.id}
                                        item={item}
                                        at={i}
                                        ref={
                                            shown.continuing.length === 0 && i === 0
                                                ? firstRowRef
                                                : undefined
                                        }
                                        facts={facts(item, 'next')}
                                        cheering={false}
                                        onOpen={openItem}
                                        onBump={bump}
                                    />
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {/* One way out, at the bottom, always.
             *
             * There were two, and they went to the same place: a "+4 more"
             * link at the end of the list and an "Open library" button under
             * it. Worse, the first belonged to the shelf and the second to the
             * card, so when the shelf ran long the button was drawn straight
             * over the last row — the overlap in the screenshot. One control
             * says whichever of the two things is true: how much is not on the
             * card, or, when everything is, where the card comes from.
             *
             * Beside it, the one thing neither the bar nor the shelf can say:
             * how much of what is "in progress" has not actually moved in a
             * month. It is a subset of the blue segment rather than a status of
             * its own — which is why it is worded as a condition and not as a
             * name, and why it is here and not a fifth colour on the bar. */}
            <div className="zenith-wfoot zenith-cw__footer">
                {layout.stats && counts.stalled > 0 && (
                    <span
                        className="zenith-wfoot__note is-warn"
                        title={t('content.stats.stalledHint')}
                    >
                        <Moon size={11} />
                        {t('content.widget.stalled', { count: String(counts.stalled) })}
                    </span>
                )}
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-wfoot__open"
                    onClick={openContent}
                    title={t('content.widget.openLibrary')}
                >
                    {shown.hidden > 0
                        ? t('common.more', { count: shown.hidden })
                        : t('content.widget.openLibrary')}
                    <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
};

/** The artwork, faded in once the file is actually decoded. */
const Art: React.FC<{ facts: RowFacts; alt: string; className: string }> = ({
    facts,
    alt,
    className,
}) => {
    const [loaded, setLoaded] = useState(false);

    if (!facts.cover) {
        return (
            <span className={`${className} is-blank`} style={{ color: facts.type.color }}>
                <ObsidianIcon name={facts.type.icon} size={16} />
            </span>
        );
    }

    return (
        <span className={className}>
            <img
                className={`zenith-cw__img ${loaded ? 'is-loaded' : ''}`}
                src={facts.cover}
                alt={alt}
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                // A cover that 404s must not leave a grey rectangle where the
                // artwork was promised: the type's own colour is behind it.
                onError={() => setLoaded(false)}
            />
        </span>
    );
};

interface RowProps {
    item: ContentItem;
    facts: RowFacts;
    cheering: boolean;
    onOpen: (item: ContentItem) => void;
    onBump: (item: ContentItem, delta: number) => void | Promise<void>;
}

/**
 * The leading item, drawn as the card's subject rather than as its first row.
 *
 * It carries what a row cannot: artwork at a size worth recognising, the count
 * and the percentage together, and the two actions — advance it, open it —
 * spelled out instead of hidden behind a hover.
 */
const Spotlight: React.FC<RowProps> = ({ item, facts, cheering, onOpen, onBump }) => {
    const menu = useContentMenu(item, facts.type, onOpen);

    return (
        <article
            className="zenith-cw__spot"
            style={{ ['--cw-color' as string]: facts.type.color } as CSSProperties}
            onContextMenu={menu}
        >
            <button
                type="button"
                className="zenith-cw__spot-art"
                onClick={() => onOpen(item)}
                aria-label={item.title}
                title={item.title}
            >
                <Art facts={facts} alt={item.title} className="zenith-cw__art" />
            </button>

            <div className="zenith-cw__spot-main">
                <div className="zenith-cw__spot-top">
                    <button
                        type="button"
                        className="zenith-cw__spot-title"
                        onClick={() => onOpen(item)}
                        title={item.title}
                    >
                        {item.title}
                    </button>
                    {item.rating > 0 && (
                        <span className="zenith-cw__item-rating">
                            <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                            {item.rating}
                        </span>
                    )}
                </div>

                <div className="zenith-cw__spot-meta">
                    <span>{facts.value || facts.sub}</span>
                    {facts.pct != null && (
                        <span className="zenith-cw__spot-pct">{Math.round(facts.pct)}%</span>
                    )}
                </div>

                {facts.pct != null && (
                    <Meter
                        percent={facts.pct}
                        size="sm"
                        color={facts.type.color}
                        className="zenith-cw__item-track"
                    />
                )}
            </div>

            {facts.canBump && (
                <span className={`zenith-cw__control ${cheering ? 'is-cheering' : ''}`}>
                    <ProgressPopover
                        title={item.title}
                        current={item.progressCurrent ?? 0}
                        total={item.progressTotal}
                        // The unit is the user's own word from their content
                        // type — "episodes", "серии", "стр." — so it is only
                        // ever set beside a number, never built into a
                        // sentence this file assembles.
                        unit={shortUnit(facts.type.progressUnit)}
                        color={facts.type.color}
                        variant="spot"
                        onBump={(delta) => onBump(item, delta)}
                    />
                </span>
            )}
        </article>
    );
};

/**
 * One compact row: cover, title, the count that goes with it, and a meter.
 *
 * Forwards its element so the card can measure a drawn row and work out how
 * many of them fit, rather than being told a number by a table. See
 * `rowBudget`.
 */
const Row = React.forwardRef<HTMLLIElement, RowProps & { at: number }>(function Row(
    { item, at, facts, cheering, onOpen, onBump },
    ref
) {
    const menu = useContentMenu(item, facts.type, onOpen);

    return (
        <li
            ref={ref}
            className={`zenith-cw__item ${cheering ? 'is-cheering' : ''}`}
            style={{ ['--cw-at' as string]: at } as CSSProperties}
            role="button"
            tabIndex={0}
            title={item.title}
            onClick={() => onOpen(item)}
            onContextMenu={menu}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(item);
                }
            }}
        >
            <Art facts={facts} alt="" className="zenith-cw__item-thumb" />

            {/* One line, and in reading order: what it is, how far in, and the
                same distance as a shape.

                It was two — the title over a full-width meter — which made a
                row 49px tall and put six saturated bars down a card whose job
                is to be glanceable. The bar was carrying the whole claim on
                its own and so had to be wide; beside the count it only has to
                make the count visual, and 44px is plenty for that. */}
            <span className="zenith-cw__item-title">{item.title}</span>

            {facts.pct != null ? (
                <>
                    {facts.value && <span className="zenith-cw__item-value">{facts.value}</span>}
                    <Meter
                        percent={facts.pct}
                        size="sm"
                        color={facts.type.color}
                        className="zenith-cw__item-track"
                    />
                </>
            ) : (
                <span className="zenith-cw__item-sub">{facts.value || facts.sub}</span>
            )}

            {item.rating > 0 && (
                <span className="zenith-cw__item-rating">
                    <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                    {item.rating}
                </span>
            )}

            {facts.canBump && (
                <span className="zenith-cw__control" onClick={(e) => e.stopPropagation()}>
                    <ProgressPopover
                        title={item.title}
                        current={item.progressCurrent ?? 0}
                        total={item.progressTotal}
                        unit={shortUnit(facts.type.progressUnit)}
                        color={facts.type.color}
                        variant="row"
                        onBump={(delta) => onBump(item, delta)}
                    />
                </span>
            )}
        </li>
    );
});
