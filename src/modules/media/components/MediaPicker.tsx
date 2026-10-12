import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Bookmark, Check, ImageOff } from 'lucide-react';
import { Modal } from '../../../components/shared';
import { SearchField } from '../../../components/ui/fields';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import {
    getVaultImages,
    mediaSource,
    mediaTitle,
    pickerView,
    resolveMediaSrc,
} from '../mediaService';

/**
 * A picture, shown small. One that cannot be shown — a file since deleted, a
 * link that answers with something else — says so with a glyph, and tells
 * whoever asked, which is how a pasted link is known to be no picture.
 */
const Thumb: FC<{ src: string | null; onState?: (ok: boolean) => void }> = ({ src, onState }) => {
    const [broken, setBroken] = useState(false);
    if (!src || broken) {
        return (
            <span className="zenith-media-thumb is-broken">
                <ImageOff size={18} aria-hidden="true" />
            </span>
        );
    }
    return (
        <span className="zenith-media-thumb">
            <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                onLoad={() => onState?.(true)}
                onError={() => {
                    setBroken(true);
                    onState?.(false);
                }}
            />
        </span>
    );
};

/**
 * One picture to choose from. The picture is the button: pressing it puts it
 * on the banner. The bookmark in its corner is the only other thing it can do,
 * and says by being filled whether the picture is among the saved ones.
 */
const Tile: FC<{
    src: string | null;
    name: string;
    hint: string;
    selected: boolean;
    saved: boolean;
    onChoose: () => void;
    onToggleSaved: () => void;
}> = ({ src, name, hint, selected, saved, onChoose, onToggleSaved }) => {
    const t = useTranslation();
    const keep = saved ? t('media.picker.unsave') : t('media.picker.save');
    return (
        <div className={`zenith-media-tile${selected ? ' is-selected' : ''}${saved ? ' is-saved' : ''}`}>
            <button
                type="button"
                className="zenith-media-tile__pick"
                onClick={onChoose}
                title={hint}
                aria-pressed={selected}
            >
                <Thumb src={src} />
                {selected && (
                    <span className="zenith-media-tile__check" aria-hidden="true">
                        <Check size={12} strokeWidth={3} />
                    </span>
                )}
                <span className="zenith-media-tile__name">{name}</span>
            </button>
            <button
                type="button"
                className="zenith-media-tile__keep"
                onClick={onToggleSaved}
                title={keep}
                aria-label={`${keep}: ${name}`}
                aria-pressed={saved}
            >
                <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
        </div>
    );
};

/** A heading over a group of tiles, the way the library heads its shelves. */
const Heading: FC<{ count?: number; children: React.ReactNode }> = ({ count, children }) => (
    <h3 className="zenith-media__heading">
        {children}
        {count !== undefined && <span>{count}</span>}
    </h3>
);

/**
 * Choosing the picture over the file explorer.
 *
 * One line at the top does both things there used to be a field each for:
 * typed in, it finds a picture; given a link, it shows what is at the link.
 * Under it are the pictures themselves, the saved ones first.
 */
