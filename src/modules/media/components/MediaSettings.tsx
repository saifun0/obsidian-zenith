import React from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { MediaPickerModal } from '../MediaPickerModal';
import { resolveMediaSrc } from '../mediaService';

/**
 * Picking the file-explorer banner.
 *
 * A `custom` field rather than a generic control: it previews the current
 * image and opens a picker modal, neither of which a declarative field type
 * can express — and inventing an "image" field type for one setting would be
 * worse than the escape hatch existing for exactly this.
 */
export const MediaSettings: React.FC = () => {
    const t = useTranslation();
    const { app } = useApp();
    const selected = useZenithStore((s) => s.settings.mediaSelected);
    const saved = useZenithStore((s) => s.settings.mediaSaved);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const src = selected ? resolveMediaSrc(app, selected) : null;

    return (
        <div className="zenith-settings__item zenith-settings__item--stack">
            <div className="zenith-settings__item-info">
                <span className="zenith-settings__item-name">{t('settings.mediaBanner')}</span>
                <span className="zenith-settings__item-desc">
                    {t('settings.mediaBanner.desc', { count: saved.length })}
                </span>
            </div>

            {src && (
                <img
                    src={src}
                    alt=""
                    className="zenith-settings__media-preview"
                />
            )}

            <div className="zenith-settings__color-control">
                <button
                    className="zenith-settings__inline-btn"
                    onClick={() => new MediaPickerModal(app).open()}
                >
                    {selected ? t('settings.mediaChange') : t('settings.mediaChoose')}
                </button>
                {selected && (
                    <button
                        className="zenith-settings__inline-btn"
                        onClick={() => updateSettings({ mediaSelected: '' })}
                    >
                        {t('settings.reset')}
                    </button>
                )}
            </div>
        </div>
    );
};
