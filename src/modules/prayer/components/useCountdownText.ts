import { useCallback, useMemo } from 'react';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { useZenithStore } from '../../../store';
import { fastCountdown, fastsByDate } from '../fasting';
import { formatCountdown, type NextPrayer } from '../prayerTimes';

/**
 * How long until the next prayer, in words — and on a fasting day, what that
 * wait is for: "until iftar" before maghrib, "suhoor ends in" before fajr.
 * One place, so the widget, the full view and the note block never disagree
 * about which day is a fast.
 */
export function useCountdownText(today: string): (next: NextPrayer) => string {
    const t = useTranslation();
    const on = useFeature('prayer.iftarSuhoor');
    const entries = useZenithStore((s) => s.journalEntries);
    const offset = useZenithStore((s) => s.settings.prayerHijriOffset);
    const imsak = useZenithStore((s) => s.settings.prayerImsakOffset);
    const fasts = useMemo(() => fastsByDate(entries), [entries]);

    return useCallback(
        (next: NextPrayer) => {
            const fast = on ? fastCountdown(next, today, fasts, offset, imsak) : null;
            const time = formatCountdown(
                fast ? fast.minutesAway : next.minutesAway,
                t('common.hourShort'),
                t('common.minShort')
            );
            return fast ? t(`prayer.${fast.moment}In`, { time }) : t('prayer.in', { time });
        },
        [on, today, fasts, offset, imsak, t]
    );
}
