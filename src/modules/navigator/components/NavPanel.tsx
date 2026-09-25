import React, { useEffect, useMemo, useState } from 'react';
import { Notice, Platform } from 'obsidian';
import { Compass } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { IconPickerModal } from '../../../core/IconPickerModal';
import {
    commandHotkey,
    commandLabel,
    commandOwners,
    findCommand,
    isZenithCommandLive,
    runCommand,
    zenithCommandId,
} from '../../../core/commands';
import {
    navActionLabel,
    runNavAction,
    useNavActions,
    type NavActionDefinition,
} from '../navigation';
import { applyOrder, FALLBACK_BUTTON_ICON, type PanelButton } from '../panel';
import { CommandPickerModal } from '../CommandPickerModal';
import { useReorder } from './useReorder';

/**
 * The side panel: command buttons on top, Zenith's views below.
 *
 * The views are the navigation registry the dashboard launcher reads, in the
 * same order and with the same ones hidden — one list, shown in two places.
 * The buttons are the panel's own: any command Obsidian has, named and drawn
 * as the user likes. The pencil turns both into lists to arrange.
 */

type ButtonState = 'ready' | 'off' | 'missing';

interface ResolvedButton {
    button: PanelButton;
    /** `off`: a Zenith command whose module is switched off. `missing`: Obsidian has no such command. */
    state: ButtonState;
    /** The command's own name, which a label of the user's replaces. */
    ownLabel: string;
    label: string;
    icon: string;
    hotkey?: string;
}

/**
 * The view type of the tab last used in the main area. Not the active leaf:
 * a click in this panel makes the panel active, and the view the user came
 * from is still the one to mark.
 */
function useMainViewType(): string | null {
    const { app } = useApp();
    const [type, setType] = useState<string | null>(null);

    useEffect(() => {
        const read = () => setType(app.workspace.getMostRecentLeaf()?.view.getViewType() ?? null);
        read();
        const onLeaf = app.workspace.on('active-leaf-change', read);
        const onLayout = app.workspace.on('layout-change', read);
        return () => {
            app.workspace.offref(onLeaf);
            app.workspace.offref(onLayout);
        };
    }, [app]);

    return type;
}

