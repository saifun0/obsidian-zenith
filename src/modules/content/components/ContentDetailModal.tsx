import { useFeature } from '../../../core/useFeature';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { CalendarCheck, CalendarClock, ExternalLink, FileText, RefreshCw, Trash2 } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig, ContentFieldId } from '../../../core/contentTypes';
import { CONTENT_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { ContentWriter } from '../services/contentWriter';
import { setItemStatus } from '../services/contentActions';
import { datesForStatus, daysBetween, type ContentDates } from '../services/contentDates';
import { cacheCover, isRemoteCover } from '../services/coverCache';
import { findRefreshedMetadata } from '../services/metadata/resync';
import { providerSearchable } from '../services/metadata';
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

interface ContentDetailModalProps {
    item: ContentItem;
    type: ContentTypeConfig;
    onClose: () => void;
}

/** Characters of synopsis to show before folding the rest behind a toggle. */
const DESC_CLAMP = 320;

const STATUS_KEY: Record<ContentStatus, string> = {
    backlog: 'status.backlog',
    'in-progress': 'status.inProgress',
    completed: 'status.completed',
    dropped: 'status.dropped',
};

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
export const ContentDetailModal: React.FC<ContentDetailModalProps> = ({ item, type, onClose }) => {
    const { app } = useApp();
    const t = useTranslation();
    const genreFilterOn = useFeature('content.genreFilter');
    const updateItemRating = useZenithStore((s) => s.updateItemRating);
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const setContentGenreFilter = useZenithStore((s) => s.setContentGenreFilter);
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
    const cacheCovers = useZenithStore((s) => s.settings.cacheCovers);

    // Local mirror so the modal reflects edits without waiting for a re-parse.
    const [rating, setRating] = useState(item.rating);
    const [status, setStatus] = useState<ContentStatus>(item.status);
    const [dates, setDates] = useState<ContentDates>({ started: item.started, finished: item.finished });
    const [progress, setProgress] = useState<ProgressValue>({
        current: item.progressCurrent ?? 0,
        total: item.progressTotal,
    });
    const [busy, setBusy] = useState<'resync' | 'delete' | null>(null);
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
        setDates({ started: item.started, finished: item.finished });
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
        const patch = datesForStatus(value, pending.current.dates, getTodayString());
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
            const patch = datesForStatus(nextStatus, pending.current.dates, getTodayString());
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

    /**
     * Re-fetch this item's metadata from the source it was filled from.
     *
     * Only overwrites the fields a provider owns, and only when it can identify
     * the same work again — a re-sync that silently rebound an item to a
     * different film with a similar title would be worse than not refreshing.
     *
     * Two things a provider does *not* own: your rating, which goes to
     * `externalRating` so both scores can coexist, and the decision to keep
     * covers in the vault — a refreshed cover is cached exactly like a new
     * item's, or the refresh would quietly opt this item out of working offline.
     */
    const resync = async () => {
        if (busy) return;
        setBusy('resync');
        try {
            const fresh = await findRefreshedMetadata(type.provider, item.title, item.sourceId);
            if (!fresh) {
                new Notice(t('content.error.resync'));
                return;
            }

            let cover = fresh.coverUrl ?? item.coverImage;
            if (cacheCovers && cover && isRemoteCover(cover)) {
                cover = (await cacheCover(app, contentFolderPath, item.title, cover)) ?? cover;
            }

            await writer.current.patch(item.filePath, {
                cover,
                year: fresh.year ?? item.year,
                creator: fresh.creator ?? item.creator,
                genres: fresh.genres?.length ? fresh.genres : item.genres,
                externalRating:
                    typeof fresh.rating === 'number'
                        ? Math.round(fresh.rating * 10) / 10
                        : item.externalRating,
                progressTotal: fresh.total ?? item.progressTotal,
                source: fresh.source ?? item.source,
                sourceId: fresh.sourceId ?? item.sourceId,
            });
            new Notice(t('content.resynced'));
        } catch (err) {
            console.error('Zenith: Failed to refresh metadata:', err);
            new Notice(t('content.error.resync'));
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (busy) return;
        // The note goes to the vault's trash, so this is a reassurance rather
        // than a last warning.
        if (!window.confirm(t('content.detail.deleteConfirm', { title: item.title }))) return;
        setBusy('delete');
        try {
            if (await writer.current.deleteItem(item.filePath)) onClose();
            else new Notice(t('content.error.delete'));
        } catch (err) {
            console.error('Zenith: Failed to delete item:', err);
            new Notice(t('content.error.delete'));
        } finally {
            setBusy(null);
        }
    };

    const sub = [item.year, type.creatorLabel && item.creator ? `${type.creatorLabel}: ${item.creator}` : item.creator]
        .filter(Boolean)
        .join('  ·  ');

    const span = daysBetween(dates.started, dates.finished);
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
                <h2 className="zenith-content-modal__title">{item.title}</h2>
                {sub && <p className="zenith-content-modal__sub">{sub}</p>}

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
                                {item.externalRating != null && (
                                    <span
                                        className="zenith-content-modal__external"
                                        title={t('content.detail.externalRatingHint')}
                                    >
                                        {t('content.detail.externalRating', {
                                            value: item.externalRating.toFixed(1),
                                        })}
                                    </span>
                                )}
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
                            options={CONTENT_STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))}
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
                        {span != null && (
                            <span className="zenith-content-modal__date zenith-text--muted">
                                {t.plural('content.detail.tookDays', span)}
                            </span>
                        )}
                    </div>
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
                    {item.source && (
                        <a
                            className="zenith-btn zenith-btn--ghost"
                            href={item.source}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ExternalLink size={15} /> {t('content.detail.source')}
                        </a>
                    )}
                    {providerSearchable(type.provider) && (
                        <button
                            className="zenith-btn zenith-btn--ghost"
                            onClick={() => void resync()}
                            disabled={busy !== null}
                            title={t('content.detail.resync')}
                        >
                            <RefreshCw size={15} className={busy === 'resync' ? 'zenith-spin' : ''} />
                            {t(busy === 'resync' ? 'content.detail.resyncing' : 'content.detail.resync')}
                        </button>
                    )}
                    {/* Destructive, so it sits apart from the row and is named by
                        its tooltip: as a full red button it read as one of the
                        four things you might reasonably want to do next. */}
                    <button
                        className="zenith-btn zenith-content-modal__delete"
                        onClick={() => void remove()}
                        disabled={busy !== null}
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
