import { intlLocale, type Translator } from '../../../core/i18n';
import { daysBetweenIso } from '../../../core/dateUtils';
import { isoToDate } from './journalDates';
import type { JournalStatsResult } from './journalStats';

/** Within a week, "yesterday" / "3 days ago" says more than the date does. */
const RELATIVE_DAYS = 7;

/** When the journal was last written in, as it reads after "last entry". */
export function lastEntryWhen(last: string, today: string, locale: string): string {
    const ago = daysBetweenIso(last, today);
    if (ago > 0 && ago < RELATIVE_DAYS) {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-ago, 'day');
    }
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
        isoToDate(last)
    );
}

/**
 * The journal's last thirty days, as the line under the page's title.
 *
 * It was four figures in four boxes over the month. As a line it says the same
 * and stands where a reader looks first — and it names its own window, which
 * the boxes left to a caption under them: the title is a month, and these are
 * not that month's figures.
 *
 * The last entry is said only when it is news. A journal written in today has
 * a streak that says so already; "last entry — today" was the fourth box's
 * whole content on every day the journal was being kept.
 */
export function journalTally(
    stats: JournalStatsResult,
    today: string,
    t: Translator,
    options: { words: boolean }
): string[] {
    if (stats.lastEntryDate === null) return [t('journal.tally.none')];
    const locale = intlLocale(t.locale);

    const line = [
        t('journal.tally.days', { count: stats.inRange, days: stats.windowDays }),
        t('journal.tally.streak', { count: stats.currentStreak, best: stats.longestStreak }),
    ];
    if (stats.lastEntryDate !== today) {
        line.push(t('journal.tally.last', { when: lastEntryWhen(stats.lastEntryDate, today, locale) }));
    }
    if (options.words) {
        line.push(
            t.plural('journal.words', stats.words, { count: stats.words.toLocaleString(locale) })
        );
    }
    return line;
}
