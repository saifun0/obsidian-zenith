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

/**
 * ContentTypesSettings — manage the content type catalogue: label, icon, colour,
 * metadata provider, the "creator" field's label, and which curated fields each
 * type shows. Editing materializes the full list into `settings.contentTypes`
 * (until then the built-in defaults apply).
 */
export const ContentTypesSettings: React.FC = () => {
    const { app } = useApp();
    const saved = useZenithStore((s) => s.settings.contentTypes);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const types = useMemo(() => effectiveContentTypes(saved), [saved]);

    const commit = (next: ContentTypeConfig[]) => updateSettings({ contentTypes: next });
    const patch = (id: string, partial: Partial<ContentTypeConfig>) =>
        commit(types.map((t) => (t.id === id ? { ...t, ...partial } : t)));
    const remove = (id: string) => commit(types.filter((t) => t.id !== id));
    const toggleField = (id: string, field: ContentFieldId) =>
        commit(
            types.map((t) => {
                if (t.id !== id) return t;
                const has = t.fields.includes(field);
                return {
                    ...t,
                    fields: has ? t.fields.filter((f) => f !== field) : [...t.fields, field],
                };
            })
        );
    const addType = () => {
        const ids = new Set(types.map((t) => t.id));
        let id = 'custom';
        let n = 1;
        while (ids.has(id)) id = `custom-${n++}`;
        commit([
            ...types,
            {
                id,
                label: 'New Type',
                icon: 'package',
                color: '#8b5cf6',
                provider: 'wikipedia',
                creatorLabel: 'Creator',
                progressUnit: 'units',
                fields: CONTENT_FIELDS.map((f) => f.id),
            },
        ]);
    };

    return (
        <div className="zenith-ctypes">
            <div className="zenith-settings__hint zenith-settings__hint--info">
                Types drive the library tabs, the add-form provider, and which fields each item shows.
            </div>

            {types.map((t) => (
                <div key={t.id} className="zenith-ctype">
                    <div className="zenith-ctype__head">
                        <button
                            type="button"
                            className="zenith-ctype__icon"
                            style={{ color: t.color }}
                            aria-label="Change icon"
                            onClick={() =>
                                new IconPickerModal(app, t.icon, (icon) => patch(t.id, { icon })).open()
                            }
                        >
                            <ObsidianIcon name={t.icon} size={18} />
                        </button>
                        <input
                            className="zenith-ctype__label"
                            value={t.label}
                            aria-label="Type name"
                            onChange={(e) => patch(t.id, { label: e.target.value })}
                        />
                        <input
                            type="color"
                            className="zenith-ctype__color"
                            value={t.color}
                            aria-label="Colour"
                            onChange={(e) => patch(t.id, { color: e.target.value })}
                        />
                        <button
                            type="button"
                            className="zenith-ctype__remove"
                            aria-label="Remove type"
                            onClick={() => remove(t.id)}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>

                    <div className="zenith-ctype__row">
                        <label className="zenith-ctype__field">
                            <span>Metadata source</span>
                            <select
                                value={normalizeProviderId(t.provider)}
                                onChange={(e) => patch(t.id, { provider: e.target.value as MetadataProviderId })}
                            >
                                {METADATA_PROVIDER_IDS.map((p) => (
                                    <option key={p} value={p}>
                                        {providerLabel(p)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="zenith-ctype__field">
                            <span>Creator label</span>
                            <input
                                value={t.creatorLabel ?? ''}
                                placeholder="Creator"
                                onChange={(e) => patch(t.id, { creatorLabel: e.target.value })}
                            />
                        </label>
                        {t.fields.includes('progress') && (
                            <label className="zenith-ctype__field">
                                <span>Progress unit</span>
                                <input
                                    value={t.progressUnit ?? ''}
                                    placeholder="episodes"
                                    onChange={(e) => patch(t.id, { progressUnit: e.target.value })}
                                />
                            </label>
                        )}
                    </div>

                    <div className="zenith-ctype__fields">
                        <span className="zenith-ctype__fields-label">Shown fields</span>
                        <div className="zenith-ctype__chips">
                            {CONTENT_FIELDS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={`zenith-ctype__chip ${t.fields.includes(f.id) ? 'is-on' : ''}`}
                                    onClick={() => toggleField(t.id, f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}

            <button type="button" className="zenith-ctype__add" onClick={addType}>
                <Plus size={15} /> Add type
            </button>
        </div>
    );
};
