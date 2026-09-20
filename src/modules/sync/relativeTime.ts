import type { Translator } from '../../core/i18n';

/**
 * "just now", "3 min ago", "2 days ago".
 *
 * Lived inside the sync page until the quick modal needed the same sentence.
 * Two copies of this would drift within a month — one of them would learn
 * about hours and the other would keep saying "90 min ago" — and the two
 * surfaces would then disagree about when the same run happened.
 *
 * Zero means never, not 1970. Every caller stores an epoch that starts at 0
 * and stays there until the thing has happened once.
 */
export function relativeTime(t: Translator, at: number): string {
    if (!at) return t('sync.never');

    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 60) return t('sync.time.justNow');

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t.plural('sync.time.minutes', minutes);

    const hours = Math.round(minutes / 60);
    if (hours < 24) return t.plural('sync.time.hours', hours);

    return t.plural('sync.time.days', Math.round(hours / 24));
}