function useResolvedButtons(buttons: PanelButton[]): ResolvedButton[] {
    const { plugin } = useApp();
    const t = useTranslation();
    // Switching a module on or off changes which of its commands are there.
    const loaded = useZenithStore((s) => s.loadedModuleIds);

    return useMemo(() => {
        const owners = commandOwners(plugin);
        return buttons.map((button): ResolvedButton => {
            const command = findCommand(plugin, button.command);
            const id = zenithCommandId(plugin, button.command);
            const state: ButtonState = !command
                ? 'missing'
                : id && !isZenithCommandLive(plugin, id, owners)
                  ? 'off'
                  : 'ready';
            const shortKey = id ? `navigator.short.${id}` : null;
            const ownLabel = !command
                ? button.command
                : shortKey && t.has(shortKey)
                  ? t(shortKey)
                  : commandLabel(plugin, command, t, owners);
            return {
                button,
                state,
                ownLabel,
                label: button.label || ownLabel,
                icon: button.icon || command?.icon || FALLBACK_BUTTON_ICON,
                hotkey: command ? commandHotkey(plugin, command.id) : undefined,
            };
        });
        // `loaded` is read through `isZenithCommandLive`, not directly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plugin, t, buttons, loaded]);
}

/** A button without the fields that only repeat the command's own. */
function clean(button: PanelButton): PanelButton {
    const out: PanelButton = { command: button.command };
    if (button.label) out.label = button.label;
    if (button.icon) out.icon = button.icon;
    return out;
}

export const NavPanel: React.FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const [editing, setEditing] = useState(false);

    const navigatorOn = useZenithStore((s) => s.loadedModuleIds.includes('navigator'));
    const buttons = useZenithStore((s) => s.settings.navigatorPanelButtons);
    const hidden = useZenithStore((s) => s.settings.navigatorHiddenActions);
    const order = useZenithStore((s) => s.settings.navigatorOrder);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const actions = useNavActions();
    const ordered = useMemo(() => applyOrder(actions, order), [actions, order]);
    const resolved = useResolvedButtons(buttons);
    const mainView = useMainViewType();

    // On a phone the panel is a drawer over the screen; what was tapped opens
    // under it, so it gets out of the way.
    const leavePanel = () => {
        if (Platform.isMobile) app.workspace.rightSplit?.collapse();
    };

    const runButton = (item: ResolvedButton) => {
        // A command about "the current note" would otherwise look for it in
        // this panel, which the click just made the active tab.
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
        leavePanel();
        if (!runCommand(plugin, item.button.command)) new Notice(t('navigator.panel.unavailable'));
    };

    const openView = (def: NavActionDefinition, newTab: boolean) => {
        leavePanel();
        void runNavAction(def, { app, plugin }, { newTab });
    };

    if (!navigatorOn) {
        return <p className="zenith-panel__empty">{t('navigator.panel.off')}</p>;
    }

    const readyButtons = resolved.filter((r) => r.state === 'ready');
    const visibleViews = ordered.filter((a) => !hidden.includes(a.id));

    return (
        <div className={`zenith-panel ${editing ? 'is-editing' : ''}`}>
            <div className="zenith-panel__head">
                <span className="zenith-panel__title">
                    {editing ? t('navigator.panel.editing') : 'Zenith'}
                </span>
                <button
                    type="button"
                    className={`clickable-icon zenith-panel__toggle ${editing ? 'is-active' : ''}`}
                    aria-label={editing ? t('navigator.panel.done') : t('navigator.panel.edit')}
                    onClick={() => setEditing((e) => !e)}
                >
                    <ObsidianIcon name={editing ? 'check' : 'pencil'} />
                </button>
            </div>

            {editing ? (
                <PanelEditor
                    resolved={resolved}
                    buttons={buttons}
                    views={ordered}
                    hidden={hidden}
                    onButtons={(next) => updateSettings({ navigatorPanelButtons: next.map(clean) })}
                    onOrder={(next) => updateSettings({ navigatorOrder: next })}
                    onHidden={(next) => updateSettings({ navigatorHiddenActions: next })}
                />
            ) : (
                <>
                    {readyButtons.length > 0 && (
                        <div className="zenith-panel__buttons">
                            {readyButtons.map((item) => (
                                <button
                                    key={item.button.command}
                                    type="button"
                                    className="zenith-panel__tile"
                                    onClick={() => runButton(item)}
                                    title={
                                        item.hotkey ? `${item.label} (${item.hotkey})` : item.label
                                    }
                                >
                                    <ObsidianIcon name={item.icon} size={16} />
                                    <span className="zenith-panel__tile-label">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <nav className="zenith-panel__nav" aria-label={t('navigator.panel.views')}>
                        {visibleViews.map((def) => {
                            const label = navActionLabel(def, t);
                            const current = !!def.viewType && def.viewType === mainView;
                            return (
                                <button
                                    key={def.id}
                                    type="button"
                                    className={`zenith-panel__row ${current ? 'is-current' : ''}`}
                                    aria-current={current ? 'page' : undefined}
                                    // Ctrl/Cmd-click and middle-click open a new
                                    // tab, as links do everywhere in Obsidian.
                                    onClick={(e) => openView(def, e.ctrlKey || e.metaKey)}
                                    onAuxClick={(e) => {
                                        if (e.button !== 1) return;
                                        e.preventDefault();
                                        openView(def, true);
                                    }}
                                >
                                    <DynamicIcon name={def.icon} size={16} fallback={Compass} />
                                    <span className="zenith-panel__row-label">{label}</span>
                                </button>
                            );
                        })}
                    </nav>

                    {readyButtons.length === 0 && visibleViews.length === 0 && (
                        <p className="zenith-panel__empty">{t('navigator.panel.empty')}</p>
                    )}
                </>
            )}
        </div>
    );
};

interface EditorProps {
    resolved: ResolvedButton[];
    buttons: PanelButton[];
    views: NavActionDefinition[];
    hidden: string[];
    onButtons: (next: PanelButton[]) => void;
    onOrder: (next: string[]) => void;
    onHidden: (next: string[]) => void;
}

/** Both lists as rows to drag, rename, re-icon, hide and remove. */
const PanelEditor: React.FC<EditorProps> = ({
    resolved,
    buttons,
    views,
    hidden,
    onButtons,
    onOrder,
    onHidden,
}) => {
    const t = useTranslation();
    const { app, plugin } = useApp();

    const byCommand = useMemo(
        () => new Map(resolved.map((r) => [r.button.command, r])),
        [resolved]
    );
    const buttonDrag = useReorder(
        buttons.map((b) => b.command),
        (next) => onButtons(next.map((c) => byCommand.get(c)?.button ?? { command: c }))
    );

    const viewById = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);
    const viewDrag = useReorder(
        views.map((v) => v.id),
        onOrder
    );

    const patch = (command: string, change: Partial<PanelButton>) =>
        onButtons(buttons.map((b) => (b.command === command ? { ...b, ...change } : b)));

    const addCommand = () =>
        new CommandPickerModal(plugin, new Set(buttons.map((b) => b.command)), (command) =>
            onButtons([...buttons, { command: command.id }])
        ).open();

    const toggleHidden = (id: string) =>
        onHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);

    return (
        <>
            <div className="zenith-panel__section">{t('navigator.panel.buttons')}</div>
            <div className="zenith-panel__list">
                {buttonDrag.order.map((command) => {
                    const item = byCommand.get(command);
                    if (!item) return null;
                    const note =
                        item.state === 'off'
                            ? t('navigator.panel.moduleOff')
                            : item.state === 'missing'
                              ? t('navigator.panel.missing')
                              : null;
                    return (
                        <div
                            key={command}
                            ref={buttonDrag.rowRef(command)}
                            className={`zenith-panel__edit-row ${buttonDrag.draggingId === command ? 'is-dragging' : ''} ${note ? 'is-unavailable' : ''}`}
                        >
                            <span
                                className="zenith-panel__grip"
                                role="button"
                                tabIndex={0}
                                aria-label={t('navigator.panel.move')}
                                {...buttonDrag.handleProps(command)}
                            >
                                <ObsidianIcon name="grip-vertical" size={14} />
                            </span>
                            <button
                                type="button"
                                className="clickable-icon zenith-panel__icon-btn"
                                aria-label={t('navigator.panel.icon')}
                                onClick={() =>
                                    new IconPickerModal(app, item.icon, (icon) =>
                                        patch(command, { icon })
                                    ).open()
                                }
                            >
                                <ObsidianIcon name={item.icon} size={16} />
                            </button>
                            <span className="zenith-panel__edit-text">
                                <input
                                    type="text"
                                    className="zenith-panel__label-input"
                                    value={item.button.label ?? ''}
                                    placeholder={item.ownLabel}
                                    aria-label={t('navigator.panel.label')}
                                    onChange={(e) =>
                                        patch(command, { label: e.target.value || undefined })
                                    }
                                />
                                {note && <span className="zenith-panel__note">{note}</span>}
                            </span>
                            <button
                                type="button"
                                className="clickable-icon"
                                aria-label={t('navigator.panel.remove')}
                                onClick={() =>
                                    onButtons(buttons.filter((b) => b.command !== command))
                                }
                            >
                                <ObsidianIcon name="x" size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button type="button" className="zenith-panel__add" onClick={addCommand}>
                <ObsidianIcon name="plus" size={14} />
                <span>{t('navigator.panel.add')}</span>
            </button>

            <div className="zenith-panel__section">{t('navigator.panel.views')}</div>
            <div className="zenith-panel__list">
                {viewDrag.order.map((id) => {
                    const def = viewById.get(id);
                    if (!def) return null;
                    const isHidden = hidden.includes(id);
                    return (
                        <div
                            key={id}
                            ref={viewDrag.rowRef(id)}
                            className={`zenith-panel__edit-row ${viewDrag.draggingId === id ? 'is-dragging' : ''} ${isHidden ? 'is-hidden' : ''}`}
                        >
                            <span
                                className="zenith-panel__grip"
                                role="button"
                                tabIndex={0}
                                aria-label={t('navigator.panel.move')}
                                {...viewDrag.handleProps(id)}
                            >
                                <ObsidianIcon name="grip-vertical" size={14} />
                            </span>
                            <span className="zenith-panel__icon-static">
                                <DynamicIcon name={def.icon} size={16} fallback={Compass} />
                            </span>
                            <span className="zenith-panel__edit-text">
                                <span className="zenith-panel__row-label">
                                    {navActionLabel(def, t)}
                                </span>
                            </span>
                            <button
                                type="button"
                                className="clickable-icon"
                                aria-label={
                                    isHidden ? t('navigator.panel.show') : t('navigator.panel.hide')
                                }
                                aria-pressed={!isHidden}
                                onClick={() => toggleHidden(id)}
                            >
                                <ObsidianIcon name={isHidden ? 'eye-off' : 'eye'} size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <p className="zenith-panel__hint">{t('navigator.panel.shared')}</p>
        </>
    );
};
