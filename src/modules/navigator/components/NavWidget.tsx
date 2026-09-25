import React, { useEffect, useMemo, useState } from 'react';
import { Compass } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import {
    navActionDescription,
    navActionLabel,
    runNavAction,
    useNavActions,
    type NavActionDefinition,
} from '../navigation';
import { applyOrder } from '../panel';

/**
 * View types with at least one open leaf.
 *
 * Drives the "already open" dot, which is what turns the launcher from a menu
 * into something that reports the state of the workspace: clicking a button
 * with a dot jumps to that tab instead of creating another one.
 */
function useOpenViewTypes(): Set<string> {
    const { app } = useApp();
    const [open, setOpen] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const read = () => {
            const types = new Set<string>();
            app.workspace.iterateAllLeaves((leaf) => {
                types.add(leaf.view.getViewType());
            });
            setOpen(types);
        };
        read();
        // `layout-change` covers opening, closing and moving a leaf; the active
        // tab changing on its own doesn't alter what is open.
        const ref = app.workspace.on('layout-change', read);
        return () => app.workspace.offref(ref);
    }, [app]);

    return open;
}

/**
 * Dashboard launcher: one button per registered nav action.
 *
 * The buttons come from the registry rather than from a fixed list of views, so
 * the launcher shows exactly what is loaded, in one order, with one hide switch
 * in settings.
 */
export const NavWidget: React.FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const actions = useNavActions();
    const openViews = useOpenViewTypes();

    const layout = useZenithStore((s) => s.settings.navigatorLayout);
    const showLabels = useZenithStore((s) => s.settings.navigatorShowLabels);
    const hidden = useZenithStore((s) => s.settings.navigatorHiddenActions);
    // Arranged in the side panel: one list, shown in both places.
    const order = useZenithStore((s) => s.settings.navigatorOrder);

    const visible = useMemo(
        () => applyOrder(actions, order).filter((a) => !hidden.includes(a.id)),
        [actions, order, hidden]
    );

    // Labels are the only thing to read in the list layout, so the compact
    // (icon-only) option is deliberately limited to the grid.
    const iconsOnly = layout === 'grid' && !showLabels;

    const activate = (def: NavActionDefinition, newTab: boolean) => {
        void runNavAction(def, { app, plugin }, { newTab });
    };

    if (visible.length === 0) {
        return (
            <div className="zenith-launcher__empty">
                <Compass size={20} />
                <p className="zenith-launcher__empty-title">{t('nav.empty')}</p>
                <p className="zenith-launcher__empty-hint">{t('nav.emptyHint')}</p>
            </div>
        );
    }

    return (
        <div
            className={`zenith-launcher zenith-launcher--${layout} ${iconsOnly ? 'is-icons-only' : ''}`}
        >
            {visible.map((def) => {
                const label = navActionLabel(def, t);
                const desc = navActionDescription(def, t);
                const isOpen = !!def.viewType && openViews.has(def.viewType);
                return (
                    <button
                        key={def.id}
                        type="button"
                        className={`zenith-launcher__btn ${isOpen ? 'is-open' : ''}`}
                        // Ctrl/Cmd-click and middle-click force a new tab, the
                        // way every other link in Obsidian behaves.
                        onClick={(e) => activate(def, e.ctrlKey || e.metaKey)}
                        onAuxClick={(e) => {
                            if (e.button !== 1) return;
                            e.preventDefault();
                            activate(def, true);
                        }}
                        title={isOpen ? `${label} — ${t('nav.alreadyOpen')}` : label}
                        aria-label={label}
                    >
                        <span className="zenith-launcher__icon">
                            <DynamicIcon name={def.icon} size={18} fallback={Compass} />
                            {isOpen && <i className="zenith-launcher__dot" aria-hidden="true" />}
                        </span>
                        {!iconsOnly && (
                            <span className="zenith-launcher__text">
                                <span className="zenith-launcher__label">{label}</span>
                                {layout === 'list' && desc && (
                                    <span className="zenith-launcher__desc">{desc}</span>
                                )}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
