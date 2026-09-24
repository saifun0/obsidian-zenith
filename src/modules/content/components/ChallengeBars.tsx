import React, { useMemo, type CSSProperties, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { useZenithStore } from '../../../store';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { challengeProgress, type ChallengeProgress } from '../services/challenge';

/** The goals set for this year, with how each is going. Empty when none is set. */
export function useChallenge(): ChallengeProgress[] {
    const items = useZenithStore((s) => s.contentItems);
    const goals = useZenithStore((s) => s.settings.contentChallenges);
    const rereads = useZenithStore((s) => s.settings.contentChallengeRereads);
    const today = getTodayString();
    return useMemo(
        () => challengeProgress(items, goals, today, rereads),
        [items, goals, today, rereads]
    );
}

/**
 * One bar per goal: how many of how many, and whether the pace keeps up —
 * said in whole items, since half a book behind is not behind.
 */
export const ChallengeBars: FC<{ progress: ChallengeProgress[]; compact?: boolean }> = ({
    progress,
    compact,
}) => {
    const t = useTranslation();
    const saved = useZenithStore((s) => s.settings.contentTypes);
    const types = useMemo(() => effectiveContentTypes(saved), [saved]);

    return (
        <div className={`zenith-challenge ${compact ? 'is-compact' : ''}`}>
            {progress.map((p) => {
                const type = resolveContentType(types, p.typeId);
                const fraction = Math.min(1, p.done / p.target);
                const behind = Math.max(0, Math.round(-p.pace.delta));
                const ahead = Math.max(0, Math.round(p.pace.delta));
                const status =
                    p.pace.status === 'done'
                        ? t('content.challenge.done')
                        : p.pace.status === 'ahead'
                          ? t('content.challenge.ahead', { count: ahead })
                          : p.pace.status === 'behind'
                            ? t('content.challenge.behind', { count: behind })
                            : t('content.challenge.onTrack');
                return (
                    <div
                        key={p.typeId}
                        className={`zenith-challenge__row is-${p.pace.status}`}
                        style={{ '--challenge-color': type.color } as CSSProperties}
                    >
                        <span className="zenith-challenge__head">
                            <ObsidianIcon name={type.icon} size={13} />
                            <span className="zenith-challenge__label">
                                {t('content.challenge.label', { type: type.label, year: p.year })}
                            </span>
                            <span className="zenith-challenge__count">
                                {p.done}/{p.target}
                            </span>
                        </span>
                        <span className="zenith-challenge__bar" aria-hidden="true">
                            <span style={{ width: `${fraction * 100}%` }} />
                        </span>
                        <span className="zenith-challenge__status">{status}</span>
                    </div>
                );
            })}
        </div>
    );
};
