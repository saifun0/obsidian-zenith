import React, { useState, useMemo, useRef, type FC } from 'react';
import { Notice } from 'obsidian';
import { Plus, Loader2, ImageOff, AlertTriangle } from 'lucide-react';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { CONTENT_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import {
    effectiveContentTypes,
    resolveContentType,
    type ContentFieldId,
} from '../../../core/contentTypes';
import { ContentWriter } from '../services/contentWriter';
import { findDuplicates } from '../services/contentDuplicates';
import { enrichMetadata } from '../services/metadata';
import type { MetadataResult } from '../services/metadata/types';
import { DEFAULT_PROGRESS_UNIT, statusForProgress, type ProgressValue } from '../services/progress';
import { resolveCover } from '../services/coverUrl';
import { cacheCover, isRemoteCover } from '../services/coverCache';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { Modal } from '../../../components/shared/Modal';
import { StarRating } from '../../../components/shared/StarRating';
import { MetadataPicker } from './MetadataPicker';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { ProgressControl } from './ProgressControl';

interface ContentFormProps {
    onCancel: () => void;
    onCreated?: () => void | Promise<void>;
}

const STATUS_KEY: Record<ContentStatus, string> = {
    backlog: 'status.backlog',
    'in-progress': 'status.inProgress',
    completed: 'status.completed',
    dropped: 'status.dropped',
};

/**
 * ContentForm — the "add item" dialog: pick a type, type a title, and the type's
 * keyless provider auto-fills cover/year/creator/genres/rating/synopsis/length
 * from a picked result. Every field stays editable; providers are an assist, not
 * a requirement (types with the `none` provider are pure manual entry).
 *
 * It lives in a real {@link Modal} rather than inline above the gallery: the
 * form is long, and inline it pushed the whole library down the page and had
 * nowhere sensible to put the search dropdown on a phone.
 */
export const ContentForm: FC<ContentFormProps> = ({ onCancel, onCreated }) => {
    const { app } = useApp();
    const t = useTranslation();
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
    const cacheCovers = useZenithStore((s) => s.settings.cacheCovers);
    const existingItems = useZenithStore((s) => s.contentItems);
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);

    const [typeId, setTypeId] = useState(types[0]?.id ?? 'other');
    const typeCfg = useMemo(() => resolveContentType(types, typeId), [types, typeId]);
    const shows = (f: ContentFieldId) => typeCfg.fields.includes(f);
    const unit = typeCfg.progressUnit || DEFAULT_PROGRESS_UNIT;

    const [title, setTitle] = useState('');
    const [status, setStatus] = useState<ContentStatus>('backlog');
    const [rating, setRating] = useState(0);
    const [externalRating, setExternalRating] = useState<number | undefined>(undefined);
    const [coverImage, setCoverImage] = useState('');
    const [year, setYear] = useState('');
    const [creator, setCreator] = useState('');
    const [genresInput, setGenresInput] = useState('');
    const [progress, setProgress] = useState<ProgressValue>({ current: 0 });
    const [tagsInput, setTagsInput] = useState('');
    const [description, setDescription] = useState('');
    const [source, setSource] = useState('');
    const [sourceId, setSourceId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [coverBroken, setCoverBroken] = useState(false);

    // Set right after a pick so the resulting title change doesn't re-search.
    const [justPicked, setJustPicked] = useState(false);
    const enrichSeq = useRef(0);

    /** Apply a metadata hit over the form, leaving anything it lacks untouched. */
    const applyResult = (r: MetadataResult) => {
        setTitle(r.title);
        if (r.coverUrl) {
            setCoverImage(r.coverUrl);
            setCoverBroken(false);
        }
        if (r.year) setYear(String(r.year));
        if (r.creator) setCreator(r.creator);
        if (r.genres?.length) setGenresInput(r.genres.join(', '));
        // The source's score is recorded as the source's, not as yours. Filling
        // your stars with a number you haven't given means a library where
        // "rated 8" and "IMDb says 8" are indistinguishable a year later.
        if (typeof r.rating === 'number') setExternalRating(Math.round(r.rating * 10) / 10);
        if (r.description) setDescription(r.description);
        if (r.total) setProgress((p) => ({ current: p.current, total: r.total }));
        setSource(r.source ?? '');
        setSourceId(r.sourceId ?? '');
    };

    const pick = async (r: MetadataResult) => {
        setJustPicked(true);
        applyResult(r);

        // Some sources (Steam) only return names from search; fetch the rest now.
        if (r.enrichKey) {
            const seq = ++enrichSeq.current;
            setEnriching(true);
            try {
                const full = await enrichMetadata(typeCfg.provider, r);
                if (seq === enrichSeq.current) applyResult(full);
            } finally {
                if (seq === enrichSeq.current) setEnriching(false);
            }
        }
    };

    const editTitle = (next: string) => {
        setTitle(next);
        // Typing over an auto-filled title invalidates its provenance.
        if (justPicked) {
            setJustPicked(false);
            setSource('');
            setSourceId('');
        }
    };

    const changeType = (id: string) => {
        setTypeId(id);
        setJustPicked(false);
    };

    // Nothing here blocks the save — it only shows what's already in the library
    // so adding a second copy is a decision rather than an accident.
    const duplicates = useMemo(
        () => findDuplicates(existingItems, title, typeId).slice(0, 3),
        [existingItems, title, typeId]
    );

    const splitList = (raw: string) =>
        raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        const trimmed = title.trim();
        if (!trimmed) return;

        setSubmitting(true);
        try {
            const parsedYear = Number(year);
            const tracksProgress = shows('progress');

            // Pull the artwork into the vault so the library still has covers
            // offline. Best-effort: on failure the remote URL is kept as-is.
            let cover = coverImage.trim();
            if (cacheCovers && isRemoteCover(cover)) {
                cover = (await cacheCover(app, contentFolderPath, trimmed, cover)) ?? cover;
            }
            // Starting or finishing something in the add form should land in the
            // right column without a second edit.
            const finalStatus = tracksProgress ? statusForProgress(progress, status) : status;

            await new ContentWriter(app).createItem(contentFolderPath, {
                title: trimmed,
                type: typeId,
                status: finalStatus,
                rating,
                tags: splitList(tagsInput),
                coverImage: cover || undefined,
                description: description.trim() || undefined,
                year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : undefined,
                creator: creator.trim() || undefined,
                genres: splitList(genresInput),
                progress: tracksProgress ? progress.current : undefined,
                progressTotal: tracksProgress ? progress.total : undefined,
                source: source.trim() || undefined,
                sourceId: sourceId.trim() || undefined,
                externalRating,
                // An item added as already-finished is finished today; anything
                // else has no date to claim yet.
                finished: finalStatus === 'completed' ? getTodayString() : undefined,
                started: finalStatus === 'in-progress' ? getTodayString() : undefined,
            });
            await onCreated?.();
            onCancel();
        } catch (err) {
            console.error('Zenith: Failed to create content item:', err);
            new Notice(t('content.error.create'));
        } finally {
            setSubmitting(false);
        }
    };

    const coverPreview = coverBroken ? undefined : resolveCover(app, coverImage.trim() || undefined);

    const footer = (
        <>
            <button type="button" className="zenith-btn zenith-btn--ghost" onClick={onCancel}>
                {t('common.cancel')}
            </button>
            <button
                type="submit"
                form="zenith-content-form"
                className="zenith-btn zenith-btn--primary"
                disabled={!title.trim() || submitting}
            >
                {submitting ? <Loader2 size={14} className="zenith-spin" /> : <Plus size={14} />}
                {t(submitting ? 'content.form.adding' : 'content.addItem')}
            </button>
        </>
    );

    return (
        <Modal title={t('content.form.newItem')} onClose={onCancel} size="lg" className="zenith-content-form-modal" footer={footer}>
            <form id="zenith-content-form" className="zenith-form" onSubmit={handleSubmit}>
                {/* Type picker */}
                <div className="zenith-form__types" role="tablist" aria-label={t('content.form.newItem')}>
                    {types.map((t) => (
                        <button
                            type="button"
                            key={t.id}
                            role="tab"
                            aria-selected={t.id === typeId}
                            className={`zenith-type-pill ${t.id === typeId ? 'is-active' : ''}`}
                            style={
                                t.id === typeId
                                    ? { borderColor: t.color, color: t.color, background: `${t.color}1f` }
                                    : undefined
                            }
                            onClick={() => changeType(t.id)}
                        >
                            <ObsidianIcon name={t.icon} size={14} />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Poster preview + the identity fields it belongs to */}
                <div className="zenith-form__identity">
                    <div className="zenith-form__poster">
                        <div
                            className="zenith-form__poster-art"
                            style={
                                coverPreview
                                    ? { backgroundImage: `url("${coverPreview}")` }
                                    : { background: `linear-gradient(160deg, ${typeCfg.color}33, ${typeCfg.color}12)` }
                            }
                        >
                            {!coverPreview && (
                                <span style={{ color: typeCfg.color }}>
                                    <ObsidianIcon name={typeCfg.icon} size={30} />
                                </span>
                            )}
                            {enriching && (
                                <span className="zenith-form__poster-busy">
                                    <Loader2 size={18} className="zenith-spin" />
                                </span>
                            )}
                        </div>
                        {coverBroken && (
                            <span className="zenith-form__poster-hint">
                                <ImageOff size={11} /> {t('content.form.coverBroken')}
                            </span>
                        )}
                        {/* Off-screen probe: tells us if the cover URL actually resolves. */}
                        {coverImage.trim() && (
                            <img
                                src={resolveCover(app, coverImage.trim())}
                                alt=""
                                aria-hidden="true"
                                className="zenith-form__poster-probe"
                                onError={() => setCoverBroken(true)}
                                onLoad={() => setCoverBroken(false)}
                            />
                        )}
                    </div>

                    <div className="zenith-form__identity-fields">
                        <div className="zenith-field">
                            <label className="zenith-field__label" htmlFor="content-title">
                                {t('content.form.titleLabel')}
                            </label>
                            <MetadataPicker
                                provider={typeCfg.provider}
                                value={title}
                                onValueChange={editTitle}
                                onPick={pick}
                                suppressed={justPicked}
                            />
                            {duplicates.length > 0 && (
                                <div className="zenith-form__dupes">
                                    <span className="zenith-form__dupes-head">
                                        <AlertTriangle size={12} />
                                        {t(
                                            duplicates[0].kind === 'exact'
                                                ? 'content.form.duplicateExact'
                                                : 'content.form.duplicateSimilar'
                                        )}
                                    </span>
                                    {duplicates.map(({ item }) => {
                                        const cfg = resolveContentType(types, item.type);
                                        return (
                                            <span key={item.id} className="zenith-form__dupe">
                                                <ObsidianIcon name={cfg.icon} size={11} />
                                                {item.title}
                                                <span className="zenith-text--muted">
                                                    {[cfg.label, item.year].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="zenith-field">
                            <label className="zenith-field__label" htmlFor="content-cover">
                                {t('content.form.cover')}
                            </label>
                            <input
                                id="content-cover"
                                type="text"
                                className="zenith-field__input"
                                placeholder={t('content.form.coverPlaceholder')}
                                value={coverImage}
                                onChange={(e) => {
                                    setCoverImage(e.target.value);
                                    setCoverBroken(false);
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className="zenith-form__grid">
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="content-status">
                            {t('content.form.status')}
                        </label>
                        <select
                            id="content-status"
                            className="zenith-field__input zenith-field__select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as ContentStatus)}
                        >
                            {CONTENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {t(STATUS_KEY[s])}
                                </option>
                            ))}
                        </select>
                    </div>

                    {shows('year') && (
                        <div className="zenith-field">
                            <label className="zenith-field__label" htmlFor="content-year">
                                {t('content.form.year')}
                            </label>
                            <input
                                id="content-year"
                                type="number"
                                className="zenith-field__input"
                                placeholder="2024"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                            />
                        </div>
                    )}

                    {shows('creator') && (
                        <div className="zenith-field">
                            <label className="zenith-field__label" htmlFor="content-creator">
                                {typeCfg.creatorLabel ?? 'Creator'}
                            </label>
                            <input
                                id="content-creator"
                                type="text"
                                className="zenith-field__input"
                                value={creator}
                                onChange={(e) => setCreator(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {shows('rating') && (
                    <div className="zenith-field">
                        <span className="zenith-field__label">{t('content.form.rating')}</span>
                        <div className="zenith-form__rating">
                            <StarRating value={rating} onChange={setRating} showValue ariaLabel={t('content.form.rating')} />
                            {externalRating != null && (
                                <span
                                    className="zenith-form__external"
                                    title={t('content.detail.externalRatingHint')}
                                >
                                    {t('content.detail.externalRating', { value: externalRating.toFixed(1) })}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {shows('progress') && (
                    <div className="zenith-field">
                        <span className="zenith-field__label">{t('content.form.progress')}</span>
                        <ProgressControl value={progress} onChange={setProgress} unit={unit} compact />
                    </div>
                )}

                {shows('genres') && (
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="content-genres">
                            {t('content.form.genres')}
                        </label>
                        <input
                            id="content-genres"
                            type="text"
                            className="zenith-field__input"
                            placeholder={t('content.form.genresPlaceholder')}
                            value={genresInput}
                            onChange={(e) => setGenresInput(e.target.value)}
                        />
                    </div>
                )}

                {shows('tags') && (
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="content-tags">
                            {t('content.form.tags')}
                        </label>
                        <input
                            id="content-tags"
                            type="text"
                            className="zenith-field__input"
                            placeholder={t('content.form.tagsPlaceholder')}
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                        />
                    </div>
                )}

                {shows('description') && (
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="content-desc">
                            {t('content.form.description')}
                        </label>
                        <textarea
                            id="content-desc"
                            className="zenith-field__input zenith-field__textarea"
                            rows={4}
                            placeholder={t('content.form.descriptionPlaceholder')}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                )}
            </form>
        </Modal>
    );
};
