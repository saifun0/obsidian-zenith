import React, { useState, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { Notice } from 'obsidian';
import {
    X,
    ArrowDownNarrowWide,
    ArrowUpNarrowWide,
    LayoutGrid,
    CheckSquare,
    Tag,
    Trash2,
} from 'lucide-react';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useFeature } from '../../../core/useFeature';
import type { ContentItem } from '../../../store/contentSlice';
import { CONTENT_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { deleteItems, setItemsStatus } from '../services/contentActions';
import { progressPercent } from '../services/progress';
import { ContentCard } from './ContentCard';
import { ResumeRow } from './ResumeRow';
import { ContentDetailModal } from './ContentDetailModal';
import { Dropdown, SearchField } from '../../../components/ui/fields';

interface ContentGalleryProps {
    items: ContentItem[];
    loading?: boolean;
}

const STATUS_KEY: Record<ContentStatus, string> = {
    backlog: 'status.backlog',
    'in-progress': 'status.inProgress',
    completed: 'status.completed',
    dropped: 'status.dropped',
};

type SortKey = 'title' | 'rating' | 'year' | 'status' | 'progress' | 'added' | 'updated';

const SORT_KEY: Record<SortKey, string> = {
    title: 'content.sort.title',
    added: 'content.sort.added',
    updated: 'content.sort.updated',
    rating: 'content.sort.rating',
    year: 'content.sort.year',
    progress: 'content.sort.progress',
    status: 'content.sort.status',
};

/**
 * The direction each sort starts in. "Title A→Z" and "worst rated first" are
 * both surprising defaults in the wrong place, so each key declares the order
 * that's actually useful; the toggle then flips it.
 */
const SORT_DEFAULT_DESC: Record<SortKey, boolean> = {
    title: false,
    added: true,
    updated: true,
    rating: true,
    year: true,
    progress: true,
    status: false,
};

/**
 * ContentGallery — a poster wall with type/status filtering, search and sort,
 * a "Continue" shelf for in-progress items, and a detail modal on click. Type
 * tabs and each card's presentation come from the configured content types.
 */
export const ContentGallery: React.FC<ContentGalleryProps> = ({ items, loading }) => {
    const t = useTranslation();
    const { app } = useApp();
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);
    const patchContentItem = useZenithStore((s) => s.patchContentItem);

    // Set from outside the gallery: a genre chip in the detail modal or the
    // stats view, and the dashboard widget asking to open one card.
    // Switched off, a genre handed over earlier is ignored rather than left
    // filtering the library with no chip to clear it by.
    const genreFilterOn = useFeature('content.genreFilter');
    const storedGenre = useZenithStore((s) => s.contentGenreFilter);
    const genreFilter = genreFilterOn ? storedGenre : null;
    const resumeOn = useFeature('content.resume');
    const multiSelectOn = useFeature('content.multiSelect');
    const setGenreFilter = useZenithStore((s) => s.setContentGenreFilter);
    const focusId = useZenithStore((s) => s.focusContentId);
    const setFocusId = useZenithStore((s) => s.setFocusContentId);

    // Restored from settings, so reopening the view lands where you left it.
    // Read once via getState rather than a selector: this component *writes*
    // that slice, and subscribing to it would re-render on its own save.
    const saved = useRef(useZenithStore.getState().settings.contentView).current;
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [activeType, setActiveType] = useState(saved.type || 'all');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>(() =>
        CONTENT_STATUSES.includes(saved.status as ContentStatus) ? (saved.status as ContentStatus) : 'all'
    );
    const [sort, setSort] = useState<SortKey>(() =>
        saved.sort in SORT_KEY ? (saved.sort as SortKey) : 'title'
    );
    const [desc, setDesc] = useState(!!saved.desc);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    useEffect(() => {
        updateSettings({ contentView: { type: activeType, status: statusFilter, sort, desc } });
    }, [activeType, statusFilter, sort, desc, updateSettings]);

    // Selecting ends with its feature, so no bulk bar is left without the
    // button that closes it.
    useEffect(() => {
        if (!multiSelectOn) setSelectMode(false);
    }, [multiSelectOn]);

    // The dashboard widget hands over an id instead of opening the note, so a
    // click means the same thing there as it does here. Consumed immediately,
    // or clicking the same card twice would do nothing the second time.
    useEffect(() => {
        if (!focusId) return;
        setSelectedId(focusId);
        setFocusId(null);
    }, [focusId, setFocusId]);

    // The detail modal reads the item back out of the live list rather than
    // holding a snapshot: editing writes the note, which re-parses the folder
    // and replaces every item object. A snapshot would go stale on the first
    // edit (and the modal would reopen with the old values).
    const selected = useMemo(
        () => (selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null),
        [items, selectedId]
    );

    const typeOf = useMemo(() => {
        const cache = new Map<string, ReturnType<typeof resolveContentType>>();
        return (id: string) => {
            let c = cache.get(id);
            if (!c) {
                c = resolveContentType(types, id);
                cache.set(id, c);
            }
            return c;
        };
    }, [types]);

    const changeSort = (key: SortKey) => {
        setSort(key);
        setDesc(SORT_DEFAULT_DESC[key]);
    };

    const query = search.trim().toLowerCase();
    const filtersActive = statusFilter !== 'all' || !!query || activeType !== 'all' || !!genreFilter;

    const filteredItems = useMemo(() => {
        let result = activeType === 'all' ? [...items] : items.filter((i) => i.type === activeType);

        if (statusFilter !== 'all') {
            result = result.filter((i) => i.status === statusFilter);
        }

        if (genreFilter) {
            const g = genreFilter.toLowerCase();
            result = result.filter((i) => i.genres?.some((x) => x.toLowerCase() === g));
        }

        if (query) {
            result = result.filter(
                (i) =>
                    i.title.toLowerCase().includes(query) ||
                    i.creator?.toLowerCase().includes(query) ||
                    i.tags.some((t) => t.toLowerCase().includes(query)) ||
                    i.genres?.some((g) => g.toLowerCase().includes(query))
            );
        }

        const pct = (i: ContentItem) =>
            progressPercent({ current: i.progressCurrent ?? 0, total: i.progressTotal }) ?? -1;

        result.sort((a, b) => {
            let cmp: number;
            switch (sort) {
                case 'rating':
                    cmp = a.rating - b.rating;
                    break;
                case 'year':
                    cmp = (a.year ?? 0) - (b.year ?? 0);
                    break;
                case 'status':
                    cmp = a.status.localeCompare(b.status);
                    break;
                case 'progress':
                    cmp = pct(a) - pct(b);
                    break;
                case 'added':
                    cmp = (a.createdAt ?? 0) - (b.createdAt ?? 0);
                    break;
                case 'updated':
                    cmp = (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
                    break;
                case 'title':
                default:
                    cmp = a.title.localeCompare(b.title);
                    break;
            }
            // Ties fall back to title so the order never shuffles arbitrarily.
            return (desc ? -cmp : cmp) || a.title.localeCompare(b.title);
        });

        return result;
    }, [items, activeType, statusFilter, genreFilter, query, sort, desc]);

    /**
     * Type filters, rendered as a segmented control in the toolbar rather than a
     * tab bar of its own.
     *
     * They used to be a full-width `<Tabs>` row above the controls, so two rows
     * of chrome stood between opening the view and seeing a poster. This is the
     * same filter in a third of the height — and it stays local to the gallery
     * because `<Tabs>` is shared with the tasks and weather views.
     */
    const typeFilters = useMemo(() => {
        const base = [
            {
                id: 'all',
                label: t('common.all'),
                count: items.length,
                icon: <LayoutGrid size={13} />,
                color: undefined as string | undefined,
            },
        ];
        for (const t of types) {
            const count = items.filter((i) => i.type === t.id).length;
            // Empty types stay hidden — except the one currently selected, so the
            // filter row can't drop the option you're standing on.
            if (count > 0 || t.id === activeType) {
                base.push({
                    id: t.id,
                    label: t.label,
                    count,
                    // Each type already carries an icon and a colour for its
                    // cards; reusing them here makes the filter row scannable by
                    // shape and hue instead of by reading every label.
                    icon: <ObsidianIcon name={t.icon} size={13} />,
                    color: t.color,
                });
            }
        }
        return base;
    }, [items, types, activeType, t]);

    const statusCounts = useMemo(() => {
        const c: Record<string, number> = {};
        const scope = activeType === 'all' ? items : items.filter((i) => i.type === activeType);
        scope.forEach((i) => {
            c[i.status] = (c[i.status] || 0) + 1;
        });
        return c;
    }, [items, activeType]);

    // "Continue" shelf — only on the unfiltered view, so it complements the grid.
    const continueItems = useMemo(
        () =>
            filtersActive || !resumeOn ? [] : items.filter((i) => i.status === 'in-progress'),
        [items, filtersActive, resumeOn]
    );

    // The shelf is a shortcut into the same library, so anything on it is left
    // out of the grid below. Showing both meant a third of a small library
    // appeared twice on one screen.
    const shelfIds = useMemo(() => new Set(continueItems.map((i) => i.id)), [continueItems]);
    const gridItems = useMemo(
        () => (shelfIds.size > 0 ? filteredItems.filter((i) => !shelfIds.has(i.id)) : filteredItems),
        [filteredItems, shelfIds]
    );

    const clearFilters = () => {
        setActiveType('all');
        setStatusFilter('all');
        setSearch('');
        setGenreFilter(null);
    };

    // ── Bulk selection ──────────────────────────────────────────────────────
    // Everything on screen is selectable, shelf included, so "select all" means
    // what it looks like it means.
    const visible = useMemo(() => [...continueItems, ...gridItems], [continueItems, gridItems]);
    const pickedItems = useMemo(() => items.filter((i) => picked.has(i.id)), [items, picked]);

    const toggleSelectMode = () => {
        setSelectMode((on) => !on);
        setPicked(new Set());
    };

    const togglePicked = (item: ContentItem) =>
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(item.id)) next.delete(item.id);
            else next.add(item.id);
            return next;
        });

    const bulkStatus = async (next: ContentStatus) => {
        if (bulkBusy || pickedItems.length === 0) return;
        setBulkBusy(true);
        try {
            for (const { id, patch } of await setItemsStatus(app, pickedItems, next)) {
                patchContentItem(id, patch);
            }
            setPicked(new Set());
        } finally {
            setBulkBusy(false);
        }
    };

    const bulkDelete = async () => {
        if (bulkBusy || pickedItems.length === 0) return;
        if (!window.confirm(t.plural('content.bulk.deleteConfirm', pickedItems.length))) return;
        setBulkBusy(true);
        try {
            const removed = await deleteItems(app, pickedItems);
            if (removed < pickedItems.length) new Notice(t('content.error.delete'));
            setPicked(new Set());
            setSelectMode(false);
        } finally {
            setBulkBusy(false);
        }
    };

    // Skeletons only stand in for a *first* load. Re-parsing after an edit used
    // to swap the whole grid (and the open modal) for placeholders and back.
    if (loading && items.length === 0) {
        return (
            <div className="zenith-content-gallery">
                <div className="zenith-content-gallery__grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="zenith-poster is-skeleton">
                            <div className="zenith-poster__art" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="zenith-content-gallery">
            <div className="zenith-content-gallery__controls">
                <div className="zenith-content-gallery__types" role="group" aria-label={t('content.filterByType')}>
                    {typeFilters.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            className={`zenith-content-gallery__type ${
                                activeType === f.id ? 'is-active' : ''
                            }`}
                            aria-pressed={activeType === f.id}
                            style={
                                f.color
                                    ? ({ '--zenith-type-color': f.color } as CSSProperties)
                                    : undefined
                            }
                            onClick={() => setActiveType(f.id)}
                        >
                            <span className="zenith-content-gallery__type-icon">{f.icon}</span>
                            <span className="zenith-content-gallery__type-label">{f.label}</span>
                            <span className="zenith-content-gallery__type-count">{f.count}</span>
                        </button>
                    ))}
                </div>

                <SearchField
                    className="zenith-content-gallery__search"
                    value={search}
                    onChange={setSearch}
                    placeholder={t('content.searchPlaceholder')}
                />

                <Dropdown
                    className="zenith-content-gallery__select"
                    aria-label={t('content.form.status')}
                    value={statusFilter}
                    options={[
                        { value: 'all', label: t('content.allStatuses') },
                        // Counts in the labels turn the filter into a breakdown:
                        // you can see what's there before committing to a click.
                        ...CONTENT_STATUSES.map((s) => ({
                            value: s,
                            label: `${t(STATUS_KEY[s])} (${statusCounts[s] ?? 0})`,
                            disabled: !statusCounts[s],
                        })),
                    ]}
                    onChange={(v) => setStatusFilter(v as ContentStatus | 'all')}
                />

                <div className="zenith-content-gallery__sort">
                    <Dropdown
                        className="zenith-content-gallery__select"
                        aria-label={t('tasks.filter.sort')}
                        value={sort}
                        options={(Object.keys(SORT_KEY) as SortKey[]).map((k) => ({
                            value: k,
                            label: t('content.sortBy', { name: t(SORT_KEY[k]) }),
                        }))}
                        onChange={(v) => changeSort(v as SortKey)}
                    />
                    <button
                        type="button"
                        className="zenith-content-gallery__sortdir"
                        aria-label={t(desc ? 'content.sortAscending' : 'content.sortDescending')}
                        title={t(desc ? 'content.sortAscending' : 'content.sortDescending')}
                        onClick={() => setDesc((d) => !d)}
                    >
                        {desc ? <ArrowDownNarrowWide size={15} /> : <ArrowUpNarrowWide size={15} />}
                    </button>
                    {multiSelectOn && (
                        <button
                            type="button"
                            className={`zenith-content-gallery__sortdir ${selectMode ? 'is-active' : ''}`}
                            aria-pressed={selectMode}
                            aria-label={t('content.bulk.select')}
                            title={t('content.bulk.select')}
                            onClick={toggleSelectMode}
                        >
                            <CheckSquare size={15} />
                        </button>
                    )}
                </div>
            </div>

            {filtersActive && (
                <div className="zenith-content-gallery__resultbar">
                    <span>
                        {t('content.shown', { shown: filteredItems.length, total: items.length })}
                    </span>
                    {genreFilter && (
                        <button
                            type="button"
                            className="zenith-content-gallery__genre-chip"
                            title={t('common.clear')}
                            onClick={() => setGenreFilter(null)}
                        >
                            <Tag size={11} /> {genreFilter} <X size={11} />
                        </button>
                    )}
                    <button type="button" className="zenith-content-gallery__clear" onClick={clearFilters}>
                        <X size={12} /> {t('common.clearFilters')}
                    </button>
                </div>
            )}

            {selectMode && (
                <div className="zenith-content-gallery__bulkbar">
                    <span className="zenith-content-gallery__bulkcount">
                        {t.plural('content.bulk.selected', picked.size)}
                    </span>
                    <button
                        type="button"
                        className="zenith-content-gallery__clear"
                        onClick={() =>
                            setPicked(
                                picked.size === visible.length
                                    ? new Set()
                                    : new Set(visible.map((i) => i.id))
                            )
                        }
                    >
                        {t(picked.size === visible.length ? 'content.bulk.none' : 'content.bulk.all')}
                    </button>
                    {/* An action, not a setting: it never holds a value, so the
                        placeholder is always what it says. */}
                    <Dropdown
                        className="zenith-content-gallery__select"
                        aria-label={t('content.bulk.setStatus')}
                        placeholder={t('content.bulk.setStatus')}
                        value=""
                        disabled={picked.size === 0 || bulkBusy}
                        options={CONTENT_STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))}
                        onChange={(v) => void bulkStatus(v as ContentStatus)}
                    />
                    <button
                        type="button"
                        className="zenith-content-gallery__bulkdelete"
                        disabled={picked.size === 0 || bulkBusy}
                        onClick={() => void bulkDelete()}
                    >
                        <Trash2 size={13} /> {t('common.delete')}
                    </button>
                </div>
            )}

            {continueItems.length > 0 && (
                <section className="zenith-content-shelf">
                    <h2 className="zenith-content-section">
                        {t('content.continue')}
                        <span className="zenith-content-section__count">{continueItems.length}</span>
                    </h2>
                    {/* Wide rows, not the grid's posters: a shelf item is something
                        you're partway through, and the useful surface for it is
                        progress plus a way to advance — not another cover. */}
                    <div className="zenith-content-shelf__row">
                        {continueItems.map((item) => (
                            <ResumeRow
                                key={item.id}
                                item={item}
                                type={typeOf(item.type)}
                                onOpen={(i) => setSelectedId(i.id)}
                                selectionMode={selectMode}
                                selected={picked.has(item.id)}
                                onToggleSelect={togglePicked}
                            />
                        ))}
                    </div>
                </section>
            )}

            {gridItems.length === 0 ? (
                // With the shelf showing everything, an empty grid is a success
                // state ("nothing left in the backlog"), not a dead end.
                filtersActive || continueItems.length === 0 ? (
                    <div className="zenith-empty-state">
                        <span className="zenith-empty-state__icon">🎬</span>
                        <p className="zenith-empty-state__text">
                            {t(filtersActive ? 'content.noMatch' : 'content.empty')}
                        </p>
                        {filtersActive ? (
                            <button type="button" className="zenith-content-gallery__clear" onClick={clearFilters}>
                                <X size={12} /> {t('common.clearFilters')}
                            </button>
                        ) : (
                            <p className="zenith-text--muted">{t('content.emptyHint')}</p>
                        )}
                    </div>
                ) : (
                    <p className="zenith-content-gallery__allclear">
                        {t('content.allClear')}
                    </p>
                )
            ) : (
                <section>
                    {continueItems.length > 0 && (
                        <h2 className="zenith-content-section">
                            {t('content.library')}
                            <span className="zenith-content-section__count">{gridItems.length}</span>
                        </h2>
                    )}
                    <div className="zenith-content-gallery__grid">
                        {gridItems.map((item) => (
                            <ContentCard
                                key={item.id}
                                item={item}
                                type={typeOf(item.type)}
                                onOpen={(i) => setSelectedId(i.id)}
                                selectionMode={selectMode}
                                selected={picked.has(item.id)}
                                onToggleSelect={togglePicked}
                            />
                        ))}
                    </div>
                </section>
            )}

            {selected && (
                <ContentDetailModal
                    item={selected}
                    type={typeOf(selected.type)}
                    onClose={() => setSelectedId(null)}
                />
            )}
        </div>
    );
};
