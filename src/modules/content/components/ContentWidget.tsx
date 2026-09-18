import React, { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Notice } from 'obsidian';
import { ArrowRight, Library, Moon, Plus, Star } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useReducedMotion } from '../../../components/shared/useCrossFade';
import { useCountUp } from '../../../components/shared/useCountUp';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { resolveCover } from '../services/coverUrl';
import { bumpProgress } from '../services/contentActions';
import { buildContentShelf, shelfRows } from '../services/contentShelf';
import { STALE_DAYS } from '../services/contentStats';
import { formatProgress, progressPercent, shortUnit } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useContentMenu } from './useContentMenu';
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
 * its meter and the two actions worth taking on it; the rest of the shelf is
 * compact rows under it; and the shelf is what grows when the card does. What
 * the card can afford at each size is one table (`LAYOUT`), and the fine
 * trimming is the stylesheet's, which is the only thing that can see the height
 * a user just dragged the card to.
 *
 * Which item leads, and what fills the space when nothing is under way, is
 * decided in `buildContentShelf` — away from here, where it can be tested.
 */

/** What each preset can afford. The stylesheet trims further; see the CSS. */
interface WidgetLayout {
    /** Compact rows under the spotlight. */
    rows: number;
    /** Draw the leading item large, with its artwork. */
    spotlight: boolean;
    /** The footer strip beside the way out, for what the shelf cannot say. */
    stats: boolean;
}

