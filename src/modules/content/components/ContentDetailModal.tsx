import { useFeature } from '../../../core/useFeature';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { CalendarCheck, CalendarClock, FileText, Layers, Trash2 } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig, ContentFieldId } from '../../../core/contentTypes';
import type { ContentStatus } from '../../../core/constants';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { confirmDelete } from '../../../core/ConfirmModal';
import { ContentWriter } from '../services/contentWriter';
import { setItemsSeries, setItemStatus } from '../services/contentActions';
import { partsOf, seriesKey } from '../services/series';
import { askSeriesName } from './seriesPrompt';
import { daysBetween, type ContentDates } from '../services/contentDates';
import { readingsOf, transitionFor } from '../services/readings';
import { getTodayString } from '../../../core/dateUtils';
import { useTranslation } from '../../../core/i18n';
import { resolveCover } from '../services/coverUrl';
import { DEFAULT_PROGRESS_UNIT, statusForProgress, type ProgressValue } from '../services/progress';
import { openFileAtLine } from '../../../core/openInVault';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { Modal } from '../../../components/shared/Modal';
import { Dropdown } from '../../../components/ui/fields';
import { StarRating } from '../../../components/shared/StarRating';
import { ProgressControl } from './ProgressControl';
import { ItemHeart } from './FavoriteHeart';
import { STATUS_ORDER, statusLabel } from '../contentLabels';

interface ContentDetailModalProps {
    item: ContentItem;
    type: ContentTypeConfig;
    onClose: () => void;
    /** Open the series this item is a part of, by its key. Absent with series off. */
    onOpenSeries?: (key: string) => void;
}

/** Characters of synopsis to show before folding the rest behind a toggle. */
const DESC_CLAMP = 320;

/** How long to sit on rapid progress clicks before writing to disk. */
const PROGRESS_WRITE_DELAY = 600;

/**
 * ContentDetailModal — a rich detail view for one item: big poster, metadata,
 * synopsis, and editable rating / status / progress.
 *
 * Edits are optimistic: local state updates immediately, the store is patched,
 * and only then does the file get written. That matters because writing the
 * note fires a vault event which re-parses the folder and hands this component
 * a *new* item object a moment later — without the local mirror, every single
 * edit visibly reset the modal. Progress writes are additionally debounced so
 * holding "+1" produces one file write, not ten.
 */
