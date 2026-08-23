import React, { type FC } from 'react';
import { Check, LayoutTemplate, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { PromptModal } from '../../../core/PromptModal';
import {
    MAX_PRESETS,
    MAX_PRESET_NAME,
    addPreset,
    applyPreset,
    matchesLayout,
    removePreset,
    renamePreset,
    updatePreset,
    type LayoutSnapshot,
} from '../dashboardPresets';

/**
 * Saved arrangements, while arranging.
 *
 * One dashboard is rarely one thing — the desk you plan a week at is not the
 * one you read on — so this keeps several and swaps between them. It sits in
 * edit mode beside the grid controls because that is where rearranging already
 * happens; the header menu offers the same list for switching without opening
 * edit mode at all.
 *
 * A preset stores the whole desk, grid geometry included, so applying one is a
 * single settings write and needs no re-flow.
 */
export const LayoutPresetsBar: FC = () => {
    const t = useTranslation();
    const { app } = useApp();

    const presets = useZenithStore((s) => s.settings.dashboardPresets);
    const activeId = useZenithStore((s) => s.settings.dashboardPresetId);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    // Subscribed field by field: a snapshot built from the whole settings
    // object would be a new value on every unrelated setting change.
    const dashboardLayout = useZenithStore((s) => s.settings.dashboardLayout);
    const dashboardBundles = useZenithStore((s) => s.settings.dashboardBundles);
    const dashboardStackOrder = useZenithStore((s) => s.settings.dashboardStackOrder);
    const hiddenWidgetIds = useZenithStore((s) => s.settings.hiddenWidgetIds);
    const dashboardGrid = useZenithStore((s) => s.settings.dashboardGrid);

    const current: LayoutSnapshot = {
        dashboardLayout,
        dashboardBundles,
        dashboardStackOrder,
        hiddenWidgetIds,
        dashboardGrid,
    };

    const active = presets.find((p) => p.id === activeId);
    const dirty = active !== undefined && !matchesLayout(active, current);

    const ask = (title: string, initial: string): Promise<string | null> =>
        new PromptModal(app, {
            title,
            initial,
            placeholder: t('dashboard.presets.namePlaceholder'),
            confirmText: t('common.save'),
            cancelText: t('common.cancel'),
            maxLength: MAX_PRESET_NAME,
        }).ask();

    const saveAs = async () => {
        const name = await ask(t('dashboard.presets.saveAs'), t('dashboard.presets.defaultName'));
        if (name === null) return;
        const { presets: next, id } = addPreset(presets, name, current, new Date().toISOString());
        updateSettings({ dashboardPresets: next, dashboardPresetId: id });
    };

    const apply = (id: string) => {
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        updateSettings({ ...applyPreset(preset), dashboardPresetId: id });
    };

    const overwrite = () => {
        if (!active) return;
        updateSettings({
            dashboardPresets: updatePreset(presets, active.id, current, new Date().toISOString()),
        });
    };

    const rename = async (id: string, was: string) => {
        const name = await ask(t('dashboard.presets.rename'), was);
        if (name === null) return;
        updateSettings({ dashboardPresets: renamePreset(presets, id, name) });
    };

    const remove = (id: string) => {
        updateSettings({
            dashboardPresets: removePreset(presets, id),
            // Deleting the arrangement on screen doesn't change the screen —
            // it just stops being a saved thing.
            ...(id === activeId ? { dashboardPresetId: '' } : {}),
        });
    };

    return (
        <div className="zenith-presets">
            <div className="zenith-presets__title">
                <LayoutTemplate size={13} />
                {t('dashboard.presets')}
            </div>

            <div className="zenith-presets__list">
                {presets.length === 0 && (
                    <span className="zenith-presets__hint">{t('dashboard.presets.empty')}</span>
                )}

                {presets.map((preset) => {
                    const isActive = preset.id === activeId;
                    return (
                        <div
                            key={preset.id}
                            className={`zenith-presets__chip ${isActive ? 'is-active' : ''}`}
                        >
                            <button
                                type="button"
                                className="zenith-presets__apply"
                                onClick={() => apply(preset.id)}
                                title={t('dashboard.presets.applyHint', { name: preset.name })}
                            >
                                {isActive && <Check size={12} />}
                                <span className="zenith-presets__name">{preset.name}</span>
                                {/* Only the applied one can be out of date — the
                                    others describe a desk that isn't on screen. */}
                                {isActive && dirty && (
                                    <span
                                        className="zenith-presets__dot"
                                        title={t('dashboard.presets.modified')}
                                    />
                                )}
                            </button>

                            {isActive && dirty && (
                                <button
                                    type="button"
                                    className="zenith-presets__action"
                                    onClick={overwrite}
                                    aria-label={t('dashboard.presets.update')}
                                    title={t('dashboard.presets.update')}
                                >
                                    <Save size={12} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="zenith-presets__action"
                                onClick={() => void rename(preset.id, preset.name)}
                                aria-label={t('dashboard.presets.rename')}
                                title={t('dashboard.presets.rename')}
                            >
                                <Pencil size={12} />
                            </button>
                            <button
                                type="button"
                                className="zenith-presets__action zenith-presets__action--danger"
                                onClick={() => remove(preset.id)}
                                aria-label={t('dashboard.presets.delete')}
                                title={t('dashboard.presets.delete')}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                className="zenith-presets__save"
                onClick={() => void saveAs()}
                disabled={presets.length >= MAX_PRESETS}
                title={
                    presets.length >= MAX_PRESETS
                        ? t('dashboard.presets.full', { count: MAX_PRESETS })
                        : t('dashboard.presets.saveHint')
                }
            >
                <Plus size={13} /> {t('dashboard.presets.save')}
            </button>
        </div>
    );
};