const LAYOUT: Record<WidgetSize, WidgetLayout> = {
    // Counted against the height each preset actually has, in the units the
    // card is built from: a row is 49px, the hero 65 with its key on one line,
    // the spotlight 86, the way out 38, and there are three 8px gaps between
    // them. A budget that overflows is not a longer list — it is the card's own
    // scrollbar, and on a card this short it is the "open library" button drawn
    // over the last row, which is what the first pass at these numbers did.
    //
    //   sm  2 grid rows ≈ 192px of body  →  65 + 38 + 16 = 119, so one row
    //   md  2 grid rows, full width      →  spotlight + three
    //   lg  4 grid rows ≈ 450px          →  spotlight + five
    //
    // A card dragged taller than its preset keeps a little slack at the bottom;
    // one dragged shorter gets the card body's scrollbar, which is the contract
    // every widget here has.
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
     * The rows the spotlight left room for.
     *
     * A card that is not drawing a spotlight has that item to place as well, so
     * it goes back on the front of the shelf rather than being dropped — the
     * one thing a small card must not do is hide the item it exists to show.
     */
    const shown = useMemo(() => {
        if (layout.spotlight) return shelfRows(shelf, layout.rows);
        const flat = {
            ...shelf,
            continuing: shelf.spotlight ? [shelf.spotlight, ...shelf.continuing] : shelf.continuing,
        };
        return shelfRows(flat, layout.rows);
    }, [shelf, layout]);

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

    /** Advance an item by one unit straight from the dashboard. */
    const bump = useCallback(
        async (item: ContentItem) => {
            try {
                const patch = await bumpProgress(app, item, 1);
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
                    tracks &&
                    item.status === 'in-progress' &&
                    (!progress.total || progress.current < progress.total),
            };
        },
        [app, types]
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
            <div className="zenith-cw__hero">
                <div className="zenith-cw__summary">
                    {/* The count and its noun come as one translated string:
                        Russian inflects the noun with the number, so they
                        cannot be split. */}
                    <div className="zenith-cw__total">
                        <span className="zenith-cw__total-value">{Math.round(total)}</span>
                        <span className="zenith-cw__total-label">
                            {t.plural('common.itemsNoun', items.length)}
                        </span>
                    </div>
                    {counts.avgRating > 0 && (
                        <span className="zenith-cw__avg" title={t('content.stats.avgRating')}>
                            <Star size={12} fill="#f59e0b" stroke="#f59e0b" />
                            {counts.avgRating.toFixed(1)}
                        </span>
                    )}
                </div>

                {/* Proportional status bar — reads faster than four numbers.
                    The segments grow from nothing on the first paint, which is
                    what makes the bar read as a measurement rather than as a
                    rule ruled across the card.

                    The bar and the legend under it are drawn from the same
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

                {/* Never optional. A coloured bar with no key is a decoration
                    the reader has to guess at, and the small card is exactly
                    where guessing is least affordable — so what gives on a
                    narrow card is the label words, not the legend. The count
                    keeps its dot, and the full name is on the chip's title. */}
                <div className="zenith-cw__breakdown">
                    {segments.map((s) => (
                        <div
                            key={s.key}
                            className="zenith-cw__stat"
                            title={`${counts.byStatus[s.key]} · ${t(s.i18n)}`}
                        >
                            <span className="zenith-cw__stat-dot" style={{ background: s.color }} />
                            <span className="zenith-cw__stat-value">{counts.byStatus[s.key]}</span>
                            <span className="zenith-cw__stat-label">{t(s.i18n)}</span>
                        </div>
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

                {shown.continuing.length > 0 && (
                    <>
                        {layout.spotlight && shelf.spotlight && (
                            <div className="zenith-cw__section-title">{t('content.continue')}</div>
                        )}
                        <ul className="zenith-cw__list">
                            {shown.continuing.map((item, i) => (
                                <Row
                                    key={item.id}
                                    item={item}
                                    at={i}
                                    facts={facts(item, 'resume')}
                                    cheering={cheered === item.id}
                                    onOpen={openItem}
                                    onBump={bump}
                                />
                            ))}
                        </ul>
                    </>
                )}

                {shown.hidden > 0 && (
                    <button className="zenith-widget__more" onClick={openContent}>
                        {t('common.more', { count: shown.hidden })} →
                    </button>
                )}

                {shown.upNext.length > 0 && (
                    <>
                        <div className="zenith-cw__section-title">{t('content.widget.upNext')}</div>
                        <ul className="zenith-cw__list">
                            {shown.upNext.map((item, i) => (
                                <Row
                                    key={item.id}
                                    item={item}
                                    at={i}
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

            {/* The footer carries the one thing neither the bar nor the shelf
                can say: how much of what is "in progress" has not actually
                moved in a month. It is a subset of the blue segment rather
                than a status of its own — which is why it is worded as a
                condition and not as a name, and why it is here and not a fifth
                colour on the bar.

                What used to sit beside it was "43% completed", a figure the
                green segment had already drawn to scale two rows above. A
                number and a picture of the same number is one of them too
                many, and the picture was the better one. */}
            {layout.stats && (
                <div className="zenith-cw__footer">
                    {counts.stalled > 0 && (
                        <span
                            className="zenith-cw__footStat is-warn"
                            title={t('content.stats.stalledHint')}
                        >
                            <Moon size={11} />
                            {t('content.widget.stalled', { count: String(counts.stalled) })}
                        </span>
                    )}
                    <button className="zenith-cw__open" onClick={openContent}>
                        {t('content.widget.openLibrary')} <ArrowRight size={13} />
                    </button>
                </div>
            )}

            {!layout.stats && (
                <button className="zenith-cw__open" onClick={openContent}>
                    {t('content.widget.openLibrary')} <ArrowRight size={13} />
                </button>
            )}
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
    onBump: (item: ContentItem) => void | Promise<void>;
}

/**
 * The leading item, drawn as the card's subject rather than as its first row.
 *
 * It carries what a row cannot: artwork at a size worth recognising, the count
 * and the percentage together, and the two actions — advance it, open it —
 * spelled out instead of hidden behind a hover.
 */
const Spotlight: React.FC<RowProps> = ({ item, facts, cheering, onOpen, onBump }) => {
    const t = useTranslation();
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
                    <span className="zenith-cw__item-track">
                        <span
                            className="zenith-cw__item-fill"
                            style={{ width: `${facts.pct}%`, background: facts.type.color }}
                        />
                    </span>
                )}
            </div>

            {facts.canBump && (
                <button
                    type="button"
                    className={`zenith-cw__spot-bump ${cheering ? 'is-cheering' : ''}`}
                    onClick={() => void onBump(item)}
                    // The unit is the user's own word from their content type —
                    // "episodes", "серии", "стр." — so it belongs in a tooltip
                    // and a label, never inside a sentence this file assembles.
                    // "Ещё один ep" was one string built out of two languages.
                    aria-label={t('content.widget.bump', {
                        unit: shortUnit(facts.type.progressUnit),
                        title: item.title,
                    })}
                    title={t('content.card.plusOne', {
                        unit: shortUnit(facts.type.progressUnit),
                    })}
                >
                    <Plus size={15} />
                    {cheering && <span className="zenith-cw__cheer">+1</span>}
                </button>
            )}
        </article>
    );
};

/** One compact row: cover, title, the count that goes with it, and a meter. */
const Row: React.FC<RowProps & { at: number }> = ({
    item,
    at,
    facts,
    cheering,
    onOpen,
    onBump,
}) => {
    const t = useTranslation();
    const menu = useContentMenu(item, facts.type, onOpen);

    return (
        <li
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

            <span className="zenith-cw__item-main">
                <span className="zenith-cw__item-top">
                    <span className="zenith-cw__item-title">{item.title}</span>
                    {facts.value && <span className="zenith-cw__item-value">{facts.value}</span>}
                </span>
                {facts.pct != null ? (
                    <span className="zenith-cw__item-track">
                        <span
                            className="zenith-cw__item-fill"
                            style={{ width: `${facts.pct}%`, background: facts.type.color }}
                        />
                    </span>
                ) : (
                    <span className="zenith-cw__item-sub">{facts.sub}</span>
                )}
            </span>

            {item.rating > 0 && (
                <span className="zenith-cw__item-rating">
                    <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                    {item.rating}
                </span>
            )}

            {facts.canBump && (
                <button
                    type="button"
                    className="zenith-cw__item-bump"
                    aria-label={t('content.widget.bump', {
                        unit: shortUnit(facts.type.progressUnit),
                        title: item.title,
                    })}
                    title={t('content.card.plusOne', {
                        unit: shortUnit(facts.type.progressUnit),
                    })}
                    onClick={(e) => {
                        e.stopPropagation();
                        void onBump(item);
                    }}
                >
                    <Plus size={12} />
                    {cheering && <span className="zenith-cw__cheer">+1</span>}
                </button>
            )}
        </li>
    );
};
