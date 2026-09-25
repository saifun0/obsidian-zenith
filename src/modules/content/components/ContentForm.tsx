import React, { useState, useMemo, type FC } from 'react';
import { Notice } from 'obsidian';
import { Plus, Loader2, Image, ImageOff, AlertTriangle } from 'lucide-react';
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
 * ContentForm — the "add item" dialog: pick a type, then fill in what you know.
 *
 * Nothing is looked up. Auto-fill from online catalogues was tried and removed:
 * it guessed wrong often enough that every item needed checking anyway, and a
 * library is the user's own record rather than a mirror of someone's database.
 * The cover is a picture from the vault or a link pasted by hand, shown from
 * where it is and never downloaded.
 *
 * It lives in a real {@link Modal} rather than inline above the gallery: the
 * form is long, and inline it pushed the whole library down the page.
 */
export const ContentForm: FC<ContentFormProps> = ({ onCancel, onCreated }) => {
    const { app } = useApp();
    const t = useTranslation();
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
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
    const [coverImage, setCoverImage] = useState('');
    const [year, setYear] = useState('');
    const [creator, setCreator] = useState('');
    const [genresInput, setGenresInput] = useState('');
    const [progress, setProgress] = useState<ProgressValue>({ current: 0 });
    const [tagsInput, setTagsInput] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [coverBroken, setCoverBroken] = useState(false);

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

            const cover = coverImage.trim();
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
            <form id="zenith-content-form" className="zenith-form" onSubmit={(e) => void handleSubmit(e)}>
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
                            onClick={() => setTypeId(t.id)}
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
                            <input
                                id="content-title"
                                type="text"
                                className="zenith-input zenith-field__input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                autoFocus
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
                            <div className="zenith-form__cover-row">
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
                                    onClick={() =>
                                        pickVaultImage(app, t('settings.vaultImage.search'), (path) => {
                                            setCoverImage(path);
                                            setCoverBroken(false);
                                        })
                                    }
                                >
                                    <Image size={14} />
                                    {t('content.form.coverPick')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="zenith-form__grid">
                    <div className="zenith-field">
                        <label className="zenith-field__label" htmlFor="content-status">
                            {t('content.form.status')}
                        </label>
                        <Dropdown
                            id="content-status"
                            className="zenith-input zenith-field__input"
                            value={status}
                            options={CONTENT_STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) }))}
                            onChange={(v) => setStatus(v as ContentStatus)}
                        />
                    </div>

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
                                className="zenith-input zenith-field__input"
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
