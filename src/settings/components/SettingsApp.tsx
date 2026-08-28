import React, { useMemo, useState } from 'react';
import {
    ChevronRight,
    ArrowLeft,
    Settings,
    LayoutGrid,
    Palette,
    FolderTree,
    Pencil,
    X,
    Info,
    Brain,
} from 'lucide-react';
import { useZenithStore } from '../../store';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';
import { localizeModules } from '../../core/moduleLabels';
import { CheckboxCard } from '../../components/ui/CheckboxCard';
import { DynamicIcon } from '../../components/shared/DynamicIcon';
import { ObsidianIcon } from '../../components/shared/ObsidianIcon';
import { VaultScaffoldModal } from '../../core/VaultScaffoldModal';
import { IconPickerModal } from '../../core/IconPickerModal';
import { JournalSettings } from './JournalSettings';
import { IconPacksSettings } from './IconPacksSettings';
import { ModuleInstallerPanel } from './ModuleInstaller';
import { Toggle } from '../controls';
import { configurableModules } from '../moduleMenu';
import { CoreSettingsForm } from '../schema/CoreSettingsForm';
import { appearanceSchema, generalSchema } from '../schema/coreSchemas';
import { ModuleSettingsForm } from '../schema/ModuleSettingsForm';
import type { CoreSettingsSchema } from '../schema/types';

type Category = 'general' | 'appearance' | 'vault' | 'modules' | 'about';

