import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useZenithStore } from '../../store';
import {
    effectiveContentTypes,
    normalizeProviderId,
    CONTENT_FIELDS,
    METADATA_PROVIDER_IDS,
    type ContentTypeConfig,
    type ContentFieldId,
    type MetadataProviderId,
} from '../../core/contentTypes';
import { providerLabel } from '../../modules/content/services/metadata';
import { ObsidianIcon } from '../../components/shared/ObsidianIcon';
import { IconPickerModal } from '../../core/IconPickerModal';
import { translateNow, useTranslation } from '../../core/i18n';

/**
 * ContentTypesSettings — manage the content type catalogue: label, icon, colour,
 * metadata provider, the "creator" field's label, and which curated fields each
 * type shows. Editing materializes the full list into `settings.contentTypes`
 * (until then the built-in defaults apply).
 */
export const ContentTypesSettings: React.FC = () => {
    const { app } = useApp();
    const t = useTranslation();
    const saved = useZenithStore((s) => s.settings.contentTypes);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const types = useMemo(() => effectiveContentTypes(saved), [saved]);

    const commit = (next: ContentTypeConfig[]) => updateSettings({ contentTypes: next });
    const patch = (id: string, partial: Partial<ContentTypeConfig>) =>
        commit(types.map((type) => (type.id === id ? { ...type, ...partial } : type)));
    const remove = (id: string) => commit(types.filter((type) => type.id !== id));
    const toggleField = (id: string, field: ContentFieldId) =>
        commit(
            types.map((type) => {
                if (type.id !== id) return type;
                const has = type.fields.includes(field);
                return {
                    ...type,
                    fields: has ? type.fields.filter((f) => f !== field) : [...type.fields, field],
                };
            })
        );
    const addType = () => {
        const ids = new Set(types.map((type) => type.id));
        let id = 'custom';
        let n = 1;
        while (ids.has(id)) id = `custom-${n++}`;
        commit([
            ...types,
            {
                id,
                // Stored, so it is written in the language it was created
                // in — renaming it later is a text field away.
                label: translateNow('ctypes.newType'),
                icon: 'package',
                color: '#8b5cf6',
                provider: 'wikipedia',
                creatorLabel: translateNow('ctypes.defaultCreator'),
                progressUnit: translateNow('ctypes.defaultUnit'),
                fields: CONTENT_FIELDS.map((f) => f.id),
            },
        ]);
    };

    return (
        <div className="zenith-ctypes">
            <div className="zenith-settings__hint zenith-settings__hint--info">
                {t('ctypes.hint')}
            </div>

            {types.map((type) => (
                <div key={type.id} className="zenith-ctype">
                    <div className="zenith-ctype__head">
                        <button
                            type="button"
                            className="zenith-ctype__icon"
                            style={{ color: type.color }}
                            aria-label={t('a11y.changeIcon')}
                            onClick={() =>
                                new IconPickerModal(app, type.icon, (icon) => patch(type.id, { icon })).open()
                            }
                        >
                            <ObsidianIcon name={type.icon} size={18} />
                        </button>
                        <input
                            className="zenith-ctype__label"
                            value={type.label}
                            aria-label={t('ctypes.typeName')}
                            onChange={(e) => patch(type.id, { label: e.target.value })}
                        />
                        <input
                            type="color"
                            className="zenith-ctype__color"
                            value={type.color}
                            aria-label={t('ctypes.colour')}
                            onChange={(e) => patch(type.id, { color: e.target.value })}
                        />
                        <button
                            type="button"
                            className="zenith-ctype__remove"
                            aria-label={t('ctypes.removeType')}
                            onClick={() => remove(type.id)}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>

                    <div className="zenith-ctype__row">
                        <label className="zenith-ctype__field">
                            <span>{t('ctypes.metadataSource')}</span>
                            <select
                                value={normalizeProviderId(type.provider)}
                                onChange={(e) => patch(type.id, { provider: e.target.value as MetadataProviderId })}
                            >
                                {METADATA_PROVIDER_IDS.map((p) => (
                                    <option key={p} value={p}>
                                        {providerLabel(p)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="zenith-ctype__field">
                            <span>{t('ctypes.creatorLabel')}</span>
                            <input
                                value={type.creatorLabel ?? ''}
                                placeholder={t('ctypes.defaultCreator')}
                                onChange={(e) => patch(type.id, { creatorLabel: e.target.value })}
                            />
                        </label>
                        {type.fields.includes('progress') && (
                            <label className="zenith-ctype__field">
                                <span>{t('ctypes.progressUnit')}</span>
                                <input
                                    value={type.progressUnit ?? ''}
                                    placeholder={t('ctypes.unitExample')}
                                    onChange={(e) => patch(type.id, { progressUnit: e.target.value })}
                                />
                            </label>
                        )}
                    </div>

                    <div className="zenith-ctype__fields">
                        <span className="zenith-ctype__fields-label">{t('ctypes.shownFields')}</span>
                        <div className="zenith-ctype__chips">
                            {CONTENT_FIELDS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={`zenith-ctype__chip ${type.fields.includes(f.id) ? 'is-on' : ''}`}
                                    onClick={() => toggleField(type.id, f.id)}
                                >
                                    {t(f.labelKey)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}

            <button type="button" className="zenith-ctype__add" onClick={addType}>
                <Plus size={15} /> {t('ctypes.addType')}
            </button>
        </div>
    );
};
