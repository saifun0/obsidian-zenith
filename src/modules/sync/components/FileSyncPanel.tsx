import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, PlugZap, RotateCcw, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { RemoteAuthPanel } from './RemoteAuthPanel';
import { countLine, progressRatio, rateLine } from '../progressFormat';
import type { FileSyncStatus } from '../services/fileSync';
import type { SyncProgress, SyncRunResult } from '../services/SyncEngine';
import {
    ACTIONABLE_DECISIONS,
    type SyncDecision,
    type SyncPlan,
    type SyncPlanItem,
} from '../fileSyncTypes';

/**
 * The file engine's face: test the server, look at what a run would do, then
 * decide.
 *
 * Preview is the primary action rather than "sync now", and that ordering is the
 * whole design. This engine deletes files; a button that starts moving them
 * before the user has seen the list would make every safety rail behind it
 * decorative.
 */

/** How many rows to draw before collapsing the rest into a count. */
const MAX_ROWS = 200;

/** Rows that would change something, worst-first so deletions are read first. */
const DECISION_ORDER: SyncDecision[] = [
    'remote_is_deleted_thus_also_delete_local',
    'local_is_deleted_thus_also_delete_remote',
    'conflict_created_then_keep_local',
    'conflict_created_then_keep_remote',
    'conflict_created_then_keep_both',
    'remote_is_modified_then_pull',
    'remote_is_created_then_pull',
    'local_is_modified_then_push',
    'local_is_created_then_push',
];

function severity(decision: SyncDecision): 'danger' | 'warn' | 'plain' {
    if (decision.includes('delete')) return 'danger';
    if (decision.startsWith('conflict')) return 'warn';
    return 'plain';
}

function actionableRows(plan: SyncPlan): SyncPlanItem[] {
    const rank = new Map(DECISION_ORDER.map((d, i) => [d, i]));
    return plan.items
        .filter((i) => ACTIONABLE_DECISIONS.has(i.decision))
        .sort((a, b) => {
            const byRank = (rank.get(a.decision) ?? 99) - (rank.get(b.decision) ?? 99);
            return byRank !== 0 ? byRank : a.key.localeCompare(b.key);
        });
}

function blockedMessage(t: Translator, plan: SyncPlan): string {
    const b = plan.blocked;
    if (!b) return '';
    return t(`sync.files.blocked.${b.kind}`, {
        actionable: String(b.actionable ?? 0),
        known: String(b.known ?? 0),
        limit: String(Math.round((b.limit ?? 0) * 100)),
    });
}

export const FileSyncPanel: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.fileSync;
    const filesEnabled = useZenithStore((s) => s.settings.syncFilesEnabled);

    const remoteKind = useZenithStore((s) => s.settings.syncRemoteKind);
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
        <section className="zenith-sync__card">
            <h3 className="zenith-sync__cardTitle">{t('sync.files.title')}</h3>

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
                    <div className="zenith-sync__actions">
                        <button
                            type="button"
                            className="zenith-sync__btn"
                            onClick={() => void test()}
                            disabled={busy}
                        >
                            <PlugZap size={14} />
                            {t('sync.files.test')}
                        </button>
                        <button
                            type="button"
                            className="zenith-sync__btn is-primary"
                            onClick={() => void service.preview()}
                            disabled={busy}
                        >
                            <Eye size={14} />
                            {t('sync.files.preview')}
                        </button>
                        <button
                            type="button"
                            className="zenith-sync__btn"
                            onClick={() => void forget()}
                            disabled={busy}
                        >
                            <RotateCcw size={14} />
                            {t('sync.files.forget')}
                        </button>
                    </div>

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

                    {plan && <PlanReview plan={plan} />}

                    {!plan && status.lastResult && <RunReport result={status.lastResult} />}
                </>
            )}
        </section>
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
            <span className="zenith-sync__progressFile">{progress.key}</span>
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

const PlanReview: React.FC<{ plan: SyncPlan }> = ({ plan }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.fileSync;

    const rows = actionableRows(plan);
    const hidden = Math.max(0, rows.length - MAX_ROWS);

    if (plan.actionable === 0) {
        return (
            <p className="zenith-sync__hint">
                <Check size={14} /> {t('sync.files.nothing')}
            </p>
        );
    }

    return (
        <div className="zenith-sync__plan">
            <p className="zenith-sync__meta">
                {t('sync.files.summary', {
                    push: String(plan.stats.push),
                    pull: String(plan.stats.pull),
                    deleteLocal: String(plan.stats.deleteLocal),
                    deleteRemote: String(plan.stats.deleteRemote),
                    conflict: String(plan.stats.conflict),
                })}
                {plan.stats.skipped > 0 && (
                    <> · {t('sync.files.skipped', { count: String(plan.stats.skipped) })}</>
                )}
            </p>

            {plan.blocked && (
                <p className="zenith-sync__error">
                    <AlertTriangle size={14} />
                    <span>{blockedMessage(t, plan)}</span>
                </p>
            )}

            <ul className="zenith-sync__planList">
                {rows.slice(0, MAX_ROWS).map((item) => (
                    <li
                        key={item.key}
                        className={`zenith-sync__planRow is-${severity(item.decision)}`}
                    >
                        <span className="zenith-sync__planAction">
                            {t(`sync.decision.${item.decision}`)}
                        </span>
                        <span className="zenith-sync__planKey">{item.key}</span>
                        <span className="zenith-sync__peerMeta">{item.reason}</span>
                    </li>
                ))}
            </ul>

            {hidden > 0 && (
                <p className="zenith-sync__hint">
                    {t('sync.files.more', { count: String(hidden) })}
                </p>
            )}

            <div className="zenith-sync__actions">
                <button
                    type="button"
                    className={`zenith-sync__btn ${plan.blocked ? 'is-danger' : 'is-primary'}`}
                    onClick={() => void service?.apply(plan, !!plan.blocked)}
                >
                    <Check size={14} />
                    {plan.blocked ? t('sync.files.applyAnyway') : t('sync.files.apply')}
                </button>
                <button
                    type="button"
                    className="zenith-sync__btn"
                    onClick={() => service?.discard()}
                >
                    <X size={14} />
                    {t('sync.files.discard')}
                </button>
            </div>
        </div>
    );
};
