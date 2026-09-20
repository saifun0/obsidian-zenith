import React, { useEffect, useState } from 'react';
import { AlertTriangle, PlugZap, RotateCcw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { RemoteAuthPanel } from './RemoteAuthPanel';
import { SyncSection } from './SyncSection';
import { countLine, progressRatio, rateLine } from '../progressFormat';
import type { FileSyncStatus } from '../services/fileSync';
import type { SyncProgress, SyncRunResult } from '../services/SyncEngine';

/**
 * What the file engine has been doing, in settings.
 *
 * Deliberately not where anything is started any more. This page went through
 * being a three-press workflow (test, preview, apply) and then a page with one
 * obvious button on it; both were wrong in the same way, which is that a
 * settings page is somewhere you arrive to configure a thing and read about
 * it, not somewhere you stand while several hundred files move.
 *
 * So the doing left for the ribbon's dialog — sync now, force a direction,
 * confirm a plan — and what stayed is the reading: whether it is connected,
 * what it does unattended, how the last run went, and the error if there was
 * one. Test and Forget stayed too, because they answer "why is this not
 * working" and "start over", which are questions asked here and rarely.
 */

export const FileSyncPanel: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.fileSync;
    const filesEnabled = useZenithStore((s) => s.settings.syncFilesEnabled);

    const remoteKind = useZenithStore((s) => s.settings.syncRemoteKind);
    const autoOn = useZenithStore((s) => s.settings.syncFilesAuto);
    const everyMinutes = useZenithStore((s) => s.settings.syncFilesIntervalMinutes);
    const [status, setStatus] = useState<FileSyncStatus | null>(service?.getStatus() ?? null);
    const [note, setNote] = useState<string | null>(null);

    useEffect(() => {
        if (!service) return;
        service.refresh();
        setStatus(service.getStatus());
        return service.subscribe(setStatus);
    }, [service, filesEnabled]);

    if (!service || !status) return null;

    const plan = status.plan;
    const busy = status.running;

    const test = async () => {
        setNote(null);
        const result = await service.checkConnection();
        setNote(result.ok ? t('sync.files.testOk') : (result.error ?? ''));
    };

    const forget = async () => {
        await service.forgetHistory();
        setNote(t('sync.files.forgetDone'));
    };

    return (
        <SyncSection title={t('sync.files.title')}>
            {/* The OAuth backends need a connection before anything else can
                be true of them, so the authorization step comes first and the
                rest of the panel waits for it. */}
            {filesEnabled && (remoteKind === 'dropbox' || remoteKind === 'onedrive') && (
                <RemoteAuthPanel provider={remoteKind} />
            )}

            {!filesEnabled ? (
                <p className="zenith-sync__hint">{t('sync.files.off')}</p>
            ) : !status.configured ? (
                <p className="zenith-sync__hint">{t('sync.files.notConfigured')}</p>
            ) : (
                <>
                    {/* What it does when nobody is here. Said on the page as
                        well as in settings: this is where somebody comes to
                        find out whether their vault is being looked after, and
                        "there is a button" is not an answer to that. */}
                    <p className="zenith-sync__meta">
                        {autoOn
                            ? t('sync.files.autoOn', { minutes: String(everyMinutes) })
                            : t('sync.files.autoOff')}
                    </p>

                    {note && <p className="zenith-sync__hint">{note}</p>}

                    {status.error && (
                        <p className="zenith-sync__error">
                            <AlertTriangle size={14} />
                            <span>{status.error}</span>
                        </p>
                    )}

                    {busy &&
                        (status.progress ? (
                            <SyncProgressBar progress={status.progress} />
                        ) : (
                            <p className="zenith-sync__hint">{t('sync.files.working')}</p>
                        ))}

                    {!plan && status.lastResult && <RunReport result={status.lastResult} />}

                    {/* The two questions that are not steps: why is this not
                        working, and can I start over. Set apart at the foot of
                        the card, and set at two different weights — testing the
                        connection is something you do while setting a server
                        up, forgetting the history is something you do once a
                        year and regret more often than that. */}
                    <div className="zenith-sync__footActions">
                        <button
                            type="button"
                            className="zenith-sync__btn"
                            onClick={() => void test()}
                            disabled={busy}
                        >
                            <PlugZap size={13} />
                            {t('sync.files.test')}
                        </button>
                        <button
                            type="button"
                            className="zenith-sync__quietBtn"
                            onClick={() => void forget()}
                            disabled={busy}
                        >
                            <RotateCcw size={13} />
                            {t('sync.files.forget')}
                        </button>
                    </div>
                </>
            )}
        </SyncSection>
    );
};

/**
 * The run, on the page it was started from.
 *
 * The same numbers the notice carries — see `SyncProgressNotice`, which is
 * where they follow the user once they leave this tab. Both read
 * `progressFormat`, so a rate never differs between the two places it is shown.
 *
 * The clock is its own state rather than the progress object's: between two
 * files of a slow transfer nothing re-renders, and a rate that only updates
 * when a file lands reads as a stalled one.
 */
const SyncProgressBar: React.FC<{ progress: SyncProgress }> = ({ progress }) => {
    const t = useTranslation();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(timer);
    }, []);

    const percent = Math.round(progressRatio(progress) * 100);

    return (
        <div
            className="zenith-sync__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
        >
            <div className="zenith-sync__progressHead">
                <span>{countLine(progress)}</span>
                <span className="zenith-sync__peerMeta">{rateLine(progress, now, t)}</span>
            </div>
            <div className="zenith-sync__bar">
                <div className="zenith-sync__barFill" style={{ width: `${percent}%` }} />
            </div>
            <span className="zenith-sync__progressFile">
                <bdi>{progress.key}</bdi>
            </span>
        </div>
    );
};

/**
 * What the finished run actually did.
 *
 * The merge counts matter more than they look: the plan could only promise to
 * ATTEMPT a reconciliation, because it had metadata and not contents. This is
 * where the user learns which notes came back as one and which were left as two
 * copies waiting for them.
 */
const RunReport: React.FC<{ result: SyncRunResult }> = ({ result }) => {
    const t = useTranslation();
    const merged = result.merges.filter((m) => m.outcome === 'merged').length;
    const keptBoth = result.merges.filter((m) => m.outcome === 'kept_both');

    return (
        <>
            <p className="zenith-sync__meta">
                {t('sync.files.lastRun')}:{' '}
                {t('sync.files.applied', { count: String(result.applied) })}
                {merged > 0 && <> · {t('sync.files.merged', { count: String(merged) })}</>}
                {keptBoth.length > 0 && (
                    <> · {t('sync.files.keptBoth', { count: String(keptBoth.length) })}</>
                )}
                {result.failed.length > 0 && (
                    <> · {t('sync.files.failedCount', { count: String(result.failed.length) })}</>
                )}
            </p>

            {/* Named individually: "three kept as two copies" is a number, but
                the user has to open those three files to finish the job. */}
            {keptBoth.length > 0 && (
                <ul className="zenith-sync__list">
                    {keptBoth.slice(0, 10).map((m) => (
                        <li key={m.key} className="zenith-sync__conflict">
                            <code className="zenith-sync__key">{m.key}</code>
                            <span className="zenith-sync__peerMeta">
                                {t(`inbox.unmergeable.${m.reason ?? 'prose_diverged'}`)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {result.failed.length > 0 && (
                <ul className="zenith-sync__list">
                    {result.failed.slice(0, 10).map((f) => (
                        <li key={f.key} className="zenith-sync__conflict">
                            <code className="zenith-sync__key">{f.key}</code>
                            <span className="zenith-sync__peerMeta">{f.error}</span>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
};
