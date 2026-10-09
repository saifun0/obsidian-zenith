import React, { useEffect, useMemo, useState, type FC } from 'react';
import { Keymap, TFile } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { relativeTime } from '../../sync/relativeTime';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import { listColumns, rowPx, rowsThatFit, useCardRoom } from '../../dashboard/cardRoom';
import {
    RECENT_BYS,
    normalizeRecentSettings,
    recentLimit,
    recentlyModified,
    recentlyOpened,
    type RecentBy,
} from '../recent';

/** How long the vault has to be quiet before the list is worked out again. */
const SETTLE_MS = 400;

/**
 * Bumps a little after the vault or the workspace changed.
 *
 * A little after, not at once: a sync or a rename of a folder is hundreds of
 * events in a row, and sorting the vault for each would be sorting it hundreds
 * of times to show the last result.
 */
function useVaultActivity(): number {
    const { app } = useApp();
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let timer: number | undefined;
        const bump = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setVersion((n) => n + 1), SETTLE_MS);
        };
        const vaultRefs = [
            app.vault.on('modify', bump),
            app.vault.on('create', bump),
            app.vault.on('delete', bump),
            app.vault.on('rename', bump),
        ];
        const opened = app.workspace.on('file-open', bump);
        return () => {
            window.clearTimeout(timer);
            vaultRefs.forEach((ref) => app.vault.offref(ref));
            app.workspace.offref(opened);
        };
    }, [app]);

    return version;
}

/**
 * The notes last written, or the files last opened: a row each, newest first.
 *
 * As many as the card holds, and never one more: the rows that fit the height
 * it was given, in as many columns as fit its width. So a card is full at
 * every size and on a phone, and none of them scrolls. A row opens its note —
 * in a new tab with the modifier held, as a link in a note would.
 */
export const RecentWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.recent' }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config] = useWidgetConfig(instanceId, normalizeRecentSettings);
    const version = useVaultActivity();
    // "5 min ago" has to become "6 min ago" with nobody touching the vault.
    useNow(60_000);

    const room = useCardRoom();
    const limit = recentLimit(listColumns(room.width), rowsThatFit(room.height, rowPx()));
    const opened = config.recentBy === 'opened';

    const entries = useMemo(
        () => {
            if (opened) {
                return recentlyOpened(
                    app.workspace.getLastOpenFiles(),
                    (path) => {
                        const file = app.vault.getAbstractFileByPath(path);
                        return file instanceof TFile
                            ? { path: file.path, mtime: file.stat.mtime }
                            : null;
                    },
                    limit
                );
            }
            return recentlyModified(
                app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime })),
                limit
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the vault having changed: it is not read by the callback, it is what says the lists are stale.
        [app, opened, limit, version]
    );

    if (entries.length === 0) {
        return <p className="zenith-wempty">{t('utilities.recent.empty')}</p>;
    }

    return (
        <ul className="zenith-wlist zenith-wlist--columns">
            {entries.map((entry) => (
                <li key={entry.path}>
                    <button
                        type="button"
                        className="zenith-wline"
                        title={entry.path}
                        onClick={(e) =>
                            void app.workspace.openLinkText(
                                entry.path,
                                '',
                                Keymap.isModEvent(e.nativeEvent)
                            )
                        }
                    >
                        <span className="zenith-wline__name">{entry.name}</span>
                        <span className="zenith-wline__end">
                            {opened ? entry.folder : relativeTime(t, entry.mtime)}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
};

export const RecentSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeRecentSettings);

    return (
        <div className="zenith-widget-settings__row">
            <span className="zenith-widget-settings__label">{t('utilities.recent.by')}</span>
            <span className="zenith-widget-settings__presets">
                {RECENT_BYS.map((by: RecentBy) => (
                    <button
                        key={by}
                        className={by === config.recentBy ? 'is-active' : ''}
                        aria-pressed={by === config.recentBy}
                        onClick={() => setConfig({ recentBy: by })}
                    >
                        {t(`utilities.recent.by.${by}`)}
                    </button>
                ))}
            </span>
        </div>
    );
};
