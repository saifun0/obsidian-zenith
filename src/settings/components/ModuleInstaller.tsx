import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, Github, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useZenithStore } from '../../store';
import { useTranslation } from '../../core/i18n';
import { ModuleInstaller as Installer } from '../../core/moduleInstaller';
import type { ModuleSourceKind } from '../../core/moduleSources';
import { Segmented, TextArea, TextInput } from '../controls';

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'error'; text: string };

/** Short, human description of where a module came from. */
function sourceLabel(kind: ModuleSourceKind, ref: string, t: ReturnType<typeof useTranslation>) {
    switch (kind) {
        case 'github':
            return `github.com/${ref}`;
        case 'url':
            return ref;
        case 'vault':
            return ref;
        case 'paste':
            return t('modules.source.paste');
    }
}

/**
 * Installing modules without leaving Obsidian.
 *
 * This is the whole reason the loader was rewritten: the previous answer was
 * "put the files in `.obsidian/plugins/zenith/modules/`", which is impossible
 * on an iPhone — Files does not show hidden folders, and there is no way to
 * reach inside a plugin's directory.
 */
export const ModuleInstallerPanel: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const installed = useZenithStore((s) => s.settings.installedModules);
    const allowed = useZenithStore((s) => s.settings.allowThirdPartyModules);

    const installer = useMemo(() => new Installer(plugin), [plugin]);

    const [kind, setKind] = useState<ModuleSourceKind>('github');
    const [ref, setRef] = useState('');
    const [pasteManifest, setPasteManifest] = useState('');
    const [pasteCode, setPasteCode] = useState('');
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    const run = async (work: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>) => {
        setStatus({ kind: 'busy', text: t('modules.working') });
        const outcome = await work();
        if (outcome.ok) {
            setStatus({ kind: 'idle' });
            setRef('');
            setPasteManifest('');
            setPasteCode('');
        } else if (outcome.cancelled) {
            setStatus({ kind: 'idle' });
        } else {
            setStatus({ kind: 'error', text: outcome.error ?? t('modules.failed') });
        }
    };

    const install = () =>
        void run(() =>
            installer.install(
                { kind, ref },
                { paste: { manifest: pasteManifest, code: pasteCode } }
            )
        );

    const uninstall = (id: string, name: string) => {
        // Removing files and losing configuration both deserve a deliberate
        // answer, so the confirm names the module rather than asking abstractly.
        if (!window.confirm(t('modules.confirmUninstall', { name }))) return;
        void run(() => installer.uninstall(id));
    };

    const canInstall =
        kind === 'paste' ? pasteManifest.trim() !== '' && pasteCode.trim() !== '' : ref.trim() !== '';

    return (
        <>
            <div className="zenith-settings__section-label">{t('modules.install')}</div>

            <Segmented
                value={kind}
                onChange={(v) => {
                    setKind(v as ModuleSourceKind);
                    setStatus({ kind: 'idle' });
                }}
                options={[
                    { value: 'github', label: t('modules.source.github'), icon: 'github' },
                    { value: 'url', label: t('modules.source.url'), icon: 'link-2' },
                    { value: 'vault', label: t('modules.source.vault'), icon: 'folder' },
                    { value: 'paste', label: t('modules.source.paste'), icon: 'clipboard' },
                ]}
            />

            <div className="zenith-modinstall__input">
                {kind === 'paste' ? (
                    <>
                        <TextArea
                            value={pasteManifest}
                            rows={4}
                            monospace
                            placeholder='{ "id": "my-module", "name": "My Module", "version": "1.0.0" }'
                            onChange={setPasteManifest}
                        />
                        <TextArea
                            value={pasteCode}
                            rows={8}
                            monospace
                            placeholder="module.exports = class { … }"
                            onChange={setPasteCode}
                        />
                    </>
                ) : (
                    <TextInput
                        value={ref}
                        monospace={kind !== 'github'}
                        placeholder={t(`modules.placeholder.${kind}`)}
                        onChange={setRef}
                    />
                )}
                <div className="zenith-settings__item-desc">{t(`modules.hint.${kind}`)}</div>
            </div>

            <button
                className="zenith-settings__inline-btn zenith-settings__inline-btn--cta"
                disabled={!canInstall || status.kind === 'busy'}
                onClick={install}
            >
                <Download size={13} /> {t('modules.installButton')}
            </button>

            {status.kind === 'busy' && (
                <div className="zenith-settings__hint">{status.text}</div>
            )}
            {status.kind === 'error' && (
                <div className="zenith-settings__hint zenith-settings__hint--warn">{status.text}</div>
            )}

            {installed.length > 0 && (
                <>
                    <div className="zenith-settings__section-label">{t('modules.installed')}</div>
                    {installed.map((record) => (
                        <div className="zenith-modinstall__row" key={record.id}>
                            <div className="zenith-modinstall__row-main">
                                <span className="zenith-modinstall__name">
                                    {record.name}
                                    <em>v{record.version}</em>
                                </span>
                                <span className="zenith-modinstall__origin">
                                    {record.source.kind === 'github' ? (
                                        <Github size={11} />
                                    ) : record.source.kind === 'url' ? (
                                        <Link2 size={11} />
                                    ) : (
                                        <ExternalLink size={11} />
                                    )}
                                    {sourceLabel(record.source.kind, record.source.ref, t)}
                                </span>
                                {/* Shown on every row, always — a user should
                                    never have to remember which modules are
                                    unsandboxed, because all of them are. */}
                                <span className="zenith-modinstall__badge">
                                    {t('modules.notSandboxed')}
                                </span>
                            </div>
                            <div className="zenith-modinstall__row-actions">
                                <button
                                    className="zenith-settings__inline-btn"
                                    disabled={status.kind === 'busy'}
                                    title={
                                        record.source.kind === 'paste'
                                            ? t('modules.update.paste')
                                            : t('modules.update')
                                    }
                                    onClick={() => void run(() => installer.update(record.id))}
                                >
                                    <RefreshCw size={13} />
                                </button>
                                <button
                                    className="zenith-settings__inline-btn zenith-settings__inline-btn--danger"
                                    disabled={status.kind === 'busy'}
                                    title={t('modules.uninstall')}
                                    onClick={() => uninstall(record.id, record.name)}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    ))}
                </>
            )}

            {!allowed && installed.length > 0 && (
                <div className="zenith-settings__hint">{t('settings.thirdPartyBlocked')}</div>
            )}
        </>
    );
};
