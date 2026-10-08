import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Menu } from 'obsidian';
import { LayoutGrid, Check, LayoutTemplate, Bell, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { NotificationCenterModal } from '../../../core/notifications/NotificationCenterModal';
import { unreadCount } from '../../../core/notifications/notificationState';
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
import type { ArrangeTab } from './ArrangePanel';
import { panelFitsBeside } from '../grid/panelRoom';
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
 * Whether the arranging panel can stand beside the board here without lying
 * over any of it — read off the page, and summed by `panelFitsBeside`.
 */
function fitsBeside(
    root: HTMLElement,
    main: HTMLElement,
    rail: HTMLElement | null,
    host: HTMLElement | null
): boolean {
    // The rail back in the flow is a phone, and a panel in the flow is the
    // sheet a narrow pane gets: neither has a "beside".
    if (!rail || getComputedStyle(rail).position !== 'absolute') return false;
    if (!host || getComputedStyle(host).position !== 'absolute') return false;
    const gutter = parseFloat(getComputedStyle(root).paddingLeft) || 0;
    return panelFitsBeside(root.clientWidth, main.offsetWidth, gutter, rail.offsetWidth);
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
    const centerOn = useFeature('notify.center');
    const notifications = useZenithStore((s) => s.notifications);
    const bell = centerOn && notifications.records.length > 0;
    const unread = unreadCount(notifications, Date.now());

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
    const [editing, setEditingState] = useState(false);

    /* The arranging panel: the gallery, the grid and the saved arrangements.
       It is drawn by the grid, which holds everything it shows, into an
       element of this component's — it has to be placed against the pane, and
       the grid lives inside the canvas. */
    const rootRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelTab, setPanelTab] = useState<ArrangeTab>('widgets');

    /* Arranging opens the panel with it where there is room for both — the
       gallery used to be on screen for the whole of edit mode, and on a wide
       pane it still is. Where the panel would have to lie over part of the
       board it waits to be asked for. Leaving edit mode always closes it. */
    const setEditing = useCallback(
        (next: boolean | ((was: boolean) => boolean)) => {
            setEditingState((was) => {
                const on = typeof next === 'function' ? next(was) : next;
                if (on !== was) {
                    setPanelOpen(
                        on &&
                            !!rootRef.current &&
                            !!mainRef.current &&
                            fitsBeside(rootRef.current, mainRef.current, railRef.current, panelHost)
                    );
                }
                return on;
            });
        },
        [panelHost]
    );

    // Esc is the quickest way out of edit mode.
    useEffect(() => {
        if (!editing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditing(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editing, setEditing]);

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
        <div
            ref={rootRef}
            className={`zenith-dashboard ${bgClasses}${editing && panelOpen ? ' has-panel' : ''}`}
            // The stylesheet works out where the open panel stands, and needs
            // the canvas width for it; `none` has no arithmetic, so "to the
            // edges of the pane" is said as a width no pane has.
            style={
                {
                    '--zenith-dash-canvas': `${grid.maxWidth > 0 ? grid.maxWidth : 100000}px`,
                } as CSSProperties
            }
        >
            {/* The wallpaper, as a layer of its own rather than a background on
                the board: it has to sit under the cards and over nothing, and
                it carries a scrim the board is read through. `aria-hidden`
                because it is decoration — a screen reader announcing a
                photograph would be announcing furniture. */}
            {bgStyle && <div className="zenith-dashboard__bg" style={bgStyle} aria-hidden="true" />}

            {/* The canvas width lives here rather than in CSS so the setting
                can reach it; `none` is how "run to the edges of the pane" is
                expressed. */}
            <div
                ref={mainRef}
                className="zenith-dashboard__main"
                style={{ maxWidth: grid.maxWidth > 0 ? grid.maxWidth : 'none' }}
            >
                {/* First inside the canvas, because on a narrow pane it goes back
                    into the flow and belongs above the board. On a wide one it is
                    lifted out of the flow and stands at the board's own right
                    edge — see the stylesheet. */}
                <div className="zenith-dashboard__railwrap" ref={railRef}>
                    {/* A rail beside the board rather than a row above it. Above, the
                    buttons owned a full line of the dashboard's width to hold three
                    icons, and pushed the first row of cards down by it; beside it
                    they cost nothing at all — they are out of the flow, so the
                    canvas is centred as if they were not there. Beside the
                    *board*, not the pane: pinned to the pane's edge they stood
                    a hand's width away from the cards they arrange. */}
                    <div className="zenith-dashboard__rail">
                        {/* Layouts and arranging are the same errand, so they share one
                        control. Refreshing used to stand under them; the data keeps
                        itself current, so it is a command now (`refresh-data`)
                        rather than a quarter of the rail. */}
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
                                title={
                                    editing ? t('dashboard.doneEditing') : t('dashboard.editLayout')
                                }
                            >
                                {editing ? <Check size={16} /> : <LayoutGrid size={16} />}
                            </button>
                        </div>
                        {/* What arranging needs besides the board: the gallery, the grid,
                            the saved arrangements. */}
                        {editing && (
                            <button
                                className={`zenith-dashboard__action zenith-dashboard__action--lone ${
                                    panelOpen ? 'is-active' : ''
                                }`}
                                onClick={() => setPanelOpen((v) => !v)}
                                aria-pressed={panelOpen}
                                aria-label={t('dashboard.panel')}
                                title={t('dashboard.panel')}
                            >
                                <Plus size={16} />
                            </button>
                        )}
                        {/* Only once there is something in it: a bell over an empty
                            center is a control that has nothing to say. */}
                        {bell && (
                            <button
                                className="zenith-dashboard__action zenith-dashboard__action--lone zenith-dashboard__bell"
                                onClick={() => new NotificationCenterModal(plugin).open()}
                                aria-label={t('notify.title')}
                                title={t('notify.title')}
                            >
                                <Bell size={16} />
                                {unread > 0 && (
                                    <span className="zenith-dashboard__badge">
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>

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

                <DashboardGrid
                    editing={editing}
                    onEditingChange={setEditing}
                    panel={
                        panelOpen && panelHost
                            ? {
                                  host: panelHost,
                                  tab: panelTab,
                                  onTab: setPanelTab,
                                  onClose: () => setPanelOpen(false),
                              }
                            : null
                    }
                />

                {/* Where the arranging panel is drawn. Inside the canvas, last:
                    it is placed against the board's right edge, and on a
                    narrow pane it is the sheet that follows the board. */}
                <div className="zenith-dashboard__panelwrap" ref={setPanelHost} />
            </div>
        </div>
    );
};
