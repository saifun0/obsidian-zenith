import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { localizeModule } from '../../../core/moduleLabels';
import { iconRegistry } from '../../../core/icons';
import { dashboardWidgets } from '../../../modules/dashboard/widgets';
import { navActions } from '../../../modules/navigator/navigation';
import { ActionButton } from '../../controls';
import { Badge } from '../../../components/shared';

/**
 * The module registry, said out loud.
 *
 * Everything here is derived at render rather than stored, because the whole
 * value of the page is being a second opinion: if it read the same cached
 * summary the settings list reads, it could not disagree with it, and a
 * disagreement is exactly what a bug in the loader looks like.
 *
 * The manager holds problems and load state outside the store, so switching
 * something on does not repaint this on its own — hence the refresh button
 * rather than a promise that it is live.
 */

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="zenith-debug__fact">
        <span className="zenith-debug__fact-key">{label}</span>
        <span className="zenith-debug__fact-val">{value}</span>
    </div>
);

export const ModuleDiagnostics: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const discovered = useZenithStore((s) => s.availableModules);
    const [, repaint] = useState(0);

    const manager = plugin.moduleManager;
    const loaded = new Set(manager.getLoadedModuleIds());
    const active = new Set(settings.activeModuleIds);
    const problems = manager.getProblems();

    const widgets = dashboardWidgets.getSnapshot();
    const actions = navActions.getSnapshot();
    const sources = iconRegistry.listSources();

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-debug__toolbar">
                <ActionButton label={t('debug.refresh')} onClick={() => repaint((n) => n + 1)} />
            </div>

            <div className="zenith-settings__section-label">{t('debug.modules.registry')}</div>
            <div className="zenith-debug__table">
                {discovered.map((manifest) => {
                    const shown = localizeModule(t, manifest);
                    const problem = manager.getProblem(manifest.id);
                    const renamed = shown.name !== manifest.name;
                    return (
                        <div className="zenith-debug__row" key={manifest.id}>
                            <div className="zenith-debug__row-main">
                                <span className="zenith-debug__row-title">
                                    {shown.name}
                                    {/* The raw manifest name beside the shown one:
                                        the two differing is what "it translated"
                                        looks like, and the two being equal is
                                        what a missing chunk looks like. */}
                                    {renamed && (
                                        <em className="zenith-debug__row-alt">{manifest.name}</em>
                                    )}
                                </span>
                                <code className="zenith-debug__row-id">{manifest.id}</code>
                            </div>
                            <div className="zenith-debug__row-tags">
                                {active.has(manifest.id) && (
                                    <Badge text={t('debug.modules.active')} variant="info" />
                                )}
                                <Badge
                                    text={
                                        loaded.has(manifest.id)
                                            ? t('debug.modules.loaded')
                                            : t('debug.modules.notLoaded')
                                    }
                                    variant={loaded.has(manifest.id) ? 'success' : 'default'}
                                    dot
                                />
                                {problem && <Badge text={problem.kind} variant="danger" />}
                            </div>
                            {problem && (
                                <div className="zenith-debug__row-problem">
                                    {t(problem.reason.key, problem.reason.params)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="zenith-settings__section-label">{t('debug.modules.problems')}</div>
            {problems.length === 0 ? (
                <div className="zenith-settings__empty-note">{t('debug.modules.noProblems')}</div>
            ) : (
                <div className="zenith-debug__table">
                    {problems.map((problem) => (
                        <div className="zenith-debug__row" key={problem.id}>
                            <div className="zenith-debug__row-main">
                                <code className="zenith-debug__row-id">{problem.id}</code>
                                <Badge text={problem.kind} variant="danger" />
                            </div>
                            <div className="zenith-debug__row-problem">
                                {t(problem.reason.key, problem.reason.params)}
                            </div>
                            <code className="zenith-debug__row-key">{problem.reason.key}</code>
                        </div>
                    ))}
                </div>
            )}

            <div className="zenith-settings__section-label">{t('debug.modules.contributed')}</div>
            <div className="zenith-debug__facts">
                <Row
                    label={t('debug.modules.widgets')}
                    value={
                        widgets.length === 0
                            ? '—'
                            : widgets.map((w) => w.id).join(', ')
                    }
                />
                <Row
                    label={t('debug.modules.navActions')}
                    value={actions.length === 0 ? '—' : actions.map((a) => a.id).join(', ')}
                />
                <Row
                    label={t('debug.modules.iconSources')}
                    value={
                        sources.length === 0
                            ? '—'
                            : sources
                                  .map((source) => `${source.id} (${source.icons.length})`)
                                  .join(', ')
                    }
                />
            </div>
        </div>
    );
};