export const ContentDetailModal: React.FC<ContentDetailModalProps> = ({ item, type, onClose, onOpenSeries }) => {
    const { app } = useApp();
    const t = useTranslation();
    const genreFilterOn = useFeature('content.genreFilter');
    const readingsOn = useFeature('content.readings');
    const updateItemRating = useZenithStore((s) => s.updateItemRating);
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const setContentGenreFilter = useZenithStore((s) => s.setContentGenreFilter);
    const library = useZenithStore((s) => s.contentItems);

    /** Where this item stands in its series: "3 of 11". */
    const series = useMemo(() => {
        if (!onOpenSeries || !item.series?.trim()) return null;
        const key = seriesKey(item.series);
        const parts = partsOf(library, key);
        return { key, index: parts.findIndex((p) => p.id === item.id) + 1, total: parts.length };
    }, [onOpenSeries, item.series, item.id, library]);

    const putInSeries = async () => {
        const name = await askSeriesName(app, t, item.series ?? '');
        if (!name) return;
        try {
            await setItemsSeries(app, [item], name);
        } catch (err) {
            console.error('Zenith: Failed to set series:', err);
            new Notice(t('content.error.series'));
        }
    };

    // Local mirror so the modal reflects edits without waiting for a re-parse.
    const [rating, setRating] = useState(item.rating);
    const [status, setStatus] = useState<ContentStatus>(item.status);
    const [dates, setDates] = useState<ContentDates & { readings?: string[] }>({
        started: item.started,
        finished: item.finished,
        readings: item.readings,
    });
    const [progress, setProgress] = useState<ProgressValue>({
        current: item.progressCurrent ?? 0,
        total: item.progressTotal,
    });
    const [busy, setBusy] = useState(false);
    const [showFullDesc, setShowFullDesc] = useState(false);

    const writer = useRef(new ContentWriter(app));
    const progressTimer = useRef<number | null>(null);
    // Freshest values, for the debounced writer to read at fire time.
    const pending = useRef({ progress, status, dates });
    pending.current = { progress, status, dates };

    // Re-sync when a *different* item is shown (the modal instance is reused
    // between cards). Keyed on id, not on the values, so the re-parse triggered
    // by our own write can't clobber an edit that hasn't been flushed yet.
    const [shownId, setShownId] = useState(item.id);
    if (shownId !== item.id) {
        setShownId(item.id);
        setRating(item.rating);
        setStatus(item.status);
        setDates({ started: item.started, finished: item.finished, readings: item.readings });
        setProgress({ current: item.progressCurrent ?? 0, total: item.progressTotal });
        setShowFullDesc(false);
    }

    const shows = (f: ContentFieldId) => type.fields.includes(f);
    const coverUrl = resolveCover(app, item.coverImage);
    const unit = type.progressUnit || DEFAULT_PROGRESS_UNIT;

    const persistRating = async (value: number) => {
        setRating(value);
        updateItemRating(item.id, value);
        try {
            await writer.current.setRating(item.filePath, value);
        } catch (err) {
            console.error('Zenith: Failed to save rating:', err);
            new Notice(t('content.error.rating'));
        }
    };

    const persistStatus = async (value: ContentStatus) => {
        setStatus(value);
        // Mirror the date stamps locally too, so the "started / finished" row
        // updates with the dropdown rather than a re-parse later.
        const patch = transitionFor(value, pending.current.dates, getTodayString(), readingsOn);
        if (patch) setDates((d) => ({ ...d, ...patch }));
        patchContentItem(item.id, { status: value, ...(patch ?? {}) });
        try {
            await setItemStatus(app, item, value);
        } catch (err) {
            console.error('Zenith: Failed to save status:', err);
            new Notice(t('content.error.status'));
        }
    };

    const flushProgress = useCallback(async () => {
        const { progress: p, status: s, dates: d } = pending.current;
        try {
            await writer.current.patch(item.filePath, {
                progress: p.current > 0 ? p.current : undefined,
                progressTotal: p.total && p.total > 0 ? p.total : undefined,
                status: s,
                // Spread last: an undefined date here means "clear the key",
                // which is what going back to the backlog has to do.
                ...d,
            });
        } catch (err) {
            console.error('Zenith: Failed to save progress:', err);
            new Notice(t('content.error.progress'));
        }
    }, [item.filePath, t]);

    const changeProgress = (next: ProgressValue) => {
        setProgress(next);
        // Finishing the last episode moves the item to Completed on its own —
        // and that transition earns its date stamp exactly like a manual one.
        const nextStatus = statusForProgress(next, status);
        let datePatch: ContentDates | null = null;
        if (nextStatus !== status) {
            setStatus(nextStatus);
            const patch = transitionFor(
                nextStatus,
                pending.current.dates,
                getTodayString(),
                readingsOn
            );
            if (patch) setDates((d) => ({ ...d, ...patch }));
            datePatch = patch;
        }

        patchContentItem(item.id, {
            progressCurrent: next.current,
            progressTotal: next.total,
            status: nextStatus,
            ...(datePatch ?? {}),
        });

        if (progressTimer.current) window.clearTimeout(progressTimer.current);
        progressTimer.current = window.setTimeout(() => {
            // Cleared before the write so closing the modal afterwards doesn't
            // flush the same values a second time.
            progressTimer.current = null;
            void flushProgress();
        }, PROGRESS_WRITE_DELAY);
    };

    // Never lose a pending progress write when the modal closes.
    useEffect(
        () => () => {
            if (progressTimer.current) {
                window.clearTimeout(progressTimer.current);
                void flushProgress();
            }
        },
        [flushProgress]
    );

    const remove = async () => {
        if (busy) return;
        // The note goes to the vault's trash, so this is a reassurance rather
        // than a last warning.
        if (!(await confirmDelete(app, t('content.detail.deleteConfirm', { title: item.title })))) return;
        setBusy(true);
        try {
            if (await writer.current.deleteItem(item.filePath)) onClose();
            else new Notice(t('content.error.delete'));
        } catch (err) {
            console.error('Zenith: Failed to delete item:', err);
            new Notice(t('content.error.delete'));
        } finally {
            setBusy(false);
        }
    };

    const sub = [item.year, type.creatorLabel && item.creator ? `${type.creatorLabel}: ${item.creator}` : item.creator]
        .filter(Boolean)
        .join('  ·  ');

    const span = daysBetween(dates.started, dates.finished);
    const readings = readingsOf(dates);
    const descTruncated = (item.description?.length ?? 0) > DESC_CLAMP;

    return (
        <Modal
            title={item.title}
            header={null}
            onClose={onClose}
            size="lg"
            bare
            className="zenith-content-modal"
        >
            <div
                className="zenith-content-modal__poster"
                style={
                    coverUrl
                        ? { backgroundImage: `url("${coverUrl}")` }
                        : { background: `linear-gradient(160deg, ${type.color}44, ${type.color}18)` }
                }
            >
                {!coverUrl && (
                    <span style={{ color: type.color }}>
                        <ObsidianIcon name={type.icon} size={56} />
                    </span>
                )}
            </div>

            <div className="zenith-content-modal__body">
                <span className="zenith-content-modal__type" style={{ color: type.color }}>
                    <ObsidianIcon name={type.icon} size={13} />
                    {type.label}
                </span>
                <div className="zenith-content-modal__title-row">
                    <h2 className="zenith-content-modal__title">{item.title}</h2>
                    <ItemHeart item={item} size={18} />
                </div>
                {item.aliases && item.aliases.length > 0 && (
                    <p className="zenith-content-modal__aliases">{item.aliases.join(' · ')}</p>
                )}
                {sub && <p className="zenith-content-modal__sub">{sub}</p>}
                {series && onOpenSeries && (
                    <button
                        type="button"
                        className="zenith-content-modal__series"
                        onClick={() => onOpenSeries(series.key)}
                    >
                        <Layers size={13} />
                        <span className="zenith-content-modal__series-name">{item.series}</span>
                        {series.total > 1 && (
                            <span className="zenith-text--muted">
                                {t('content.series.of', { index: series.index, total: series.total })}
                            </span>
                        )}
                    </button>
                )}

                {shows('genres') && item.genres && item.genres.length > 0 && (
                    <div className="zenith-content-modal__genres">
                        {item.genres.map((g) => (
                            // A genre is the most natural way to ask "what else
                            // like this do I have"; clicking one filters the
                            // library rather than just sitting there as a label.
                            genreFilterOn ? (
                                <button
                                    type="button"
                                    key={g}
                                    className="zenith-content-modal__chip"
                                    title={t('content.filterByGenre', { genre: g })}
                                    onClick={() => {
                                        setContentGenreFilter(g);
                                        onClose();
                                    }}
                                >
                                    {g}
                                </button>
                            ) : (
                                <span key={g} className="zenith-content-modal__chip">
                                    {g}
                                </span>
                            )
                        ))}
                    </div>
                )}

                {/* One panel, not three stacked fields. Rating, status and
                    progress are the three things you come here to change, so
                    they read as a single instrument with hairline dividers
                    rather than as a settings form. */}
                <div className="zenith-content-modal__panel">
                    {shows('rating') && (
                        <div className="zenith-content-modal__cell">
                            <span className="zenith-content-modal__control-label">{t('content.form.rating')}</span>
                            <div className="zenith-content-modal__rating">
                                <StarRating
                                    value={rating}
                                    onChange={(v) => void persistRating(v)}
                                    showValue
                                    ariaLabel={t('content.form.rating')}
                                />
                            </div>
                        </div>
                    )}
                    <div className="zenith-content-modal__cell">
                        <span className="zenith-content-modal__control-label">{t('content.form.status')}</span>
                        <Dropdown
                            size="sm"
                            className={`zenith-content-modal__status is-${status}`}
                            aria-label={t('content.form.status')}
                            value={status}
                            options={STATUS_ORDER.map((s) => ({
                                value: s,
                                label: statusLabel(t, s, item.type),
                            }))}
                            onChange={(v) => void persistStatus(v as ContentStatus)}
                        />
                    </div>
                    {shows('progress') && (
                        <div className="zenith-content-modal__cell zenith-content-modal__cell--progress">
                            <span className="zenith-content-modal__control-label">{t('content.form.progress')}</span>
                            <ProgressControl value={progress} onChange={changeProgress} unit={unit} />
                        </div>
                    )}
                </div>

                {(dates.started || dates.finished) && (
                    <div className="zenith-content-modal__dates">
                        {dates.started && (
                            <span className="zenith-content-modal__date">
                                <CalendarClock size={13} />
                                {t('content.detail.started', { date: dates.started })}
                            </span>
                        )}
                        {dates.finished && (
                            <span className="zenith-content-modal__date">
                                <CalendarCheck size={13} />
                                {t('content.detail.finished', { date: dates.finished })}
                            </span>
                        )}
                        {span != null && readings.length < 2 && (
                            <span className="zenith-content-modal__date zenith-text--muted">
                                {t.plural('content.detail.tookDays', span)}
                            </span>
                        )}
                    </div>
                )}

                {/* Every reading, once there is more than one: the history the
                    two dates above can only summarise. */}
                {readings.length > 1 && (
                    <ol className="zenith-content-modal__readings" aria-label={t('content.detail.readings')}>
                        {readings.map((r, i) => {
                            const days = daysBetween(r.start, r.end);
                            return (
                                <li key={i}>
                                    {r.end
                                        ? t('content.detail.readingSpan', {
                                              from: r.start ?? '…',
                                              to: r.end,
                                          })
                                        : t('content.detail.readingOpen', { date: r.start ?? '…' })}
                                    {days != null && (
                                        <span className="zenith-text--muted">
                                            {' · '}
                                            {t.plural('content.detail.tookDays', days)}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}

                {shows('description') && item.description && (
                    // A synopsis is a paragraph; a review written into the note
                    // body can be pages. Folding the tail keeps the actions
                    // reachable without scrolling past someone's own essay.
                    <div className="zenith-content-modal__desc">
                        <p>{descTruncated && !showFullDesc ? `${item.description.slice(0, DESC_CLAMP).trimEnd()}…` : item.description}</p>
                        {descTruncated && (
                            <button
                                type="button"
                                className="zenith-content-modal__desc-toggle"
                                onClick={() => setShowFullDesc((v) => !v)}
                            >
                                {t(showFullDesc ? 'common.showLess' : 'common.showMore')}
                            </button>
                        )}
                    </div>
                )}

                {shows('tags') && item.tags.length > 0 && (
                    <div className="zenith-content-modal__tags">
                        {item.tags.map((t) => (
                            <span key={t} className="zenith-content-modal__tag">
                                #{t}
                            </span>
                        ))}
                    </div>
                )}

                <div className="zenith-content-modal__actions">
                    <button
                        className="zenith-btn zenith-btn--primary"
                        onClick={() => {
                            void openFileAtLine(app, item.filePath);
                            onClose();
                        }}
                    >
                        <FileText size={15} /> {t('common.openNote')}
                    </button>
                    {onOpenSeries && (
                        <button
                            className="zenith-btn zenith-btn--ghost"
                            onClick={() => void putInSeries()}
                            aria-label={t('content.series.putIn')}
                            title={t('content.series.putIn')}
                        >
                            <Layers size={15} />
                        </button>
                    )}
                    {/* Destructive, so it sits apart from the row and is named by
                        its tooltip: as a full red button it read as one of the
                        things you might reasonably want to do next. */}
                    <button
                        className="zenith-btn zenith-content-modal__delete"
                        onClick={() => void remove()}
                        disabled={busy}
                        aria-label={t('content.detail.delete')}
                        title={t('content.detail.delete')}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>
        </Modal>
    );
};
