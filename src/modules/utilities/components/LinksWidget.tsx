import React, { useEffect, useState, type FC } from 'react';
import { Keymap, TFile } from 'obsidian';
import { File, FileText, FolderOpen, Globe, Plus, Unlink, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { pickVaultFile } from '../../../components/shared/VaultFilePickerModal';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import {
    linkLabel,
    linkPath,
    normalizeLinksSettings,
    parseLink,
    type LinkItem,
    type ParsedLink,
} from '../links';

/**
 * Bumps when the vault gains, loses or renames a file — the three things that
 * change whether a link leads anywhere — and when Obsidian has finished
 * working out what links to what, which at startup is after the board is
 * already on screen.
 */
function useVaultShape(): number {
    const { app } = useApp();
    const [shape, setShape] = useState(0);

    useEffect(() => {
        const bump = () => setShape((n) => n + 1);
        const vaultRefs = [
            app.vault.on('create', bump),
            app.vault.on('delete', bump),
            app.vault.on('rename', bump),
        ];
        const resolved = app.metadataCache.on('resolved', bump);
        return () => {
            vaultRefs.forEach((ref) => app.vault.offref(ref));
            app.metadataCache.offref(resolved);
        };
    }, [app]);

    return shape;
}

/**
 * The places a day goes back to: notes and addresses, a row each, all in view.
 *
 * A note opens where a click in a note would open it — a new tab with the
 * modifier held. A row whose note is not in the vault is drawn struck out and
 * opens nothing: Obsidian would otherwise answer the click by creating an
 * empty note of that name, which is not what a bookmark is for.
 */
export const LinksWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.links' }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config] = useWidgetConfig(instanceId, normalizeLinksSettings);
    // Read for its changes only: the lookups below go to the vault directly.
    useVaultShape();

    const rows = config.links
        .map((item, i) => ({ item, i, parsed: parseLink(item.target) }))
        .filter((row) => row.parsed.kind !== 'empty');

    if (rows.length === 0) {
        return <p className="zenith-wempty">{t('utilities.links.empty')}</p>;
    }

    const fileOf = (parsed: ParsedLink): TFile | null =>
        parsed.kind === 'vault'
            ? app.metadataCache.getFirstLinkpathDest(linkPath(parsed.linktext), '')
            : null;

    const open = (parsed: ParsedLink, e: React.MouseEvent) => {
        if (parsed.kind === 'url') {
            window.open(parsed.href, '_blank');
        } else if (parsed.kind === 'vault') {
            void app.workspace.openLinkText(parsed.linktext, '', Keymap.isModEvent(e.nativeEvent));
        }
    };

    return (
        <ul className="zenith-ulinks">
            {rows.map(({ item, i, parsed }) => {
                const file = fileOf(parsed);
                const dead = parsed.kind === 'refused' || (parsed.kind === 'vault' && !file);
                const Icon =
                    parsed.kind === 'url'
                        ? Globe
                        : dead
                          ? Unlink
                          : file?.extension === 'md'
                            ? FileText
                            : File;
                return (
                    <li key={i}>
                        <button
                            type="button"
                            className={`zenith-wline zenith-ulinks__row${dead ? ' is-dead' : ''}`}
                            title={dead ? t('utilities.links.dead') : item.target.trim()}
                            aria-disabled={dead}
                            onClick={(e) => {
                                if (!dead) open(parsed, e);
                            }}
                        >
                            <Icon size={14} className="zenith-wline__icon" />
                            <span className="zenith-wline__name">{linkLabel(item)}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

export const LinksSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeLinksSettings);

    const setLink = (i: number, patch: Partial<LinkItem>) =>
        setConfig({ links: config.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

    const add = (target = '') => setConfig({ links: [...config.links, { target, label: '' }] });

    return (
        <div className="zenith-ulinks-settings">
            {config.links.map((link, i) => (
                <div key={i} className="zenith-ulinks-settings__row">
                    <input
                        type="text"
                        className="zenith-input zenith-input--sm is-mono zenith-ulinks-settings__target"
                        value={link.target}
                        placeholder={t('utilities.links.target')}
                        aria-label={t('utilities.links.target')}
                        spellCheck={false}
                        onChange={(e) => setLink(i, { target: e.target.value })}
                        onPointerDown={stop}
                    />
                    <input
                        type="text"
                        className="zenith-input zenith-input--sm zenith-ulinks-settings__label"
                        value={link.label}
                        placeholder={
                            linkLabel({ target: link.target, label: '' }) ||
                            t('utilities.links.name')
                        }
                        aria-label={t('utilities.links.name')}
                        onChange={(e) => setLink(i, { label: e.target.value })}
                        onPointerDown={stop}
                    />
                    <button
                        type="button"
                        className="zenith-util-settings__icon"
                        aria-label={t('utilities.links.remove')}
                        title={t('utilities.links.remove')}
                        onClick={() => setConfig({ links: config.links.filter((_, j) => j !== i) })}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
            <div className="zenith-ulinks-settings__add">
                <button
                    type="button"
                    className="zenith-util-settings__add"
                    onClick={() =>
                        pickVaultFile(app, t('utilities.pick.file'), (path) => add(path))
                    }
                >
                    <FolderOpen size={12} />
                    {t('utilities.links.addNote')}
                </button>
                <button type="button" className="zenith-util-settings__add" onClick={() => add()}>
                    <Plus size={12} />
                    {t('utilities.links.addLink')}
                </button>
            </div>
        </div>
    );
};
