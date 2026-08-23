import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { TIME_ICONS, type PrayerId, type PrayerStatus } from '../prayerConfig';
import { formatClock, type PrayerTimeId } from '../prayerTimes';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { PrayerMark, isActionable, markState } from './PrayerMark';

/**
 * A row in the day's list.
 *
 * The three answers are not three identical buttons. One of them — "I prayed
 * it" — is what happens nearly every time, so it is a wide labelled button that
 * also *reports* the current answer; the other two are icons beside it. Giving
 * them all the same weight produced a wall of indistinguishable controls down
 * the page.
 */

interface PrayerRowProps {
    prayer: PrayerId;
    at: number;
    status: PrayerStatus | undefined;
    entered: boolean;
    isNext: boolean;
    /** A day in the future can't be recorded at all. */
    locked: boolean;
    onSet: (prayer: PrayerId, status: PrayerStatus | null) => void;
    /** What a tap on the primary button records when nothing is set yet. */
    tapStatus: PrayerStatus;
}

export const PrayerRow: FC<PrayerRowProps> = ({
    prayer,
    at,
    status,
    entered,
    isNext,
    locked,
    onSet,
    tapStatus,
}) => {
    const t = useTranslation();
    const state = markState(status, entered, Number.isFinite(at));
    const editable = isActionable(state) && !locked;

    // The primary button says what the answer *is*, and only says "mark it"
    // when there isn't one — so the row reads as a statement, not a form.
    const primaryLabel = status ? t(`prayer.status.${status}`) : t('prayer.mark');

    const secondary: Array<{ value: PrayerStatus; icon: string }> = [
        { value: 'late', icon: 'clock' },
        { value: 'missed', icon: 'x' },
    ];

    return (
        <div
            className={`zenith-prayer__row is-${state} ${isNext ? 'is-next' : ''}`}
            data-prayer={prayer}
            // A row you can't act on says so by being quiet. Spelling it out on
            // every one of them put the same sentence down the page three times
            // and made the rows that *do* want an answer harder to find.
            title={editable || state === 'absent' ? undefined : t('prayer.notEntered')}
        >
            <span className="zenith-prayer__row-mark">
                <PrayerMark state={state} size={14} />
            </span>
            <span className="zenith-prayer__row-name">{t(`prayer.${prayer}`)}</span>
            <span className="zenith-prayer__row-time">
                {state === 'absent' ? '—' : formatClock(at, t.locale)}
            </span>

            {editable ? (
                <span className="zenith-prayer__row-actions">
                    <button
                        type="button"
                        className={`zenith-prayer__primary is-${status ?? 'none'}`}
                        onClick={() => onSet(prayer, status ? null : tapStatus)}
                        aria-pressed={!!status}
                    >
                        {primaryLabel}
                    </button>
                    {secondary.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`zenith-prayer__pick is-${option.value} ${
                                status === option.value ? 'is-active' : ''
                            }`}
                            onClick={() =>
                                onSet(prayer, status === option.value ? null : option.value)
                            }
                            title={t(`prayer.status.${option.value}`)}
                            aria-label={`${t(`prayer.${prayer}`)} — ${t(`prayer.status.${option.value}`)}`}
                            aria-pressed={status === option.value}
                        >
                            <DynamicIcon name={option.icon} size={14} />
                        </button>
                    ))}
                </span>
            ) : (
                // "No time at all" is news — a polar day where fajr never
                // arrives. "Not yet" isn't, and the row's own weight says it.
                state === 'absent' && (
                    <span className="zenith-prayer__row-passive">{t('prayer.absent')}</span>
                )
            )}
        </div>
    );
};

/**
 * Sunrise, midnight, the last third: times that mark a boundary but are not
 * prayers. Same line, no controls, and half the height — the icon and the
 * lighter weight are what keep sunrise from reading as a sixth obligation, so
 * the explanation can live in the tooltip instead of a third column.
 */
export const PrayerMarkerRow: FC<{ id: PrayerTimeId; at: number; noteKey: string }> = ({
    id,
    at,
    noteKey,
}) => {
    const t = useTranslation();
    return (
        <div className="zenith-prayer__row is-marker" data-prayer={id} title={t(noteKey)}>
            <span className="zenith-prayer__row-mark">
                <DynamicIcon name={TIME_ICONS[id]} size={13} />
            </span>
            <span className="zenith-prayer__row-name">{t(`prayer.${id}`)}</span>
            <span className="zenith-prayer__row-time">{formatClock(at, t.locale)}</span>
        </div>
    );
};
