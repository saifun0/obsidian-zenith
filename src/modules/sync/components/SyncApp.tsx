import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Laptop, Smartphone, HelpCircle, Undo2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { FileSyncPanel } from './FileSyncPanel';
import { ConflictInboxPanel } from './ConflictInboxPanel';
import { SyncSection } from './SyncSection';
import { groupHistory, type HistoryGroup } from './historyGroups';
import type { SyncStatus } from '../services/settingsSync';
import type { DevicePlatform, JournalEntry } from '../syncTypes';

/**
 * What sync is doing, in terms of devices rather than of files.
 *
 * The interesting question when settings disagree is never "which JSON won" but
 * "which of my machines said this, and when" — so the device is the unit the
 * whole page is organised around.
 *
 * The page was a stack of six cards of equal weight, and five of them were
 * usually reporting that nothing had happened: no other devices, no conflicts,
 * no collisions, plus thirty rows of history saying `dashboardBgSource` over
 * and over. A page where every section is present at all times has no shape,
 * and the one line that matters — is it working, and when did it last run — was
 * the smallest thing on it.
 *
 * So it leads with the state, one line, in the largest type on the page; the
 * devices are one list rather than two cards; the null results collapse to a
 * single tick each; and the history opens rather than sprawls. See
 * `groupHistory` for what happened to the repetition.
 *
 * `embedded` is the same page inside the settings tab, which is where it now
 * primarily lives — there the settings dialog supplies the heading and the
 * padding, so the component drops its own.
 */

/** How many history rows to draw before the rest wait behind a press. */
const HISTORY_PREVIEW = 5;
const HISTORY_MAX = 40;

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
    const [expanded, setExpanded] = useState(false);
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

    const groups = useMemo(() => groupHistory(history).slice(0, HISTORY_MAX), [history]);

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
            <div className="zenith-sync is-embedded">
                <p className="zenith-sync__hint">{t('sync.disabled')}</p>
            </div>
        );
    }

    const shown = expanded ? groups : groups.slice(0, HISTORY_PREVIEW);

    return (
        <div className="zenith-sync is-embedded">

            {/* One list, not two cards. This device is a device — the only
                thing that makes it special is that its name is editable and
                that it is always first. */}
            <SyncSection title={t('sync.devices')}>
                <ul className="zenith-sync__list">
                    <li className="zenith-sync__peer is-self">
                        <PlatformIcon platform="desktop" />
                        <input
                            id="zenith-sync-name"
                            type="text"
                            className="zenith-input zenith-sync__input"
                            aria-label={t('sync.deviceName')}
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
                        <span className="zenith-sync__tag">{t('sync.thisDeviceTag')}</span>
                    </li>

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

                {status.peers.length === 0 && (
                    <p className="zenith-sync__hint">{t('sync.peers.empty')}</p>
                )}
            </SyncSection>

            <ConflictInboxPanel />

            <FileSyncPanel />

            <SyncSection
                title={t('sync.conflicts')}
                quiet={status.conflicts.length === 0 ? t('sync.conflicts.empty') : undefined}
            >
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
            </SyncSection>

            <SyncSection
                title={t('sync.history')}
                quiet={groups.length === 0 ? t('sync.history.empty') : undefined}
                actions={
                    groups.length > HISTORY_PREVIEW ? (
                        <button
                            type="button"
                            className="zenith-sync__more"
                            onClick={() => setExpanded((v) => !v)}
                            aria-expanded={expanded}
                        >
                            {expanded
                                ? t('sync.history.less')
                                : t('sync.history.all', { count: String(groups.length) })}
                            <ChevronDown size={13} className={expanded ? 'is-open' : undefined} />
                        </button>
                    ) : undefined
                }
            >
                <ul className="zenith-sync__list">
                    {shown.map((group) => (
                        <HistoryRow key={group.id} group={group} onUndo={undo} />
                    ))}
                </ul>
            </SyncSection>
        </div>
    );
};

/**
 * One run of identical journal lines.
 *
 * The count is set beside the kind rather than after the keys, because "sent
 * ×6" is one fact about one setting and "sent · dashboardBgSource ×6" reads as
 * six settings.
 */
const HistoryRow: React.FC<{
    group: HistoryGroup;
    onUndo: (entry: JournalEntry) => void | Promise<void>;
}> = ({ group, onUndo }) => {
    const t = useTranslation();

    return (
        <li className={`zenith-sync__event is-${group.kind}`}>
            <span className="zenith-sync__eventKind">
                {t(`sync.history.${group.kind}`, { count: group.keys.length })}
                {group.count > 1 && (
                    <span className="zenith-sync__repeat">
                        {t('sync.history.repeat', { count: String(group.count) })}
                    </span>
                )}
            </span>
            <span className="zenith-sync__eventKeys">
                {group.keys.slice(0, 3).join(', ')}
                {group.keys.length > 3 ? ` +${group.keys.length - 3}` : ''}
            </span>
            <span className="zenith-sync__peerMeta">{relative(t, group.at)}</span>
            {/* Only an entry that recorded the previous values can be undone —
                a publish changed nothing that was not already this device's
                own choice. */}
            {group.undoable && (
                <button
                    type="button"
                    className="zenith-sync__undo"
                    onClick={() => void onUndo(group.latest)}
                    title={t('sync.undo')}
                >
                    <Undo2 size={13} />
                </button>
            )}
        </li>
    );
};
