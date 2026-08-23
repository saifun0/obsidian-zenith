import React, { useMemo } from 'react';
import { Notice } from 'obsidian';
import { Star, ArrowRight, Library, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { ContentItem } from '../../../store/contentSlice';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { resolveCover } from '../services/coverUrl';
import { bumpProgress } from '../services/contentActions';
import { formatProgress, progressPercent, shortUnit } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import type { WidgetSize } from '../../dashboard/grid/gridTypes';

/** Rows each preset can show without the card scrolling. */
const ROW_BUDGET: Record<WidgetSize, number> = { sm: 2, md: 4, lg: 8 };

const STATUS_META: { key: string; i18n: string; color: string }[] = [
    { key: 'in-progress', i18n: 'status.inProgress', color: 'var(--zenith-info)' },
    { key: 'completed', i18n: 'status.completed', color: 'var(--zenith-success)' },
    { key: 'backlog', i18n: 'status.backlog', color: 'var(--zenith-text-faint)' },
    { key: 'dropped', i18n: 'status.dropped', color: 'var(--zenith-danger)' },
];

/**
 * ContentWidget — the dashboard face of the library.
 *
 * The earlier version showed three counts and a bare title, which answered
 * nothing you'd actually ask at a glance. This one leads with a proportional
 * status bar, then the shelf you care about — what's in progress, how far in,
 * rated how — with a one-click "+1" so marking an episode watched doesn't
 * require opening the library.
 *
 * Whatever rows are left over after the in-progress shelf are filled with
 * best-rated backlog suggestions rather than whitespace, which on a tall card
 * used to be most of it.
 */
export const ContentWidget: React.FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const items = useZenithStore((s) => s.contentItems);
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const setFocusContentId = useZenithStore((s) => s.setFocusContentId);
    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        items.forEach((i) => {
            c[i.status] = (c[i.status] || 0) + 1;
        });
        return c;
    }, [items]);

    const avgRating = useMemo(() => {
        const rated = items.filter((i) => i.rating > 0);
        return rated.length > 0 ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;
    }, [items]);

    // In-progress first, furthest along first — the thing you're most likely to
    // finish next sits at the top.
    const active = useMemo(
        () =>
            items
                .filter((i) => i.status === 'in-progress')
                .sort(
                    (a, b) =>
                        (progressPercent({ current: b.progressCurrent ?? 0, total: b.progressTotal }) ?? -1) -
                        (progressPercent({ current: a.progressCurrent ?? 0, total: a.progressTotal }) ?? -1)
                ),
        [items]
    );

    /** Best-rated backlog entries, as suggestions. */
    const backlog = useMemo(
        () => items.filter((i) => i.status === 'backlog').sort((a, b) => b.rating - a.rating),
        [items]
    );

    // What's in progress comes first and takes as many rows as it needs. The
    // leftover rows used to be blank whenever fewer than `budget` things were
    // running, which on a tall card is most of it — suggestions from the backlog
    // fill them, and answer "so what do I start" at the same time.
    const budget = ROW_BUDGET[size];
    const shelf = active.slice(0, budget);
    const hiddenCount = active.length - shelf.length;
    const upNext = backlog.slice(0, Math.max(0, budget - shelf.length));

    const openContent = () => {
        void plugin.moduleManager.get('content')?.activateView();
    };

    /**
     * Open an item's card in the library.
     *
     * The widget used to open the raw note while the same click in the library
     * opened the detail card; handing the id over means one gesture has one
     * meaning in both places.
     */
    const openItem = (item: ContentItem) => {
        setFocusContentId(item.id);
        openContent();
    };

    /** Advance an item by one unit straight from the dashboard. */
    const bump = async (item: ContentItem, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const patch = await bumpProgress(app, item, 1);
            if (patch) patchContentItem(item.id, patch);
        } catch (err) {
            console.error('Zenith: Failed to save progress:', err);
            new Notice(t('content.error.progress'));
        }
    };

    /**
     * One shelf row — shared by the "continue" and "up next" sections.
     *
     * The count sits at the end of the title line and the meter runs underneath
     * it. Before, a full-width bar pushed "6 / 12 p" out to the card's right
     * edge, leaving a gap in the middle of every row that the eye had to jump;
     * now the two facts that belong together are adjacent.
     */
    const renderRow = (item: ContentItem, mode: 'resume' | 'next') => {
        const type = resolveContentType(types, item.type);
        const cover = resolveCover(app, item.coverImage);
        const progress = { current: item.progressCurrent ?? 0, total: item.progressTotal };
        const tracks = type.fields.includes('progress');
        // Same rule as the poster tiles: no bar until something is under way.
        const pct = tracks && progress.current > 0 ? progressPercent(progress) : undefined;
        const canBump =
            tracks && item.status === 'in-progress' && (!progress.total || progress.current < progress.total);

        // How far in, for something under way; how long it is, for something
        // you're deciding whether to start.
        const value =
            mode === 'resume' && tracks && progress.current > 0
                ? formatProgress(progress, type.progressUnit, { short: true })
                : tracks && progress.total
                  ? `${progress.total} ${shortUnit(type.progressUnit)}`
                  : '';

        // The type is already legible from the cover and the colour, so the
        // subtitle spends its one line on what actually distinguishes an item.
        const sub = [item.year, item.creator].filter(Boolean).join(' · ') || type.label;

        return (
            <li
                key={item.id}
                className="zenith-cw__item"
                role="button"
                tabIndex={0}
                title={item.title}
                onClick={() => openItem(item)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openItem(item);
                    }
                }}
            >
                <span
                    className="zenith-cw__item-thumb"
                    style={cover ? { backgroundImage: `url("${cover}")` } : { color: type.color }}
                >
                    {!cover && <ObsidianIcon name={type.icon} size={14} />}
                </span>

                <span className="zenith-cw__item-main">
                    <span className="zenith-cw__item-top">
                        <span className="zenith-cw__item-title">{item.title}</span>
                        {value && <span className="zenith-cw__item-value">{value}</span>}
                    </span>
                    {pct != null ? (
                        <span className="zenith-cw__item-track">
                            <span
                                className="zenith-cw__item-fill"
                                style={{ width: `${pct}%`, background: type.color }}
                            />
                        </span>
                    ) : (
                        <span className="zenith-cw__item-sub">{sub}</span>
                    )}
                </span>

                {item.rating > 0 && (
                    <span className="zenith-cw__item-rating">
                        <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                        {item.rating}
                    </span>
                )}

                {canBump && (
                    <button
                        className="zenith-cw__item-bump"
                        aria-label={t('content.widget.bump', {
                            unit: type.progressUnit ?? '',
                            title: item.title,
                        })}
                        title="+1"
                        onClick={(e) => void bump(item, e)}
                    >
                        <Plus size={12} />
                    </button>
                )}
            </li>
        );
    };

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

    const total = items.length;

    return (
        <div className="zenith-cw">
            {/* Headline: library size + how it's rated */}
            <div className="zenith-cw__summary">
                {/* The count and its noun come as one translated string: Russian
                    inflects the noun with the number, so they can't be split. */}
                <div className="zenith-cw__total">
                    <span className="zenith-cw__total-value">{total}</span>
                    <span className="zenith-cw__total-label">{t.plural('common.itemsNoun', total)}</span>
                </div>
                {avgRating > 0 && (
                    <span className="zenith-cw__avg" title={t('content.stats.avgRating')}>
                        <Star size={12} fill="#f59e0b" stroke="#f59e0b" />
                        {avgRating.toFixed(1)}
                    </span>
                )}
            </div>

            {/* Proportional status bar — reads faster than four numbers */}
            <div className="zenith-cw__bar" role="img" aria-label={t('content.stats.byStatus')}>
                {STATUS_META.filter((s) => counts[s.key]).map((s) => (
                    <span
                        key={s.key}
                        className="zenith-cw__bar-seg"
                        style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }}
                        title={`${counts[s.key]} ${t(s.i18n)}`}
                    />
                ))}
            </div>
            <div className="zenith-cw__breakdown">
                {STATUS_META.filter((s) => counts[s.key]).map((s) => (
                    <div key={s.key} className="zenith-cw__stat">
                        <span className="zenith-cw__stat-dot" style={{ background: s.color }} />
                        <span className="zenith-cw__stat-value">{counts[s.key]}</span>
                        <span className="zenith-cw__stat-label">{t(s.i18n)}</span>
                    </div>
                ))}
            </div>

            {shelf.length > 0 && (
                <>
                    <div className="zenith-cw__section-title">{t('content.continue')}</div>
                    <ul className="zenith-cw__list">{shelf.map((i) => renderRow(i, 'resume'))}</ul>
                    {hiddenCount > 0 && (
                        <button className="zenith-widget__more" onClick={openContent}>
                            {t('common.more', { count: hiddenCount })} →
                        </button>
                    )}
                </>
            )}

            {upNext.length > 0 && (
                <>
                    <div className="zenith-cw__section-title">{t('content.widget.upNext')}</div>
                    <ul className="zenith-cw__list">{upNext.map((i) => renderRow(i, 'next'))}</ul>
                </>
            )}

            <button className="zenith-cw__open" onClick={openContent}>
                {t('content.widget.openLibrary')} <ArrowRight size={14} />
            </button>
        </div>
    );
};
