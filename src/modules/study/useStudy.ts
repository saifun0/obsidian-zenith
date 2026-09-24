import { useMemo } from 'react';
import { useZenithStore } from '../../store';
import { useNow } from '../../core/useNow';
import { toLocalIsoDate } from '../../core/dateUtils';
import type { Translator } from '../../core/i18n';
import type { ZenithSettings } from '../../store/settingsSlice';
import { normalizeSchedule, type StudySchedule } from './studyModel';
import type { StudyOptions } from './studyTime';

/** The timetable as settings hold it, cleaned once per change. */
export function useStudySchedule(): StudySchedule {
    const raw = useZenithStore((s) => s.settings.studySchedule);
    return useMemo(() => normalizeSchedule(raw), [raw]);
}

export function studyOptions(settings: ZenithSettings): StudyOptions {
    return {
        twoWeeks: settings.studyTwoWeeks,
        anchor: settings.studyWeekAnchor,
        subgroup: settings.studySubgroup,
        termStart: settings.studyTermStart,
        termEnd: settings.studyTermEnd,
    };
}

export function useStudyOptions(): StudyOptions {
    const twoWeeks = useZenithStore((s) => s.settings.studyTwoWeeks);
    const anchor = useZenithStore((s) => s.settings.studyWeekAnchor);
    const subgroup = useZenithStore((s) => s.settings.studySubgroup);
    const termStart = useZenithStore((s) => s.settings.studyTermStart);
    const termEnd = useZenithStore((s) => s.settings.studyTermEnd);
    return useMemo(
        () => ({ twoWeeks, anchor, subgroup, termStart, termEnd }),
        [twoWeeks, anchor, subgroup, termStart, termEnd]
    );
}

/** Today and the minute of it, re-rendering as the minute turns. */
export function useStudyNow(): { today: string; now: number } {
    const date = useNow(60_000);
    return { today: toLocalIsoDate(date), now: date.getHours() * 60 + date.getMinutes() };
}

/** "1-я неделя", "Числитель", "Odd week" — as the user asked the weeks to be called. */
export function weekName(
    t: Translator,
    week: 1 | 2,
    style: ZenithSettings['studyWeekNames']
): string {
    return t(`study.week.${style}.${week}`);
}

/** `1 ч 20 мин`, `45 мин` — minutes as the reader counts them. */
export function duration(minutes: number, t: Translator): string {
    const total = Math.max(0, Math.round(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    const hu = t('common.hourShort');
    const mu = t('common.minShort');
    if (!h) return `${m}${mu}`;
    return m ? `${h}${hu} ${m}${mu}` : `${h}${hu}`;
}

/** Weekday name for 1–7, in the reader's language. */
export function dayName(day: number, locale: string, width: 'long' | 'short' = 'long'): string {
    // 2024-01-01 was a Monday.
    const name = new Date(2024, 0, day).toLocaleDateString(locale, { weekday: width });
    return name.charAt(0).toUpperCase() + name.slice(1);
}
