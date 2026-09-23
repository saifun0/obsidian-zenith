import React from 'react';
import { TFile } from 'obsidian';
import { FolderOpen } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { pickVaultImage } from '../../../components/shared/ImagePickerModal';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { WidgetSettingsProps } from '../../dashboard/widgets';
import {
    PICTURE_FITS,
    PICTURE_SOURCES,
    normalizePictureSettings,
    type PictureFit,
    type PictureSource,
} from '../pictureSource';

/**
 * Which picture this card shows, chosen on the card itself.
 *
 * Not on the module's settings page, which is where it started: that page can
 * only describe *the* picture, and a board is allowed to hold three. The back
 * of the card is the only surface that knows which one is being talked about.
 *
 * It sits under the size controls every widget gets, in the same rows and the
 * same pill groups, so the panel reads as one panel rather than as a form
 * bolted onto a form.
 */
export const PictureSettings: React.FC<WidgetSettingsProps> = ({ instanceId }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizePictureSettings);

    const vault = config.pictureSource === 'vault';

    // The path is checked here rather than only in the widget because this is
    // where it can still be fixed. A card showing nothing tells you something
    // is wrong; this tells you which of the two things it is.
    const path = config.picturePath.trim();
    const file = path ? app.vault.getAbstractFileByPath(path) : null;
    const missing = path.length > 0 && !(file instanceof TFile);

    const pick = () =>
        pickVaultImage(app, t('settings.vaultImage.search'), (next) =>
            setConfig({ picturePath: next })
        );

    return (
        <>
            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('picture.source')}</span>
                <span className="zenith-widget-settings__presets">
                    {PICTURE_SOURCES.map((source: PictureSource) => (
                        <button
                            key={source}
                            className={source === config.pictureSource ? 'is-active' : ''}
                            aria-pressed={source === config.pictureSource}
                            onClick={() => setConfig({ pictureSource: source })}
                        >
                            {t(`picture.source.${source}`)}
                        </button>
                    ))}
                </span>
            </div>

            {/* The address and the path are one row, not two: only one of them
                is ever the answer, and a form that shows both asks the question
                twice. */}
            <div className="zenith-picture-settings__field">
                <input
                    type="text"
                    className={`zenith-input zenith-input--sm is-mono zenith-picture-settings__input${missing && vault ? ' is-invalid' : ''}`}
                    value={vault ? config.picturePath : config.pictureUrl}
                    placeholder={t(vault ? 'picture.path.placeholder' : 'picture.url.placeholder')}
                    spellCheck={false}
                    onChange={(e) =>
                        setConfig(
                            vault
                                ? { picturePath: e.target.value }
                                : { pictureUrl: e.target.value }
                        )
                    }
                    // The card underneath is draggable and turns over when
                    // tapped; neither should happen while a field is being used.
                    onPointerDown={(e) => e.stopPropagation()}
                />
                {vault && (
                    <button
                        className="zenith-picture-settings__browse"
                        onClick={pick}
                        aria-label={t('settings.vaultImage.pick')}
                        title={t('settings.vaultImage.pick')}
                    >
                        <FolderOpen size={13} />
                    </button>
                )}
            </div>

            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('picture.fit')}</span>
                <span className="zenith-widget-settings__presets">
                    {PICTURE_FITS.map((fit: PictureFit) => (
                        <button
                            key={fit}
                            className={fit === config.pictureFit ? 'is-active' : ''}
                            aria-pressed={fit === config.pictureFit}
                            onClick={() => setConfig({ pictureFit: fit })}
                        >
                            {t(`picture.fit.${fit}`)}
                        </button>
                    ))}
                </span>
            </div>
        </>
    );
};