export const MediaPicker: FC<{ onClose: () => void }> = ({ onClose }) => {
    const t = useTranslation();
    const { app } = useApp();
    const selected = useZenithStore((s) => s.settings.mediaSelected);
    const saved = useZenithStore((s) => s.settings.mediaSaved);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [query, setQuery] = useState('');
    // Whether the link in the line turned out to be a picture: null while it loads.
    const [linkOk, setLinkOk] = useState<{ link: string; ok: boolean } | null>(null);

    const images = useMemo(() => getVaultImages(app), [app]);
    const view = useMemo(() => pickerView(query, saved, images), [query, saved, images]);
    const linkKnown = !!view.link && linkOk?.link === view.link;
    const linkReady = linkKnown && !!linkOk?.ok;
    const linkBroken = linkKnown && !linkOk?.ok;

    /** Put a picture on the banner. A link is kept as well: there is nowhere else to find it again. */
    const choose = (ref: string, keep = false) => {
        updateSettings({
            mediaSelected: ref,
            ...(keep && !saved.includes(ref) ? { mediaSaved: [...saved, ref] } : {}),
        });
        new Notice(t('notice.bannerUpdated'));
        onClose();
    };

    const toggleSaved = (ref: string) =>
        updateSettings({
            mediaSaved: saved.includes(ref) ? saved.filter((r) => r !== ref) : [...saved, ref],
        });

    /** Enter takes the link, or the one picture a search has come down to. */
    const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (view.link) {
            // Only once it has shown itself to be a picture.
            if (linkReady) choose(view.link, true);
            return;
        }
        const found = [...view.saved, ...view.vault.map((img) => img.path)];
        if (query.trim() && found.length === 1) choose(found[0]);
    };

    const nothing = !view.link && view.saved.length === 0 && view.vault.length === 0;

    return (
        <Modal
            title={t('media.picker.title')}
            onClose={onClose}
            size="lg"
            className="zenith-media-dialog"
        >
            <div className="zenith-media">
                <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder={t('media.picker.search')}
                    onKeyDown={onEnter}
                />

                {selected && !query.trim() && (
                    <div className="zenith-media__current">
                        <Thumb src={resolveMediaSrc(app, selected)} />
                        <span className="zenith-media__current-text">
                            <span>{t('media.picker.current')}</span>
                            <b title={selected}>
                                {mediaTitle(selected) || mediaSource(selected) || selected}
                            </b>
                        </span>
                        <button
                            type="button"
                            className="zenith-media__clear"
                            onClick={() => updateSettings({ mediaSelected: '' })}
                        >
                            {t('media.picker.clear')}
                        </button>
                    </div>
                )}

                {view.link && (
                    <section>
                        <Heading>{t('media.picker.link')}</Heading>
                        {/* Not a tile among tiles: a link is brought here on purpose, so what is
                            at it is shown larger, with the one thing to do about it beside it. */}
                        <div className="zenith-media__found">
                            <Thumb
                                // A new link is a new picture: start from "not known yet".
                                key={view.link}
                                src={view.link}
                                onState={(ok) => setLinkOk({ link: view.link ?? '', ok })}
                            />
                            <div className="zenith-media__found-text">
                                {linkBroken ? (
                                    <span>{t('media.picker.broken')}</span>
                                ) : (
                                    <>
                                        {mediaTitle(view.link) && <b>{mediaTitle(view.link)}</b>}
                                        {mediaSource(view.link) && (
                                            <span>{mediaSource(view.link)}</span>
                                        )}
                                        <button
                                            type="button"
                                            className="zenith-btn zenith-btn--primary"
                                            disabled={!linkReady}
                                            onClick={() => view.link && choose(view.link, true)}
                                        >
                                            {t('media.picker.use')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {view.saved.length > 0 && (
                    <section>
                        <Heading count={view.saved.length}>{t('media.picker.saved')}</Heading>
                        <div className="zenith-media__grid">
                            {view.saved.map((ref) => (
                                <Tile
                                    key={ref}
                                    src={resolveMediaSrc(app, ref)}
                                    name={mediaTitle(ref) || mediaSource(ref)}
                                    hint={ref}
                                    selected={ref === selected}
                                    saved
                                    onChoose={() => choose(ref)}
                                    onToggleSaved={() => toggleSaved(ref)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {view.vault.length > 0 && (
                    <section>
                        <Heading count={view.vault.length + view.more}>
                            {t('media.picker.vault')}
                        </Heading>
                        <div className="zenith-media__grid">
                            {view.vault.map((img) => (
                                <Tile
                                    key={img.path}
                                    src={resolveMediaSrc(app, img.path)}
                                    name={img.name}
                                    hint={img.path}
                                    selected={img.path === selected}
                                    saved={false}
                                    onChoose={() => choose(img.path)}
                                    onToggleSaved={() => toggleSaved(img.path)}
                                />
                            ))}
                        </div>
                        {view.more > 0 && (
                            <p className="zenith-media__note">
                                {t('media.picker.more', { count: view.more })}
                            </p>
                        )}
                    </section>
                )}

                {nothing && (
                    <p className="zenith-media__note">
                        {query.trim()
                            ? t('media.picker.noMatch', { query: query.trim() })
                            : t('media.picker.empty')}
                    </p>
                )}
            </div>
        </Modal>
    );
};
