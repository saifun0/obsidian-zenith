import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    Check,
    Laptop,
    RefreshCw,
    Smartphone,
    HelpCircle,
    Undo2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { FileSyncPanel } from './FileSyncPanel';
import { ConflictInboxPanel } from './ConflictInboxPanel';
import type { SyncStatus } from '../services/settingsSync';
import type { DevicePlatform, JournalEntry } from '../syncTypes';

/**
 * What sync is doing, in terms of devices rather than of files.
 *
 * The interesting question when settings disagree is never "which JSON won" but
 * "which of my machines said this, and when" — so the device is the unit the
 * whole page is organised around.
 */

function relative(t: Translator, at: number): string {
    if (!at) return t('sync.never');
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 60) return t('sync.time.justNow');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t.plural('sync.time.minutes', minutes);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t.plural('sync.time.hours', hours);
    return t.plural('sync.time.days', Math.round(hours / 24));
}

const PlatformIcon: React.FC<{ platform: DevicePlatform; size?: number }> = ({
    platform,
    size = 16,
}) => {
    if (platform === 'desktop') return <Laptop size={size} />;
    if (platform === 'unknown') return <HelpCircle size={size} />;
    return <Smartphone size={size} />;
};

export const SyncApp: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.settingsSync;

    const [status, setStatus] = useState<SyncStatus | null>(service?.getStatus() ?? null);
    const [history, setHistory] = useState<JournalEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const [nameDraft, setNameDraft] = useState(service?.getStatus().deviceName ?? '');
    const nameTouched = useRef(false);

    useEffect(() => {
        if (!service) return;
        setStatus(service.getStatus());
        return service.subscribe(setStatus);
    }, [service]);

    // Let an incoming rename from elsewhere update the box, but never while the
    // user is part-way through typing into it.
    useEffect(() => {
        if (!nameTouched.current && status) setNameDraft(status.deviceName);
    }, [status]);

    const refreshHistory = useCallback(async () => {
        const entries = await service?.readHistory();
        setHistory(entries ?? []);
    }, [service]);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory, status?.lastPullAt, status?.lastPublishAt]);

    const syncNow = async () => {
        if (!service) return;
        setBusy(true);
        try {
            await service.pull();
            await service.publish();
            await refreshHistory();
        } finally {
            setBusy(false);
        }
    };

    const undo = async (entry: JournalEntry) => {
        if (!(await service?.rollback(entry))) return;
        await refreshHistory();
    };

    const commitName = () => {
        nameTouched.current = false;
        service?.rename(nameDraft);
    };

    if (!service || !status) {
        return (
            <div className="zenith-sync">
                <p className="zenith-sync__hint">{t('sync.disabled')}</p>
            </div>
        );
    }

    return (
        <div className="zenith-sync">
            <header className="zenith-sync__head">
                <div>
                    <h2 className="zenith-sync__title">{t('sync.title')}</h2>
                    <p className="zenith-sync__sub">{t('sync.desc')}</p>
                </div>
                <button
                    type="button"
                    className="zenith-sync__cta"
                    onClick={() => void syncNow()}
                    disabled={busy || !status.enabled}
                >
                    <RefreshCw size={14} className={busy ? 'is-spinning' : undefined} />
                    {t('sync.syncNow')}
                </button>
            </header>

            {status.error && (
                <p className="zenith-sync__error">
                    <AlertTriangle size={14} />
                    <span>
                        {t('sync.error')}: {status.error}
                    </span>
                </p>
            )}

            <section className="zenith-sync__card">
                <h3 className="zenith-sync__cardTitle">{t('sync.thisDevice')}</h3>
                <div className="zenith-sync__row">
                    <label className="zenith-sync__label" htmlFor="zenith-sync-name">
                        {t('sync.deviceName')}
                    </label>
                    <input
                        id="zenith-sync-name"
                        type="text"
                        className="zenith-sync__input"
                        value={nameDraft}
                        onChange={(e) => {
                            nameTouched.current = true;
                            setNameDraft(e.target.value);
                        }}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                    />
                </div>
                <p className="zenith-sync__meta">
                    <span
                        className={`zenith-sync__dot ${status.enabled ? 'is-on' : 'is-off'}`}
                        aria-hidden
                    />
                    {status.enabled ? t('sync.status.on') : t('sync.status.off')}
                    {' · '}
                    {t('sync.lastPublish')}: {relative(t, status.lastPublishAt)}
                    {' · '}
                    {t('sync.lastPull')}: {relative(t, status.lastPullAt)}
                </p>
            </section>

            <section className="zenith-sync__card">
                <h3 className="zenith-sync__cardTitle">{t('sync.peers')}</h3>
                {status.peers.length === 0 ? (
                    <p className="zenith-sync__hint">{t('sync.peers.empty')}</p>
                ) : (
                    <ul className="zenith-sync__list">
                        {status.peers.map((peer) => (
                            <li key={peer.id} className="zenith-sync__peer">
                                <PlatformIcon platform={peer.platform} />
                                <span className="zenith-sync__peerName">{peer.name}</span>
                                <span className="zenith-sync__peerMeta">
                                    {t('sync.peers.lastSeen', { when: relative(t, peer.lastSeenAt) })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <ConflictInboxPanel />

            <FileSyncPanel />

            <section className="zenith-sync__card">
                <h3 className="zenith-sync__cardTitle">{t('sync.conflicts')}</h3>
                {status.conflicts.length === 0 ? (
                    <p className="zenith-sync__hint">
                        <Check size={14} /> {t('sync.conflicts.empty')}
                    </p>
                ) : (
                    <ul className="zenith-sync__list">
                        {status.conflicts.map((c) => (
                            <li key={c.key} className="zenith-sync__conflict">
                                <code className="zenith-sync__key">{c.key}</code>
                                <span className="zenith-sync__peerMeta">
                                    {t('sync.conflicts.kept', {
                                        winner:
                                            c.winner === 'local'
                                                ? t('sync.conflicts.local')
                                                : t('sync.conflicts.remote'),
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="zenith-sync__card">
                <h3 className="zenith-sync__cardTitle">{t('sync.history')}</h3>
                {history.length === 0 ? (
                    <p className="zenith-sync__hint">{t('sync.history.empty')}</p>
                ) : (
                    <ul className="zenith-sync__list">
                        {history.slice(0, 30).map((entry) => (
                            <li key={`${entry.at}-${entry.kind}`} className="zenith-sync__event">
                                <span className="zenith-sync__eventKind">
                                    {t(`sync.history.${entry.kind}`, { count: entry.keys.length })}
                                </span>
                                <span className="zenith-sync__peerMeta">
                                    {relative(t, entry.wall)}
                                </span>
                                <span className="zenith-sync__eventKeys">
                                    {entry.keys.slice(0, 4).join(', ')}
                                    {entry.keys.length > 4 ? ` +${entry.keys.length - 4}` : ''}
                                </span>
                                {/* Only an entry that recorded the previous
                                    values can be undone — a publish changed
                                    nothing that was not already this device's
                                    own choice. */}
                                {entry.before && Object.keys(entry.before).length > 0 && (
                                    <button
                                        type="button"
                                        className="zenith-sync__undo"
                                        onClick={() => void undo(entry)}
                                        title={t('sync.undo')}
                                    >
                                        <Undo2 size={13} />
                                        {t('sync.undo')}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};
