import React, { useState } from 'react';
import { Notice, TFolder } from 'obsidian';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';

/**
 * A vault folder path, with the one affordance that makes it usable: telling
 * the user the folder does not exist, and offering to create it.
 *
 * Without that, a typo in a folder setting fails silently and the module it
 * belongs to just appears empty forever.
 */
export const FolderInput: React.FC<{
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, placeholder, disabled, onChange }) => {
    const { app } = useApp();
    const t = useTranslation();
    // Vault lookups aren't reactive, so creating a folder has to force a repaint
    // for the warning to clear.
    const [, forceRepaint] = useState(0);

    const path = value.trim();
    const missing = path.length > 0 && !(app.vault.getAbstractFileByPath(path) instanceof TFolder);

    const create = async () => {
        try {
            await app.vault.createFolder(path);
            new Notice(`Zenith: created folder "${path}".`);
            forceRepaint((n) => n + 1);
        } catch (err) {
            console.error('Zenith: Failed to create folder:', err);
            new Notice('Zenith: could not create folder.');
        }
    };

    return (
        <>
            <input
                type="text"
                className="zenith-settings__input"
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
            {missing && (
                <div className="zenith-settings__hint zenith-settings__hint--warn">
                    <span>{t('settings.folderMissing')}</span>
                    <button
                        type="button"
                        className="zenith-settings__inline-btn"
                        onClick={() => void create()}
                    >
                        {t('settings.createFolder')}
                    </button>
                </div>
            )}
        </>
    );
};
