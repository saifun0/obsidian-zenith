import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from 'obsidian';
import { RotateCw, LayoutGrid, Check, LayoutTemplate } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
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
import { backgroundClasses, backgroundStyle } from '../dashboardBackground';

// ── Helpers ──────────────────────────────────────────

/** Translation key for the time-of-day greeting. */
function greetingKey(hour: number): string {
    if (hour < 5) return 'dashboard.goodNight';
    if (hour < 12) return 'dashboard.goodMorning';
    if (hour < 18) return 'dashboard.goodAfternoon';
    return 'dashboard.goodEvening';
}

/**
 * Weekday apart from the rest, and no year suffix.
 *
 * Asking the locale for the whole date at once gets "пятница, 28 августа
 * 2026 г." in Russian — right for prose, and three characters of boilerplate
 * at the top of a dashboard. The two halves are also weighted differently, the
 * same way the clock card weights them, so the two agree on what a date is.
 */
function formatDateParts(date: Date, locale: string): { weekday: string; dayMonth: string } {
    return {
        weekday: date.toLocaleDateString(locale, { weekday: 'long' }),
        dayMonth: date.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
    };
}

// ── Component ────────────────────────────────────────

export const DashboardApp: React.FC = () => {
    const { app, plugin } = useApp();
    const savedGrid = useZenithStore((s) => s.settings.dashboardGrid);
    const grid = useMemo(() => normalizeGridConfig(savedGrid), [savedGrid]);
    const heading = useZenithStore((s) => s.settings.dashboardHeading);
    const headingText = useZenithStore((s) => s.settings.dashboardHeadingText);
    const showDate = useFeature('dashboard.date');
    const presetsOn = useFeature('dashboard.presets');

    const presets = useZenithStore((s) => s.settings.dashboardPresets);
    const activePresetId = useZenithStore((s) => s.settings.dashboardPresetId);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const dashboardLayout = useZenithStore((s) => s.settings.dashboardLayout);
    const dashboardBundles = useZenithStore((s) => s.settings.dashboardBundles);
    const dashboardStackOrder = useZenithStore((s) => s.settings.dashboardStackOrder);
    const hiddenWidgetIds = useZenithStore((s) => s.settings.hiddenWidgetIds);

    const t = useTranslation();
    const { weekday, dayMonth } = useMemo(() => formatDateParts(new Date(), t.locale), [t.locale]);

    /* An empty custom line is the same as no line — rendering the element
       anyway would leave the header carrying the height of a heading nobody
       wrote. */
    const title = useMemo(() => {
        if (heading === 'greeting') return t(greetingKey(new Date().getHours()));
        if (heading === 'custom') return headingText.trim();
        return '';
    }, [heading, headingText, t]);
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

    /**
     * The wallpaper.
     *
     * Selected field by field rather than as one object: this sits in a
     * component that re-renders on every drag frame while arranging, and
     * subscribing to `settings` whole would rebuild the layer's style for each
     * of them.
     */
    // Switched off, the wallpaper is the same as none at all: no layer, no
    // request for the picture, cards at full strength.
    const bgOn = useFeature('dashboard.background');
    const savedBgSource = useZenithStore((s) => s.settings.dashboardBgSource);
    const bg = {
        dashboardBgSource: bgOn ? savedBgSource : ('none' as const),
        dashboardBgUrl: useZenithStore((s) => s.settings.dashboardBgUrl),
        dashboardBgPath: useZenithStore((s) => s.settings.dashboardBgPath),
        dashboardBgFit: useZenithStore((s) => s.settings.dashboardBgFit),
        dashboardBgDim: useZenithStore((s) => s.settings.dashboardBgDim),
        dashboardBgBlur: useZenithStore((s) => s.settings.dashboardBgBlur),
        dashboardCardOpacity: useZenithStore((s) => s.settings.dashboardCardOpacity),
        dashboardBgMobile: useZenithStore((s) => s.settings.dashboardBgMobile),
    };
    const bgStyle = useMemo(
        () => backgroundStyle(bg, (path) => app.vault.adapter.getResourcePath(path)),
        // Every field of `bg` is read; the object itself is new each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Listing `bg` itself would defeat this: the object is rebuilt every render, so the fields are named one by one on purpose.
        [
            app,
            bg.dashboardBgSource,
            bg.dashboardBgUrl,
            bg.dashboardBgPath,
            bg.dashboardBgFit,
            bg.dashboardBgDim,
            bg.dashboardBgBlur,
            bg.dashboardCardOpacity,
        ]
    );
    const bgClasses = backgroundClasses(bg, bgStyle !== null);

    return (
        <div className={`zenith-dashboard ${bgClasses}`}>
            {/* The wallpaper, as a layer of its own rather than a background on
                the board: it has to sit under the cards and over nothing, and
                it carries a scrim the board is read through. `aria-hidden`
                because it is decoration — a screen reader announcing a
                photograph would be announcing furniture. */}
            {bgStyle && (
                <div className="zenith-dashboard__bg" style={bgStyle} aria-hidden="true" />
            )}

            {/* Before the board in the DOM, because on a narrow pane it goes
                back into the flow and belongs above it. On a wide one it is
                lifted out of the flow entirely — see the stylesheet. */}
            <div className="zenith-dashboard__railwrap">
                {/* A rail beside the board rather than a row above it. Above, the
                buttons owned a full line of the dashboard's width to hold three
                icons, and pushed the first row of cards down by it; beside it
                they cost nothing at all — they are out of the flow, so the
                canvas is centred as if they were not there. */}
                <div className="zenith-dashboard__rail">
                    {/* Layouts and arranging are the same errand, so they share one
                    control; refreshing is a different one and stands apart.
                    Three identical squares in a row said none of that. */}
                    <div className="zenith-dashboard__group">
                        {presetsOn && (
                            <button
                                className="zenith-dashboard__action"
                                onClick={openPresets}
                                aria-label={t('dashboard.presets')}
                                title={t('dashboard.presets')}
                            >
                                <LayoutTemplate size={16} />
                            </button>
                        )}
                        <button
                            className={`zenith-dashboard__action ${editing ? 'is-active' : ''}`}
                            onClick={() => setEditing((v) => !v)}
                            aria-pressed={editing}
                            aria-label={
                                editing ? t('dashboard.doneEditing') : t('dashboard.editLayout')
                            }
                            title={editing ? t('dashboard.doneEditing') : t('dashboard.editLayout')}
                        >
                            {editing ? <Check size={16} /> : <LayoutGrid size={16} />}
                        </button>
                    </div>
                    <button
                        className="zenith-dashboard__action zenith-dashboard__action--lone"
                        onClick={loadData}
                        disabled={refreshing}
                        aria-label={t('common.refresh')}
                        title={t('common.refresh')}
                    >
                        <RotateCw size={16} className={refreshing ? 'zenith-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* The canvas width lives here rather than in CSS so the setting
                can reach it; `none` is how "run to the edges of the pane" is
                expressed. */}
            <div
                className="zenith-dashboard__main"
                style={{ maxWidth: grid.maxWidth > 0 ? grid.maxWidth : 'none' }}
            >
                {/* Both halves are optional and by default neither is there — a
                wall of cards says what it is without a caption — so the header
                is not rendered at all rather than left holding its own
                margin. */}
                {(title || showDate) && (
                    <header className={`zenith-dashboard__header ${title ? 'has-title' : ''}`}>
                        {title && <h1 className="zenith-dashboard__title zenith-serif">{title}</h1>}
                        {showDate && (
                            <p className="zenith-dashboard__date">
                                <span className="zenith-dashboard__weekday">{weekday}</span>
                                <span className="zenith-dashboard__daymonth">{dayMonth}</span>
                            </p>
                        )}
                    </header>
                )}

                <DashboardGrid editing={editing} onEditingChange={setEditing} />
            </div>
        </div>
    );
};
