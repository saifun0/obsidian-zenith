import React, { useState } from 'react';
import { TFile } from 'obsidian';
import { Image, ImageOff } from 'lucide-react';
import { pickVaultImage } from '../../components/shared/ImagePickerModal';
import { isImagePath } from '../../core/imageSource';
import type { CustomFieldProps } from '../schema/types';

/**
 * A settings row that names a picture in the vault: a path, a button that opens
 * the list, and a thumbnail.
 *
 * A factory rather than a component because `custom` fields render with no
 * arguments of their own — the setting a row writes to has to be closed over.
 * Only the label and description differ between call sites; the rest of the
 * words belong to the control, not to whoever is using it, so they are fixed.
 *
 * The preview is the point of the whole row. A picture is the one kind of
 * setting whose result is invisible from the settings page — you change it, go
 * back, and find out — so the thumbnail answers "is this the right one" here.
 */
export function vaultImageField(
    key: string,
    labelKey: string,
    descKey: string
): React.FC<CustomFieldProps> {
    const VaultImageField: React.FC<CustomFieldProps> = ({ app, t, values, set }) => {
        const path = String(values[key] ?? '');
        // Vault lookups are not reactive, so a file appearing has to be repainted.
        const [, repaint] = useState(0);

        const trimmed = path.trim();
        const file = trimmed ? app.vault.getAbstractFileByPath(trimmed) : null;
        const missing = trimmed.length > 0 && !(file instanceof TFile);
        const wrongKind = file instanceof TFile && !isImagePath(trimmed);
        const src = file instanceof TFile && !wrongKind ? app.vault.getResourcePath(file) : '';

        const pick = () =>
            pickVaultImage(app, t('settings.vaultImage.search'), (next) => {
                set({ [key]: next });
                repaint((n) => n + 1);
            });

        return (
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t(labelKey)}</span>
                    <span className="zenith-settings__item-desc">{t(descKey)}</span>
                </div>

                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={path}
                        placeholder={t('settings.vaultImage.placeholder')}
                        onChange={(e) => set({ [key]: e.target.value })}
                    />
                    <button className="zenith-settings__inline-btn" onClick={pick}>
                        <Image size={13} />
                        {t('settings.vaultImage.pick')}
                    </button>
                </div>

                {src && (
                    <div className="zenith-imgpreview">
                        <img src={src} alt="" />
                    </div>
                )}

                {(missing || wrongKind) && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        <ImageOff size={13} />
                        {t(
                            missing
                                ? 'settings.vaultImage.missing'
                                : 'settings.vaultImage.notImage'
                        )}
                    </div>
                )}
            </div>
        );
    };

    return VaultImageField;
}
