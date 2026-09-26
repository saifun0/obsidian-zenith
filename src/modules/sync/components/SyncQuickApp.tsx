import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowLeft,
    ArrowUpFromLine,
    Check,
    CheckCircle2,
    ChevronRight,
    Cloud,
    CloudOff,
    Download,
    GitCompareArrows,
    RefreshCw,
    Settings2,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { openZenithSettings } from '../../../settings/openSettings';
import { SettingRow, Toggle } from '../../../settings/controls';
import { relativeTime } from '../relativeTime';
import { countLine, formatBytes, progressRatio, rateLine } from '../progressFormat';
import {
    ACTIONABLE_DECISIONS,
    DESTRUCTIVE_DECISIONS,
    type ForceDirection,
    type SyncPlan,
} from '../fileSyncTypes';
import type { FileSyncStatus } from '../services/fileSync';
import type { SyncStatus } from '../services/settingsSync';

/**
 * Vault sync, over whatever you were doing.
 *
 * Opened to answer one question — is this vault up to date, and if not, make
 * it so — and closed again. So the first thing it says is the answer, in one
 * line with a colour: in sync, syncing, something went wrong, not set up. Under
 * it, what the last run did and what the server holds; then the one button
 * that acts, and the one switch people reach for here, automatic sync.
 *
 * Everything else is one tap further, under "More": looking at what a run
 * would change before it runs, the two forced overwrites, and the way to the
 * full settings. The overwrites were two red buttons on the front before, the
 * most striking thing in a dialog whose usual job is to say "all is well".
 *
 * ── The second screen ──
 *
 * A forced overwrite comes back as a plan that must not run unreviewed, and so
 * does an ordinary run that trips a safety rail, and so does "What would
 * change". Rather than sending the user somewhere else to finish what they
 * started here, the dialog turns into the review: same dialog, second face,
 * back arrow to change your mind.
 *
 * What it shows is chosen rather than complete. Every deletion is listed by
 * name, because a deletion is the only thing here that cannot be undone by
 * running it again; transfers are counted, because four hundred filenames is
 * not a list anybody reads and printing it would bury the seven that matter.
 */

/** Deletions are listed; past this many, the tail is counted instead. */
const MAX_DELETIONS = 60;

/** And the same ceiling for the full list, once it is asked for. */
const MAX_ROWS = 300;

/** What produced the plan on the review screen, when this dialog did. */
type Review = ForceDirection | 'preview';

type Tone = 'ok' | 'busy' | 'warn' | 'error' | 'idle';

