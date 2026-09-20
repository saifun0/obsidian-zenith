import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownToLine,
    ArrowLeft,
    ArrowUpFromLine,
    Check,
    RefreshCw,
    X,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { relativeTime } from '../relativeTime';
import { countLine, progressRatio } from '../progressFormat';
import {
    ACTIONABLE_DECISIONS,
    DESTRUCTIVE_DECISIONS,
    type ForceDirection,
    type SyncPlan,
} from '../fileSyncTypes';
import type { FileSyncStatus } from '../services/fileSync';

/**
 * Vault sync, in the four lines it usually needs.
 *
 * This replaces a workspace tab. The tab was the wrong shape for the job in
 * exactly the way `PrayerModal` describes: it is opened to answer one question
 * — is my vault up to date, and if not, make it so — and then closed. A tab
 * turned that into a place to navigate to and back from, and it stayed in the
 * workspace afterwards being a page about nothing.
 *
 * So: when it last ran, one button to run it, and two to overrule it. Devices,
 * history and collisions stayed behind in settings, where they belong — they
 * answer "what happened", which is a question people ask sitting down.
 *
 * ── The second screen ──
 *
 * A forced overwrite comes back as a plan that must not run unreviewed, and so
 * does an ordinary run that trips a safety rail. That review used to live in
 * the tab. Rather than sending the user somewhere else to finish what they
 * started here, the modal turns into the review: same dialog, second face,
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

export const SyncQuickApp: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const service = plugin.fileSync;
    const auto = plugin.fileSyncAuto;

    const [status, setStatus] = useState<FileSyncStatus | null>(service?.getStatus() ?? null);
    /**
     * Which button produced the plan on screen, when one did.
     *
     * The plan itself cannot say: `forced_overwrite` records that a direction
     * was forced, not which one, and the engine has no reason to care. The
     * heading on the review screen does.
     */
    const [forced, setForced] = useState<ForceDirection | null>(null);

    useEffect(() => {
        if (!service) return;
        service.refresh();
        setStatus(service.getStatus());
        return service.subscribe(setStatus);
    }, [service]);

    if (!service || !status) return null;

    const plan = status.plan;
    const busy = status.running;

    // A plan on the status is a plan waiting to be decided — whether this
    // dialog asked for it or the scheduler left it there an hour ago.
    if (plan) {
        return (
            <PlanConfirm
                plan={plan}
                forced={forced}
                onBack={() => {
                    service.discard();
                    setForced(null);
                }}
                // Started, not awaited, and the dialog closes on top of it. A
                // real run takes minutes, and `SyncProgressNotice` exists to
                // follow the user out of here — holding the modal open until
                // it finished would pin them to a dialog showing nothing.
                onConfirm={() => {
                    setForced(null);
                    void service.apply(plan, true);
                    onClose();
                }}
            />
        );
    }

    const force = (direction: ForceDirection) => {
        setForced(direction);
        void service.forcePreview(direction);
    };

    return (
        <div className="zenith-syncq">
            <p className="zenith-syncq__when">
                {t('sync.quick.lastRun')}
                <strong>{relativeTime(t, status.lastRunAt)}</strong>
            </p>

            {!status.configured ? (
                <p className="zenith-syncq__hint">{t('sync.files.notConfigured')}</p>
            ) : (
                <>
                    <button
                        type="button"
                        className="zenith-syncq__go"
                        onClick={() => void auto?.run(true)}
                        disabled={busy}
                    >
                        <RefreshCw size={16} className={busy ? 'is-spinning' : undefined} />
                        {t('sync.files.syncNow')}
                    </button>

                    <div className="zenith-syncq__pair">
                        <button
                            type="button"
                            className="zenith-syncq__side"
                            onClick={() => force('push')}
                            disabled={busy}
                            title={t('sync.files.force.push.hint')}
                        >
                            <ArrowUpFromLine size={14} />
                            {t('sync.files.force.push')}
                        </button>
                        <button
                            type="button"
                            className="zenith-syncq__side"
                            onClick={() => force('pull')}
                            disabled={busy}
                            title={t('sync.files.force.pull.hint')}
                        >
                            <ArrowDownToLine size={14} />
                            {t('sync.files.force.pull')}
                        </button>
                    </div>
                </>
            )}

            {busy && status.progress && (
                <div className="zenith-syncq__progress">
                    <div className="zenith-syncq__bar">
                        <div
                            className="zenith-syncq__barFill"
                            style={{ width: `${Math.round(progressRatio(status.progress) * 100)}%` }}
                        />
                    </div>
                    <span className="zenith-syncq__meta">{countLine(status.progress)}</span>
                </div>
            )}

            {status.error && (
                <p className="zenith-syncq__error">
                    <AlertTriangle size={14} />
                    <span>{status.error}</span>
                </p>
            )}
        </div>
    );
};

/**
 * What this plan would do, and the two ways out of it.
 *
 * `Confirm` is deliberately not the button the eye lands on first. The user
 * arrived here by pressing something already; the job of this screen is to
 * give them somewhere to stop.
 */
const PlanConfirm: React.FC<{
    plan: SyncPlan;
    forced: ForceDirection | null;
    onBack: () => void;
    onConfirm: () => void | Promise<void>;
}> = ({ plan, forced, onBack, onConfirm }) => {
    const t = useTranslation();

    const deletions = plan.items.filter((i) => DESTRUCTIVE_DECISIONS.has(i.decision));
    const moves = plan.stats.push + plan.stats.pull + plan.stats.conflict;
    const hiddenDeletions = Math.max(0, deletions.length - MAX_DELETIONS);

    const heading = forced
        ? t(`sync.files.force.${forced}`)
        : t(`sync.quick.review.${plan.blocked?.kind ?? 'forced_overwrite'}`);

    return (
        <div className="zenith-syncq">
            <button type="button" className="zenith-syncq__back" onClick={onBack}>
                <ArrowLeft size={14} />
                {heading}
            </button>

            <p className="zenith-syncq__counts">
                {moves > 0 && (
                    <span>{t('sync.quick.willMove', { count: String(moves) })}</span>
                )}
                {deletions.length > 0 && (
                    <span className="is-danger">
                        {t('sync.quick.willDelete', { count: String(deletions.length) })}
                    </span>
                )}
            </p>

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
                    <ul className="zenith-syncq__rows">
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
                    className="zenith-syncq__confirm"
                    onClick={() => void onConfirm()}
                >
                    <Check size={14} />
                    {t('sync.quick.confirm')}
                </button>
            </div>
        </div>
    );
};
