import React, { useState, useMemo, type FC } from 'react';
import { Notice } from 'obsidian';
import { Plus, Loader2, Image, ImageOff, AlertTriangle, ChevronRight } from 'lucide-react';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import type { ContentStatus } from '../../../core/constants';
import type { ContentFieldId } from '../../../core/contentTypes';
import { ContentWriter } from '../services/contentWriter';
import { findDuplicates } from '../services/contentDuplicates';
import { DEFAULT_PROGRESS_UNIT, statusForProgress, type ProgressValue } from '../services/progress';
import { resolveCover } from '../services/coverUrl';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { Modal } from '../../../components/shared/Modal';
import { Dropdown } from '../../../components/ui/fields';
import { StarRating } from '../../../components/shared/StarRating';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { ProgressControl } from './ProgressControl';
import { pickVaultImage } from '../../../components/shared/ImagePickerModal';
import { STATUS_ORDER, statusLabel } from '../contentLabels';
import { useContentTypes } from '../useContentTypes';
import { FavoriteHeart } from './FavoriteHeart';
import { useFeature } from '../../../core/useFeature';
import { seriesNames } from './seriesPrompt';
import { cssUrl } from '../../../core/imageSource';

interface ContentFormProps {
    onCancel: () => void;
    onCreated?: () => void | Promise<void>;
    /** Start in this series — a new part added from the series' page. */
    initialSeries?: string;
    /** Start on this type, when it is one of those offered. */
    initialType?: string;
}

/** Statuses that are partway through something, where progress means anything. */
const UNDERWAY: readonly ContentStatus[] = ['in-progress', 'on-hold'];
/** Statuses that are over, where a score means anything. */
const OVER: readonly ContentStatus[] = ['completed', 'dropped'];

/**
 * ContentForm — the "add item" dialog.
 *
 * Something is usually added on the way past — "I should watch that" — and
 * the details are filled in later, if ever. So the form opens on what that
 * takes: the type, the title, the status, and the heart. Progress appears once
 * the status says it has begun, a score once it says it is over; the cover,
 * year, creator, genres, tags and description wait under "More".
 *
 * Nothing is looked up. Auto-fill from online catalogues was tried and removed:
 * it guessed wrong often enough that every item needed checking anyway, and a
 * library is the user's own record rather than a mirror of someone's database.
 * The cover is a picture from the vault or a link pasted by hand, shown from
 * where it is and never downloaded.
 */