export const SyncQuickApp: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.fileSync;
    const auto = plugin.fileSyncAuto;
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [status, setStatus] = useState<FileSyncStatus | null>(service?.getStatus() ?? null);
    const [devices, setDevices] = useState<SyncStatus | null>(
        plugin.settingsSync?.getStatus() ?? null
    );
    /**
     * Which button produced the plan on screen, when one did. The plan itself
     * cannot say: `forced_overwrite` records that a direction was forced, not
     * which one, and a plain preview is not blocked at all.
     */
    const [review, setReview] = useState<Review | null>(null);
    // Re-rendered once a minute, so "2 minutes ago" does not stay 2 minutes.
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!service) return;
        service.refresh();
        setStatus(service.getStatus());
        return service.subscribe(setStatus);
    }, [service]);

    useEffect(() => plugin.settingsSync?.subscribe(setDevices), [plugin]);

    useEffect(() => {
        const timer = window.setInterval(() => setTick((n) => n + 1), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    if (!service || !status) return null;

    const plan = status.plan;
    const busy = status.running;

    // A plan on the status is a plan waiting to be decided — whether this
    // dialog asked for it or the scheduler left it there an hour ago. A look
    // that found nothing to do is not one: there is nothing to decide.
    if (plan && plan.actionable > 0) {
        return (
            <PlanConfirm
                plan={plan}
                review={review}
                onBack={() => {
                    service.discard();
                    setReview(null);
                }}
                // Started, not awaited, and the dialog closes on top of it. A
                // real run takes minutes, and `SyncProgressNotice` exists to
                // follow the user out of here.
                onConfirm={() => {
                    setReview(null);
                    void service.apply(plan, true);
                    onClose();
                }}
            />
        );
    }

    const preview = async (direction?: ForceDirection) => {
        setReview(direction ?? 'preview');
        const next = direction ? await service.forcePreview(direction) : await service.preview();
        // Nothing to change: the look itself is the answer, and it is already
        // on the front ("in sync, just now").
        if (next && next.actionable === 0) {
            service.discard();
            setReview(null);
        }
    };

    const openSettings = () => {
        onClose();
        openZenithSettings(plugin, 'sync');
    };

    const state = describe(t, status, settings);
    const last = status.lastRun;

    return (
        <div className="zenith-syncq">
            <div className={`zenith-syncq__hero is-${state.tone}`}>
                <span className="zenith-syncq__heroIcon">{state.icon}</span>
                <span className="zenith-syncq__heroText">
                    <span className="zenith-syncq__heroTitle">{state.title}</span>
                    <span className="zenith-syncq__heroSub">{state.sub}</span>
                </span>
            </div>

            {busy && status.progress && (
                <div className="zenith-syncq__progress">
                    <div className="zenith-syncq__bar">
                        <div
                            className="zenith-syncq__barFill"
                            style={{
                                width: `${Math.round(progressRatio(status.progress) * 100)}%`,
                            }}
                        />
                    </div>
                    <span className="zenith-syncq__meta">
                        <span>{countLine(status.progress)}</span>
                        <span>{rateLine(status.progress, Date.now(), t)}</span>
                    </span>
                </div>
            )}

            {!busy && status.configured && (last || status.remoteBytes !== null) && (
                <div className="zenith-syncq__facts">
                    {last && last.sent > 0 && (
                        <Fact
                            icon={<Upload size={13} />}
                            label={t('sync.quick.sent')}
                            value={last.sent}
                        />
                    )}
                    {last && last.received > 0 && (
                        <Fact
                            icon={<Download size={13} />}
                            label={t('sync.quick.received')}
                            value={last.received}
                        />
                    )}
                    {last && last.deleted > 0 && (
                        <Fact
                            icon={<Trash2 size={13} />}
                            label={t('sync.quick.deleted')}
                            value={last.deleted}
                        />
                    )}
                    {last && last.conflicts > 0 && (
                        <Fact
                            icon={<GitCompareArrows size={13} />}
                            label={t('sync.quick.conflicts')}
                            value={last.conflicts}
                        />
                    )}
                    {status.remoteBytes !== null && (
                        <Fact
                            icon={<Cloud size={13} />}
                            label={t('sync.quick.stored')}
                            value={formatBytes(status.remoteBytes, t)}
                            end
                        />
                    )}
                </div>
            )}

            {status.configured ? (
                <button
                    type="button"
                    className="zenith-syncq__go"
                    onClick={() => void auto?.run(true)}
                    disabled={busy}
                >
                    <RefreshCw size={16} className={busy ? 'is-spinning' : undefined} />
                    {busy
                        ? t('sync.quick.running')
                        : state.tone === 'error' || state.tone === 'warn'
                          ? t('sync.quick.retry')
                          : t('sync.files.syncNow')}
                </button>
            ) : (
                <button type="button" className="zenith-syncq__go" onClick={openSettings}>
                    <Settings2 size={16} />
                    {t('sync.quick.setUp')}
                </button>
            )}

            {status.configured && (
                <div className="zenith-syncq__rows">
                    <SettingRow
                        label={t('sync.quick.auto')}
                        desc={t('sync.quick.auto.desc', {
                            minutes: String(settings.syncFilesIntervalMinutes),
                        })}
                    >
                        <Toggle
                            checked={settings.syncFilesAuto}
                            onChange={(v) => updateSettings({ syncFilesAuto: v })}
                        />
                    </SettingRow>
                    {devices?.enabled && (
                        <SettingRow
                            label={t('sync.quick.devices')}
                            desc={
                                devices.peers.length > 0
                                    ? devices.peers.map((p) => p.name).join(', ')
                                    : t('sync.quick.devices.none')
                            }
                        >
                            <span className="zenith-syncq__count">{devices.peers.length + 1}</span>
                        </SettingRow>
                    )}
                </div>
            )}

            <details className="zenith-syncq__more">
                <summary>
                    <ChevronRight size={14} />
                    {t('sync.quick.more')}
                </summary>
                <div className="zenith-syncq__moreBody">
                    {status.configured && (
                        <>
                            <button
                                type="button"
                                className="zenith-syncq__item"
                                onClick={() => void preview()}
                                disabled={busy}
                            >
                                <GitCompareArrows size={15} />
                                <span>
                                    <b>{t('sync.quick.preview')}</b>
                                    <small>{t('sync.quick.preview.desc')}</small>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="zenith-syncq__item is-danger"
                                onClick={() => void preview('push')}
                                disabled={busy}
                            >
                                <ArrowUpFromLine size={15} />
                                <span>
                                    <b>{t('sync.files.force.push')}</b>
                                    <small>{t('sync.files.force.push.hint')}</small>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="zenith-syncq__item is-danger"
                                onClick={() => void preview('pull')}
                                disabled={busy}
                            >
                                <ArrowDownToLine size={15} />
                                <span>
                                    <b>{t('sync.files.force.pull')}</b>
                                    <small>{t('sync.files.force.pull.hint')}</small>
                                </span>
                            </button>
                        </>
                    )}
                    <button type="button" className="zenith-syncq__item" onClick={openSettings}>
                        <Settings2 size={15} />
                        <span>
                            <b>{t('sync.quick.settings')}</b>
                        </span>
                    </button>
                </div>
            </details>
        </div>
    );
};

const Fact: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: number | string;
    end?: boolean;
}> = ({ icon, label, value, end }) => (
    <span className={`zenith-syncq__fact${end ? ' is-end' : ''}`} title={label}>
        {icon}
        <span className="zenith-syncq__factLabel">{label}</span>
        <b>{value}</b>
    </span>
);

/** The one line the dialog opens with: the answer, its colour and its icon. */
function describe(
    t: Translator,
    status: FileSyncStatus,
    settings: ZenithSettings
): { tone: Tone; icon: React.ReactNode; title: string; sub: string } {
    const where = remoteName(settings);
    if (!status.configured) {
        return {
            tone: 'idle',
            icon: <CloudOff size={20} />,
            title: t('sync.quick.state.off'),
            sub: t('sync.quick.state.off.sub'),
        };
    }
    if (status.running) {
        return {
            tone: 'busy',
            icon: <RefreshCw size={20} className="is-spinning" />,
            title: t('sync.quick.state.busy'),
            sub: status.progress ? where : t('sync.quick.state.comparing'),
        };
    }
    if (status.error) {
        return {
            tone: 'error',
            icon: <AlertTriangle size={20} />,
            title: t('sync.quick.state.error'),
            sub: status.error,
        };
    }
    const failed = status.lastRun?.failed ?? 0;
    if (failed > 0 && status.lastRunAt > status.checkedAt) {
        return {
            tone: 'warn',
            icon: <AlertTriangle size={20} />,
            title: t('sync.quick.state.partial'),
            sub: t('sync.quick.state.partial.sub', { count: String(failed) }),
        };
    }
    const when = Math.max(status.lastRunAt, status.checkedAt);
    if (!when) {
        return {
            tone: 'idle',
            icon: <Cloud size={20} />,
            title: t('sync.quick.state.never'),
            sub: where,
        };
    }
    return {
        tone: 'ok',
        icon: <CheckCircle2 size={20} />,
        title: t('sync.quick.state.ok'),
        sub: `${relativeTime(t, when)} · ${where}`,
    };
}

/** The server, as its owner would name it. */
function remoteName(s: ZenithSettings): string {
    if (s.syncRemoteKind === 'dropbox') return 'Dropbox';
    if (s.syncRemoteKind === 'onedrive') return 'OneDrive';
    if (s.syncRemoteKind === 's3')
        return s.syncS3Bucket.trim() ? `S3 · ${s.syncS3Bucket.trim()}` : 'S3';
    try {
        return `WebDAV · ${new URL(s.syncRemoteUrl.trim()).host}`;
    } catch {
        return 'WebDAV';
    }
}

/**
 * What this plan would do, and the two ways out of it.
 *
 * `Confirm` is deliberately not the button the eye lands on first when it
 * would remove anything: the user arrived here by pressing something already,
 * and the job of this screen is to give them somewhere to stop.
 */
const PlanConfirm: React.FC<{
    plan: SyncPlan;
    review: Review | null;
    onBack: () => void;
    onConfirm: () => void | Promise<void>;
}> = ({ plan, review, onBack, onConfirm }) => {
    const t = useTranslation();

    const deletions = plan.items.filter((i) => DESTRUCTIVE_DECISIONS.has(i.decision));
    const hiddenDeletions = Math.max(0, deletions.length - MAX_DELETIONS);
    const moves = plan.actionable - deletions.length;
    const risky = deletions.length > 0 || (review !== null && review !== 'preview');

    const heading =
        review === 'push' || review === 'pull'
            ? t(`sync.files.force.${review}`)
            : plan.blocked
              ? t(`sync.quick.review.${plan.blocked.kind}`)
              : t('sync.quick.review.preview');

    const counts: Array<[React.ReactNode, string, number, boolean?]> = [
        [<Upload key="u" size={13} />, t('sync.quick.sent'), plan.stats.push],
        [<Download key="d" size={13} />, t('sync.quick.received'), plan.stats.pull],
        [<GitCompareArrows key="c" size={13} />, t('sync.quick.conflicts'), plan.stats.conflict],
        [
            <Trash2 key="x" size={13} />,
            t('sync.quick.deleted'),
            plan.stats.deleteLocal + plan.stats.deleteRemote,
            true,
        ],
    ];

    return (
        <div className="zenith-syncq">
            <button type="button" className="zenith-syncq__back" onClick={onBack}>
                <ArrowLeft size={14} />
                {heading}
            </button>

            <div className="zenith-syncq__facts">
                {counts
                    .filter(([, , n]) => n > 0)
                    .map(([icon, label, n, danger]) => (
                        <span
                            key={label}
                            className={`zenith-syncq__fact${danger ? ' is-danger' : ''}`}
                            title={label}
                        >
                            {icon}
                            <span className="zenith-syncq__factLabel">{label}</span>
                            <b>{n}</b>
                        </span>
                    ))}
            </div>

            {/* Named one by one. A transfer that turns out wrong is fixed by
                syncing again; a deletion is not, and the names are the only
                way to notice that the wrong side is about to win. */}
            {deletions.length > 0 && (
                <ul className="zenith-syncq__deletions">
                    {deletions.slice(0, MAX_DELETIONS).map((item) => (
                        <li key={item.key}>
                            <X size={12} />
                            <span>{item.key}</span>
                        </li>
                    ))}
                    {hiddenDeletions > 0 && (
                        <li className="is-more">
                            {t('sync.files.more', { count: String(hiddenDeletions) })}
                        </li>
                    )}
                </ul>
            )}

            {deletions.length === 0 && (
                <p className="zenith-syncq__hint">{t('sync.quick.noDeletions')}</p>
            )}

            {/* Everything, for whoever wants it. Counted by default and
                enumerated on request: the summary answers "is this roughly
                what I meant", and only a plan that fails that question is
                worth reading line by line. */}
            {moves > 0 && (
                <details className="zenith-syncq__all">
                    <summary>{t('sync.quick.showAll', { count: String(moves) })}</summary>
                    <ul className="zenith-syncq__list">
                        {plan.items
                            .filter((i) => ACTIONABLE_DECISIONS.has(i.decision))
                            .filter((i) => !DESTRUCTIVE_DECISIONS.has(i.decision))
                            .slice(0, MAX_ROWS)
                            .map((item) => (
                                <li key={item.key}>
                                    <span className="zenith-syncq__rowAct">
                                        {t(`sync.decision.${item.decision}`)}
                                    </span>
                                    <span className="zenith-syncq__rowKey">{item.key}</span>
                                </li>
                            ))}
                    </ul>
                </details>
            )}

            <div className="zenith-syncq__decide">
                <button type="button" className="zenith-syncq__cancel" onClick={onBack}>
                    {t('sync.files.discard')}
                </button>
                <button
                    type="button"
                    className={`zenith-syncq__confirm${risky ? ' is-danger' : ''}`}
                    onClick={() => void onConfirm()}
                >
                    <Check size={14} />
                    {risky ? t('sync.quick.confirm') : t('sync.quick.apply')}
                </button>
            </div>
        </div>
    );
};