export const SettingsApp: React.FC = () => {
    const { app, plugin } = useApp();
    const t = useTranslation();

    const settings = useZenithStore((state) => state.settings);
    const discovered = useZenithStore((state) => state.availableModules) || [];
    const updateSettings = useZenithStore((state) => state.updateSettings);

    // Every list on this page reads the translated name, including the one that
    // sorts alphabetically — sorting on the English original would order the
    // rows by text nobody on screen can see.
    const availableModules = useMemo(
        () => localizeModules(t, discovered),
        [t, discovered]
    );

    const [activeCategory, setActiveCategory] = useState<Category | null>(null);
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    // Module problems live on the manager, not in the store, so approving one
    // has to force the repaint that clears its warning.
    const [, forceRefresh] = useState(0);
    const toggleModule = (moduleId: string, checked: boolean) => {
        const active = settings.activeModuleIds;
        const newIds = checked
            ? [...active, moduleId]
            : active.filter((id) => id !== moduleId);
        updateSettings({ activeModuleIds: newIds });
    };

    // ── Root menu ───────────────────────────────────────────────────────────

    const MENU: Array<{ id: Category; icon: React.ReactNode; titleKey: string; descKey: string }> = [
        { id: 'general', icon: <Settings size={18} />, titleKey: 'settings.general', descKey: 'settings.general.desc' },
        { id: 'appearance', icon: <Palette size={18} />, titleKey: 'settings.appearance', descKey: 'settings.appearance.desc' },
        { id: 'vault', icon: <FolderTree size={18} />, titleKey: 'settings.vault', descKey: 'settings.vault.desc' },
        { id: 'modules', icon: <LayoutGrid size={18} />, titleKey: 'settings.modules', descKey: 'settings.modules.desc' },
        { id: 'about', icon: <Info size={18} />, titleKey: 'settings.about', descKey: 'settings.about.desc' },
    ];

    const menuRow = (
        key: string,
        icon: React.ReactNode,
        title: string,
        desc: string,
        onClick: () => void,
        badge?: string
    ) => (
        <div key={key} className="zenith-settings__menu-item" onClick={onClick}>
            <div className="zenith-settings__menu-icon">{icon}</div>
            <div className="zenith-settings__menu-text">
                <div className="zenith-settings__menu-title">
                    {title}
                    {badge && <span className="zenith-settings__menu-badge">{badge}</span>}
                </div>
                <div className="zenith-settings__menu-desc">{desc}</div>
            </div>
            <ChevronRight size={18} className="zenith-settings__menu-chevron" />
        </div>
    );

    /**
     * Whether a module has anything to show on a settings page.
     *
     * The journal is asked about by name because it brings a hand-written page
     * rather than a schema — the same exception `renderModuleSettings` makes,
     * and the two have to agree or the list offers a row that opens nothing, or
     * hides one that would have worked.
     */
    const hasSettings = (id: string) =>
        id === 'journal' || !!plugin.moduleManager.get(id)?.getSettingsSchema?.();

    const renderRootMenu = () => {
        const modules = configurableModules(
            availableModules,
            settings.activeModuleIds,
            hasSettings
        );

        return (
            <>
                {/* The module list below announces itself with a label; the
                    plugin's own settings sat above it unannounced, so the two
                    groups read as one list with a caption stuck in the middle.
                    Both are titled now, and the page is symmetric. */}
                <div className="zenith-settings__menu-divider">
                    {t('settings.pluginSettings')}
                </div>
                <div className="zenith-settings__menu">
                    {MENU.map((m) =>
                        menuRow(m.id, m.icon, t(m.titleKey), t(m.descKey), () =>
                            setActiveCategory(m.id)
                        )
                    )}
                </div>

                {/* Every module's settings, one click from the front door.
                    They are also reachable through Active modules, which is
                    where you go to switch one on — but that is a different
                    errand from changing what an module you already use does,
                    and it was the only way to get here. */}
                {modules.length > 0 && (
                    <>
                        <div className="zenith-settings__menu-divider">
                            {t('settings.moduleSettings')}
                        </div>
                        <div className="zenith-settings__menu">
                            {modules.map((m) =>
                                menuRow(
                                    m.id,
                                    <DynamicIcon name={m.icon ?? ''} fallback={LayoutGrid} size={18} />,
                                    m.name,
                                    m.description,
                                    () => setActiveModuleId(m.id),
                                    m.isBuiltIn ? undefined : t('settings.thirdPartyBadge')
                                )
                            )}
                        </div>
                    </>
                )}
            </>
        );
    };

    // ── General ─────────────────────────────────────────────────────────────

    const renderGeneral = () => (
        <div className="zenith-settings__content">
            <CoreSettingsForm schema={generalSchema} />
        </div>
    );

    const renderAppearance = () => (
        <div className="zenith-settings__content">
            <CoreSettingsForm schema={appearanceSchema} />
            <IconPacksSettings />
        </div>
    );

    // ── Vault (structure + folder icons) ────────────────────────────────────

    const renderVault = () => {
        const iconEntries = Object.entries(settings.folderIcons);

        return (
            <div className="zenith-settings__content">
                <div className="zenith-settings__item zenith-settings__item--stack">
                    <div className="zenith-settings__item-info">
                        <span className="zenith-settings__item-name">{t('settings.scaffold')}</span>
                        <span className="zenith-settings__item-desc">{t('settings.scaffold.desc')}</span>
                    </div>
                    <div className="zenith-settings__item-control">
                        <button
                            className="zenith-settings__inline-btn zenith-settings__inline-btn--cta"
                            onClick={() => new VaultScaffoldModal(app).open()}
                        >
                            {t('settings.scaffold.button')}
                        </button>
                    </div>
                </div>

                <div className="zenith-settings__section-label">{t('settings.folderIcons')}</div>
                <div className="zenith-settings__item-desc zenith-settings__item-desc--block">
                    {t('settings.folderIcons.desc')}
                </div>

                {iconEntries.length === 0 ? (
                    <div className="zenith-settings__empty-note">{t('settings.folderIcons.empty')}</div>
                ) : (
                    <div className="zenith-settings__widget-list">
                        {iconEntries.map(([path, iconId]) => (
                            <div key={path} className="zenith-settings__widget-row">
                                <span className="zenith-settings__icon-row-left">
                                    <ObsidianIcon name={iconId} size={16} />
                                    <span className="zenith-settings__icon-row-path" title={path}>
                                        {path}
                                    </span>
                                </span>
                                <div className="zenith-settings__widget-actions">
                                    <button
                                        className="zenith-settings__icon-btn"
                                        aria-label={t('a11y.changeIcon')}
                                        onClick={() =>
                                            new IconPickerModal(app, iconId, (id) =>
                                                plugin.folderIconService.setIcon(path, id)
                                            ).open()
                                        }
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        className="zenith-settings__icon-btn"
                                        aria-label={t('a11y.removeIcon')}
                                        onClick={() => plugin.folderIconService.removeIcon(path)}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ── Per-module settings ─────────────────────────────────────────────────

    const renderModuleSettings = (id: string) => {
        // The journal brings its own page (habits editor, template, the core
        // Daily notes conflict check) rather than a handful of fields.
        if (id === 'journal') return <JournalSettings />;

        // A module that describes its settings renders itself. The switch below
        // is what is left of the old hardcoded table, and shrinks as modules are
        // converted; a third-party module can only ever take this path, since
        // there was never anywhere for it in the switch.
        const schema = plugin.moduleManager.get(id)?.getSettingsSchema?.();
        if (schema) {
            // Built-ins write into flat `ZenithSettings` keys; third-party
            // modules into their own bucket, which is the only place they are
            // allowed to store anything.
            const isBuiltIn = availableModules.find((m) => m.id === id)?.isBuiltIn ?? false;
            return (
                <div className="zenith-settings__content">
                    {isBuiltIn ? (
                        <CoreSettingsForm schema={schema as CoreSettingsSchema} />
                    ) : (
                        <ModuleSettingsForm schema={schema} />
                    )}
                </div>
            );
        }

        // Nothing left in the old hardcoded table: every built-in module now
        // publishes a schema, and anything without one genuinely has nothing to
        // configure.
        return (
            <div className="zenith-settings__content">
                <div className="zenith-settings__empty-note">{t('settings.moduleNoSettings')}</div>
            </div>
        );
    };

    // ── Modules ─────────────────────────────────────────────────────────────

    const renderModules = () => {
        const builtIn = availableModules.filter((m) => m.isBuiltIn);
        const thirdParty = availableModules.filter((m) => !m.isBuiltIn);

        const renderGroup = (list: typeof availableModules) =>
            list.map((module) => (
                <CheckboxCard
                    key={module.id}
                    title={module.name}
                    description={module.description}
                    iconName={module.icon}
                    checked={settings.activeModuleIds.includes(module.id)}
                    onChange={(checked) => toggleModule(module.id, checked)}
                    onSettings={() => setActiveModuleId(module.id)}
                />
            ));

        return (
            <div className="zenith-settings__content">
                {builtIn.length > 0 && (
                    <div className="zenith-settings__module-group">
                        <h3 className="zenith-settings__group-title">{t('settings.builtInModules')}</h3>
                        <div className="zenith-settings__module-grid">{renderGroup(builtIn)}</div>
                    </div>
                )}

                <div className="zenith-settings__module-group">
                    <h3 className="zenith-settings__group-title">{t('settings.thirdPartyModules')}</h3>

                    {/* The risk is stated permanently, not just at install
                        time — a module is plain JavaScript with the same reach
                        as Obsidian itself, and the UI must never imply Zenith
                        sandboxes it. What that costs the page is one line; the
                        paragraph spelling it out is a click away rather than a
                        banner to scroll past on every visit. */}
                    <div className="zenith-settings__item">
                        <div className="zenith-settings__item-info">
                            <span className="zenith-settings__item-name">
                                {t('settings.allowThirdParty')}
                            </span>
                            <span className="zenith-settings__item-desc">
                                {t('settings.thirdPartyWarning.short')}
                            </span>
                            <details className="zenith-settings__disclosure">
                                <summary>{t('settings.thirdPartyWarning.more')}</summary>
                                <p>{t('settings.thirdPartyWarning')}</p>
                            </details>
                        </div>
                        <div className="zenith-settings__item-control">
                            <Toggle
                                checked={settings.allowThirdPartyModules}
                                onChange={(v) => updateSettings({ allowThirdPartyModules: v })}
                            />
                        </div>
                    </div>

                    {thirdParty.length > 0 ? (
                        <>
                            {!settings.allowThirdPartyModules && (
                                <div className="zenith-settings__hint">
                                    {t('settings.thirdPartyBlocked')}
                                </div>
                            )}
                            <div className="zenith-settings__module-grid">
                            {thirdParty.map((module) => {
                                const problem = plugin.moduleManager.getProblem(module.id);
                                return (
                                    // The tile and its warning share one grid
                                    // cell, so a module that cannot run stays
                                    // visually attached to the reason.
                                    <div className="zenith-settings__module-cell" key={module.id}>
                                        <CheckboxCard
                                            title={module.name}
                                            description={module.description}
                                            iconName={module.icon}
                                            checked={settings.activeModuleIds.includes(module.id)}
                                            onChange={(checked) => toggleModule(module.id, checked)}
                                            onSettings={() => setActiveModuleId(module.id)}
                                        />
                                        {/* A folder the user can see doing
                                            nothing is a mystery; say why. */}
                                        {problem && (
                                            <div className="zenith-settings__hint zenith-settings__hint--warn">
                                                <span>
                                                    {t(problem.reason.key, problem.reason.params)}
                                                </span>
                                                {/* Consent is asked HERE, on a
                                                    deliberate click, and never
                                                    during plugin startup. */}
                                                {problem.kind === 'needs-consent' && (
                                                    <button
                                                        className="zenith-settings__inline-btn"
                                                        onClick={() =>
                                                            void plugin.moduleInstaller
                                                                .approve(module.id)
                                                                .then(() => forceRefresh((n) => n + 1))
                                                        }
                                                    >
                                                        {t('modules.approve')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            </div>
                        </>
                    ) : (
                        <div className="zenith-settings__empty-note">{t('settings.noThirdParty')}</div>
                    )}

                    <ModuleInstallerPanel />
                </div>
            </div>
        );
    };

    // ── About ───────────────────────────────────────────────────────────────

    const renderAbout = () => {
        const m = plugin.manifest;
        const builtIn = availableModules.filter((mod) => mod.isBuiltIn).map((mod) => mod.name);
        return (
            <div className="zenith-settings__content zenith-about">
                <div className="zenith-about__hero">
                    <div className="zenith-about__logo">
                        <Brain size={30} />
                    </div>
                    <div className="zenith-about__heading">
                        <div className="zenith-about__name">{m.name}</div>
                        <div className="zenith-about__version">v{m.version}</div>
                    </div>
                </div>

                {m.description && <p className="zenith-about__desc">{m.description}</p>}

                <div className="zenith-about__facts">
                    <div className="zenith-about__fact">
                        <span className="zenith-about__fact-key">{t('settings.about.author')}</span>
                        <span className="zenith-about__fact-val">{m.author || '—'}</span>
                    </div>
                    <div className="zenith-about__fact">
                        <span className="zenith-about__fact-key">{t('settings.about.version')}</span>
                        <span className="zenith-about__fact-val">{m.version}</span>
                    </div>
                    <div className="zenith-about__fact">
                        <span className="zenith-about__fact-key">{t('settings.about.minApp')}</span>
                        <span className="zenith-about__fact-val">{m.minAppVersion}</span>
                    </div>
                    <div className="zenith-about__fact">
                        <span className="zenith-about__fact-key">{t('settings.about.modules')}</span>
                        <span className="zenith-about__fact-val">
                            {builtIn.length ? builtIn.join(', ') : '—'}
                        </span>
                    </div>
                </div>

                <div className="zenith-about__note">{t('settings.about.note')}</div>
            </div>
        );
    };

    // ── Shell ───────────────────────────────────────────────────────────────

    const CATEGORY_TITLE: Record<Category, string> = {
        general: 'settings.general',
        appearance: 'settings.appearance',
        vault: 'settings.vault',
        modules: 'settings.modules',
        about: 'settings.about',
    };

    return (
        <div className="zenith-settings">
            <div className="zenith-settings__header">
                {activeModuleId ? (
                    <button className="zenith-settings__back-btn" onClick={() => setActiveModuleId(null)}>
                        <ArrowLeft size={16} />
                        <span className="zenith-settings__back-text">
                            {availableModules.find((m) => m.id === activeModuleId)?.name ?? t('settings.modules')}
                        </span>
                    </button>
                ) : activeCategory ? (
                    <button className="zenith-settings__back-btn" onClick={() => setActiveCategory(null)}>
                        <ArrowLeft size={16} />
                        <span className="zenith-settings__back-text">{t(CATEGORY_TITLE[activeCategory])}</span>
                    </button>
                ) : (
                    <h2 className="zenith-settings__title">
                        <Brain size={20} className="zenith-settings__title-icon" />
                        {t('settings.title')}
                    </h2>
                )}
            </div>

            <div className="zenith-settings__body">
                {activeModuleId ? (
                    renderModuleSettings(activeModuleId)
                ) : (
                    <>
                        {!activeCategory && renderRootMenu()}
                        {activeCategory === 'general' && renderGeneral()}
                        {activeCategory === 'appearance' && renderAppearance()}
                        {activeCategory === 'vault' && renderVault()}
                        {activeCategory === 'modules' && renderModules()}
                        {activeCategory === 'about' && renderAbout()}
                    </>
                )}
            </div>
        </div>
    );
};
