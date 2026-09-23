import React, { useEffect, useState } from 'react';
import { Cloud, CloudAlert, CloudOff, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import type { FileSyncService, FileSyncStatus } from '../services/fileSync';
import { syncBarState, type SyncBarIcon } from '../statusBarState';

const ICONS: Record<SyncBarIcon, LucideIcon> = {
    cloud: Cloud,
    offline: CloudOff,
    sync: RefreshCw,
    held: TriangleAlert,
    error: CloudAlert,
};

/**
 * Redraw a transfer at most this often. The engine reports every settled file,
 * and a fast server settles many per frame — see `SyncProgressNotice`.
 */
const FRAME_MS = 150;

/** How often an idle "5 min ago" is re-read, so it does not stop ageing. */
const TICK_MS = 30_000;

/**
 * Vault sync in the status bar, bottom right, where Obsidian's own sync sits.
 *
 * The notice follows a run while it moves files and then goes away; this is
 * the part that stays — whether the vault is up to date, when it last was, and
 * whether something is waiting on you. Clicking it opens the sync dialog; the
 * host element carries that, since it is the status bar's item and not ours.
 *
 * Renders nothing when file sync is not set up, and the host hides itself
 * when empty (see `sync.css`), so a vault without sync has no item at all.
 */
export const SyncStatusBar: React.FC<{ service: FileSyncService }> = ({ service }) => {
    const t = useTranslation();
    const [status, setStatus] = useState<FileSyncStatus>(() => service.getStatus());
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    const [, setTick] = useState(0);

    useEffect(() => {
        let drawnAt = 0;
        setStatus(service.getStatus());
        return service.subscribe((next) => {
            const now = Date.now();
            // Every state change draws; only the stream of per-file progress
            // in between is thinned out.
            if (next.running && next.progress && now - drawnAt < FRAME_MS) return;
            drawnAt = now;
            setStatus(next);
        });
    }, [service]);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine !== false);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
        return () => window.clearInterval(timer);
    }, []);

    const state = syncBarState(status, online, t);
    if (!state) return null;

    const Icon = ICONS[state.icon];
    return (
        <span
            className={`zenith-syncbar is-${state.tone}`}
            aria-label={state.tooltip}
            data-tooltip-position="top"
        >
            <Icon size={14} className={state.spinning ? 'is-spinning' : undefined} />
            {state.text && <span className="zenith-syncbar__text">{state.text}</span>}
        </span>
    );
};
