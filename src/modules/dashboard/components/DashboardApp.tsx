import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from 'obsidian';
import { RotateCw, LayoutGrid, Check, LayoutTemplate } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { normalizeGridConfig } from '../grid/gridTypes';
import { PromptModal } from '../../../core/PromptModal';
import {
    MAX_PRESETS,
    MAX_PRESET_NAME,
    addPreset,
    applyPreset,
    matchesLayout,
    updatePreset,
    type LayoutSnapshot,
} from '../dashboardPresets';
import { DashboardGrid } from './DashboardGrid';

// ── Helpers ──────────────────────────────────────────

/** Translation key for the time-of-day greeting. */
function greetingKey(): string {
    const hour = new Date().getHours();
    if (hour < 5) return 'dashboard.goodNight';
    if (hour < 12) return 'dashboard.goodMorning';
    if (hour < 18) return 'dashboard.goodAfternoon';
    return 'dashboard.goodEvening';
}

function formatDate(date: Date, locale: string): string {
    return date.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

// ── Component ────────────────────────────────────────

export const DashboardApp: React.FC = () => {
    const { app, plugin } = useApp();
    const savedGrid = useZenithStore((s) => s.settings.dashboardGrid);
    const grid = useMemo(() => normalizeGridConfig(savedGrid), [savedGrid]);
    const showGreeting = useZenithStore((s) => s.settings.dashboardShowGreeting);
    const showDate = useZenithStore((s) => s.settings.dashboardShowDate);

    const presets = useZenithStore((s) => s.settings.dashboardPresets);
    const activePresetId = useZenithStore((s) => s.settings.dashboardPresetId);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const dashboardLayout = useZenithStore((s) => s.settings.dashboardLayout);
    const dashboardBundles = useZenithStore((s) => s.settings.dashboardBundles);
    const dashboardStackOrder = useZenithStore((s) => s.settings.dashboardStackOrder);
    const hiddenWidgetIds = useZenithStore((s) => s.settings.hiddenWidgetIds);

    const t = useTranslation();
    const greeting = useMemo(() => t(greetingKey()), [t]);
    const dateStr = useMemo(() => formatDate(new Date(), t.locale), [t.locale]);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState(false);

    // Esc is the quickest way out of edit mode.
    useEffect(() => {
        if (!editing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditing(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editing]);

    /**
     * The saved-desks menu.
     *
     * Switching arrangements is an everyday action, so it doesn't ask you to
     * enter edit mode first — the menu applies one in a click. Creating and
     * deleting them stays in edit mode, where the rest of the arranging lives.
     */
    const openPresets = useCallback(
        (e: React.MouseEvent) => {
            const current: LayoutSnapshot = {
                dashboardLayout,
                dashboardBundles,
                dashboardStackOrder,
                hiddenWidgetIds,
                dashboardGrid: savedGrid,
            };
            const active = presets.find((p) => p.id === activePresetId);
            const menu = new Menu();

            for (const preset of presets) {
                menu.addItem((item) =>
                    item
                        .setTitle(preset.name)
                        .setChecked(preset.id === activePresetId)
                        .onClick(() =>
                            updateSettings({ ...applyPreset(preset), dashboardPresetId: preset.id })
                        )
                );
            }
            if (presets.length > 0) menu.addSeparator();

            if (active && !matchesLayout(active, current)) {
                menu.addItem((item) =>
                    item
                        .setTitle(t('dashboard.presets.updateNamed', { name: active.name }))
                        .setIcon('save')
                        .onClick(() =>
                            updateSettings({
                                dashboardPresets: updatePreset(
                                    presets,
                                    active.id,
                                    current,
                                    new Date().toISOString()
                                ),
                            })
                        )
                );
            }

            menu.addItem((item) =>
                item
                    .setTitle(t('dashboard.presets.saveAs'))
                    .setIcon('plus')
                    .setDisabled(presets.length >= MAX_PRESETS)
                    .onClick(() => {
                        void new PromptModal(app, {
                            title: t('dashboard.presets.saveAs'),
                            initial: t('dashboard.presets.defaultName'),
                            placeholder: t('dashboard.presets.namePlaceholder'),
                            confirmText: t('common.save'),
                            cancelText: t('common.cancel'),
                            maxLength: MAX_PRESET_NAME,
                        })
                            .ask()
                            .then((name) => {
                                if (name === null) return;
                                const { presets: next, id } = addPreset(
                                    presets,
                                    name,
                                    current,
                                    new Date().toISOString()
                                );
                                updateSettings({ dashboardPresets: next, dashboardPresetId: id });
                            });
                    })
            );

            menu.showAtMouseEvent(e.nativeEvent);
        },
        [
            app,
            presets,
            activePresetId,
            updateSettings,
            dashboardLayout,
            dashboardBundles,
            dashboardStackOrder,
            hiddenWidgetIds,
            savedGrid,
            t,
        ]
    );

    // Data is kept live by the DataService; Refresh forces an immediate reload.
    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            await plugin.dataService.reloadAll();
        } finally {
            setRefreshing(false);
        }
    }, [plugin]);

    return (
        // The canvas width lives here rather than in CSS so the setting can
        // reach it; `none` is how "run to the edges of the pane" is expressed.
        <div
            className="zenith-dashboard"
            style={{ maxWidth: grid.maxWidth > 0 ? grid.maxWidth : 'none' }}
        >
            <header className="zenith-dashboard__header">
                <div className="zenith-dashboard__greeting">
                    {showGreeting && (
                        <h1 className="zenith-dashboard__title zenith-serif">{greeting}</h1>
                    )}
                    {showDate && <p className="zenith-dashboard__date">{dateStr}</p>}
                </div>
                <div className="zenith-dashboard__actions">
                    <button
                        className="zenith-dashboard__refresh"
                        onClick={openPresets}
                        aria-label={t('dashboard.presets')}
                        title={t('dashboard.presets')}
                    >
                        <LayoutTemplate size={16} />
                    </button>
                    <button
                        className={`zenith-dashboard__refresh ${editing ? 'is-active' : ''}`}
                        onClick={() => setEditing((v) => !v)}
                        aria-pressed={editing}
                        aria-label={editing ? t('dashboard.doneEditing') : t('dashboard.editLayout')}
                        title={editing ? t('dashboard.doneEditing') : t('dashboard.editLayout')}
                    >
                        {editing ? <Check size={16} /> : <LayoutGrid size={16} />}
                    </button>
                    <button
                        className="zenith-dashboard__refresh"
                        onClick={loadData}
                        disabled={refreshing}
                        aria-label={t('common.refresh')}
                        title={t('common.refresh')}
                    >
                        <RotateCw size={16} className={refreshing ? 'zenith-spin' : ''} />
                    </button>
                </div>
            </header>

            <DashboardGrid editing={editing} onEditingChange={setEditing} />
        </div>
    );
};