export const ContentForm: FC<ContentFormProps> = ({ onCancel, onCreated, initialSeries, initialType }) => {
    const { app } = useApp();
    const t = useTranslation();
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
    const existingItems = useZenithStore((s) => s.contentItems);
    const types = useContentTypes();
    // Only the types switched on are offered; with every one switched off,
    // "other" still gives the form something to write.
    const offered = types.visible.length > 0 ? types.visible : [types.typeOf('other')];

    const [typeId, setTypeId] = useState(
        offered.find((x) => x.id === initialType)?.id ?? offered[0]?.id ?? 'other'
    );
    const seriesOn = useFeature('content.series');
    const [series, setSeries] = useState(initialSeries ?? '');
    const knownSeries = useMemo(() => (seriesOn ? seriesNames() : []), [seriesOn]);
    const typeCfg = types.typeOf(typeId);
    const shows = (f: ContentFieldId) => typeCfg.fields.includes(f);
    const unit = typeCfg.progressUnit || DEFAULT_PROGRESS_UNIT;

    const [title, setTitle] = useState('');
    const [favorite, setFavorite] = useState(false);
    const [status, setStatus] = useState<ContentStatus>('backlog');
    const [rating, setRating] = useState(0);
    const [coverImage, setCoverImage] = useState('');
    const [year, setYear] = useState('');
    const [creator, setCreator] = useState('');
    const [genresInput, setGenresInput] = useState('');
    const [progress, setProgress] = useState<ProgressValue>({ current: 0 });
    const [tagsInput, setTagsInput] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [coverBroken, setCoverBroken] = useState(false);

    const asksProgress = shows('progress') && UNDERWAY.includes(status);
    const asksRating = shows('rating') && OVER.includes(status);
    const hasDetails = ['year', 'creator', 'genres', 'tags', 'description'].some((f) =>
        shows(f as ContentFieldId)
    );

    // Nothing here blocks the save — it only shows what's already in the library
    // so adding a second copy is a decision rather than an accident.
    const duplicates = useMemo(
        () => findDuplicates(existingItems, title, typeId).slice(0, 3),
        [existingItems, title, typeId]
    );

    const splitList = (raw: string) =>
        raw
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        const trimmed = title.trim();
        if (!trimmed) return;

        setSubmitting(true);
        try {
            const parsedYear = Number(year);
            const cover = coverImage.trim();
            // Starting or finishing something in the add form should land in the
            // right section without a second edit.
            const finalStatus = asksProgress ? statusForProgress(progress, status) : status;

            await new ContentWriter(app).createItem(contentFolderPath, {
                title: trimmed,
                type: typeId,
                status: finalStatus,
                rating: asksRating ? rating : 0,
                favorite,
                tags: shows('tags') ? splitList(tagsInput) : [],
                coverImage: cover || undefined,
                description: shows('description') ? description.trim() || undefined : undefined,
                year:
                    shows('year') && Number.isFinite(parsedYear) && parsedYear > 0
                        ? parsedYear
                        : undefined,
                creator: shows('creator') ? creator.trim() || undefined : undefined,
                genres: shows('genres') ? splitList(genresInput) : [],
                progress: asksProgress ? progress.current : undefined,
                progressTotal: asksProgress ? progress.total : undefined,
                // An item added as already-finished is finished today; anything
                // else has no date to claim yet.
                finished: finalStatus === 'completed' ? getTodayString() : undefined,
                started: finalStatus === 'in-progress' ? getTodayString() : undefined,
                series: seriesOn ? series.trim() || undefined : undefined,
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
        <Modal
            title={t('content.form.newItem')}
            onClose={onCancel}
            size="md"
            className="zenith-content-form-modal"
            footer={footer}
        >
            <form id="zenith-content-form" className="zenith-form zenith-cform" onSubmit={(e) => void handleSubmit(e)}>
                {offered.length > 1 && (
                    <div className="zenith-form__types" role="tablist" aria-label={t('content.form.type')}>
                        {offered.map((type) => (
                            <button
                                type="button"
                                key={type.id}
                                role="tab"
                                aria-selected={type.id === typeId}
                                className={`zenith-type-pill ${type.id === typeId ? 'is-active' : ''}`}
                                style={
                                    type.id === typeId
                                        ? { borderColor: type.color, color: type.color, background: `${type.color}1f` }
                                        : undefined
                                }
                                onClick={() => setTypeId(type.id)}
                            >
                                <ObsidianIcon name={type.icon} size={14} />
                                {type.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="zenith-field">
                    <label className="zenith-field__label" htmlFor="content-title">
                        {t('content.form.titleLabel')}
                    </label>
                    <div className="zenith-cform__title-row">
                        <input
                            id="content-title"
                            type="text"
                            className="zenith-input zenith-field__input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            autoFocus
                        />
                        <FavoriteHeart on={favorite} onToggle={() => setFavorite((f) => !f)} size={16} />
                    </div>
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
                                const cfg = types.typeOf(item.type);
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
                    <label className="zenith-field__label" htmlFor="content-status">
                        {t('content.form.status')}
                    </label>
                    <Dropdown
                        id="content-status"
                        className="zenith-input zenith-field__input"
                        value={status}
                        options={STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(t, s, typeId) }))}
                        onChange={(v) => setStatus(v as ContentStatus)}
                    />
                </div>

                {asksProgress && (
                    <div className="zenith-field">
                        <span className="zenith-field__label">{t('content.form.progress')}</span>
                        <ProgressControl value={progress} onChange={setProgress} unit={unit} compact />
                    </div>
                )}

                {asksRating && (
                    <div className="zenith-field">
                        <span className="zenith-field__label">{t('content.form.rating')}</span>
                        <div className="zenith-form__rating">
                            <StarRating
                                value={rating}
                                onChange={setRating}
                                showValue
                                ariaLabel={t('content.form.rating')}
                            />
                        </div>
                    </div>
                )}

                <details className="zenith-cform__more" open={!!initialSeries}>
                    <summary>
                        <ChevronRight size={14} />
                        {t('content.form.more')}
                    </summary>

                    <div className="zenith-cform__more-body">
                        {seriesOn && (
                            <div className="zenith-field">
                                <label className="zenith-field__label" htmlFor="content-series">
                                    {t('content.series.label')}
                                </label>
                                <input
                                    id="content-series"
                                    type="text"
                                    className="zenith-input zenith-field__input"
                                    list="zenith-content-series-names"
                                    placeholder={t('content.series.promptPlaceholder')}
                                    value={series}
                                    onChange={(e) => setSeries(e.target.value)}
                                />
                                <datalist id="zenith-content-series-names">
                                    {knownSeries.map((name) => (
                                        <option key={name} value={name} />
                                    ))}
                                </datalist>
                            </div>
                        )}

                        <div className="zenith-field">
                            <label className="zenith-field__label" htmlFor="content-cover">
                                {t('content.form.cover')}
                            </label>
                            <div className="zenith-cform__cover">
                                <span
                                    className="zenith-cform__cover-art"
                                    style={
                                        coverPreview
                                            ? { backgroundImage: cssUrl(coverPreview) }
                                            : { background: `${typeCfg.color}24`, color: typeCfg.color }
                                    }
                                >
                                    {!coverPreview && <ObsidianIcon name={typeCfg.icon} size={16} />}
                                </span>
                                <input
                                    id="content-cover"
                                    type="text"
                                    className="zenith-input zenith-field__input"
                                    placeholder={t('content.form.coverPlaceholder')}
                                    value={coverImage}
                                    onChange={(e) => {
                                        setCoverImage(e.target.value);
                                        setCoverBroken(false);
                                    }}
                                />
                                {/* The list rather than a typed path: a wrong
                                    path shows nothing and says nothing. */}
                                <button
                                    type="button"
                                    className="zenith-btn zenith-btn--ghost"
                                    aria-label={t('content.form.coverPick')}
                                    title={t('content.form.coverPick')}
                                    onClick={() =>
                                        pickVaultImage(app, t('settings.vaultImage.search'), (path) => {
                                            setCoverImage(path);
                                            setCoverBroken(false);
                                        })
                                    }
                                >
                                    <Image size={14} />
                                </button>
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

                        {hasDetails && (
                            <div className="zenith-form__grid">
                                {shows('year') && (
                                    <div className="zenith-field">
                                        <label className="zenith-field__label" htmlFor="content-year">
                                            {t('content.form.year')}
                                        </label>
                                        <input
                                            id="content-year"
                                            type="number"
                                            inputMode="numeric"
                                            className="zenith-input zenith-field__input"
                                            placeholder={String(new Date().getFullYear())}
                                            value={year}
                                            onChange={(e) => setYear(e.target.value)}
                                        />
                                    </div>
                                )}
                                {shows('creator') && (
                                    <div className="zenith-field">
                                        <label className="zenith-field__label" htmlFor="content-creator">
                                            {typeCfg.creatorLabel || t('content.field.creator')}
                                        </label>
                                        <input
                                            id="content-creator"
                                            type="text"
                                            className="zenith-input zenith-field__input"
                                            value={creator}
                                            onChange={(e) => setCreator(e.target.value)}
                                        />
                                    </div>
                                )}
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
                                    className="zenith-input zenith-field__input"
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
                                    className="zenith-input zenith-field__input"
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
                                    className="zenith-input zenith-field__input zenith-field__textarea"
                                    rows={3}
                                    placeholder={t('content.form.descriptionPlaceholder')}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                </details>
            </form>
        </Modal>
    );
};
