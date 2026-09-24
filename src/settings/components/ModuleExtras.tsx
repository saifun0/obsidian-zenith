import React, { type FC } from 'react';
import { useTranslation } from '../../core/i18n';
import { useZenithStore } from '../../store';
import { describePermission } from '../../core/modulePermissions';
import { activityOf } from '../../core/moduleActivity';
import { ExtensionBoundary } from '../../core/extensions/ExtensionSlot';
import { extensions, useExtensions } from '../../core/extensions/registry';

/**
 * Under a third-party module's tile: what it was allowed, and what it wrote.
 * Folded away — it is the answer to a question, not something to read on
 * every visit.
 */
export const ModuleDetails: FC<{ moduleId: string; permissions: readonly string[] }> = ({
    moduleId,
    permissions,
}) => {
    const t = useTranslation();
    const log = useZenithStore((s) => s.settings.moduleActivity);
    const activity = activityOf(log, moduleId).slice(0, 20);
    if (!permissions.length && !activity.length) return null;

    return (
        <details className="zenith-settings__disclosure zenith-module-details">
            <summary>{t('modules.details', { count: activity.length })}</summary>
            {permissions.length > 0 && (
                <>
                    <span className="zenith-module-details__label">{t('modules.permissions')}</span>
                    <ul>
                        {permissions.map((p) => {
                            const { key, params } = describePermission(p);
                            return <li key={p}>{t(key, params)}</li>;
                        })}
                    </ul>
                </>
            )}
            <span className="zenith-module-details__label">{t('modules.activity')}</span>
            {activity.length === 0 ? (
                <p className="zenith-module-details__empty">{t('modules.activity.none')}</p>
            ) : (
                <ul className="zenith-module-details__log">
                    {activity.map((entry, i) => (
                        <li key={`${entry.at}-${i}`}>
                            <time>{new Date(entry.at).toLocaleString(t.locale)}</time>{' '}
                            {entry.action}
                            {entry.path && <code>{entry.path}</code>}
                        </li>
                    ))}
                </ul>
            )}
        </details>
    );
};

/**
 * Sections third-party modules added to a built-in module's page (with the
 * `settings:<module>` permission). Drawn after Zenith's own settings, each
 * titled with the module's own name for it and fenced off like any other
 * extension: a section that fails takes nothing else on the page with it.
 */
export const ExtensionSections: FC<{ moduleId: string }> = ({ moduleId }) => {
    const sections = useExtensions(extensions.settingsSections).filter(
        (s) => s.targetModule === moduleId
    );
    if (!sections.length) return null;
    return (
        <>
            {sections.map((section) => {
                const Part = section.component;
                return (
                    <div
                        key={`${section.moduleId}:${section.id}`}
                        className="zenith-settings__module-group"
                    >
                        <h3 className="zenith-settings__group-title">{section.title}</h3>
                        <ExtensionBoundary
                            moduleId={section.moduleId}
                            where={`settings:${moduleId}`}
                        >
                            {Part ? (
                                <Part />
                            ) : section.mount ? (
                                <MountedSection mount={section.mount} />
                            ) : null}
                        </ExtensionBoundary>
                    </div>
                );
            })}
        </>
    );
};

const MountedSection: FC<{
    mount: (el: HTMLElement, props: Record<string, unknown>) => void | (() => void);
}> = ({ mount }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const cleanup = mount(el, {});
        return () => {
            if (typeof cleanup === 'function') cleanup();
            el.replaceChildren();
        };
    }, [mount]);
    return <div ref={ref} />;
};
