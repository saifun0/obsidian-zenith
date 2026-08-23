import { Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import { resolveLocale, translate } from '../../core/i18n';
import { PRAYERS, type PrayerId } from './prayerConfig';
import { prayerCalcOptions, prayerPlaceOf } from './prayerOptions';
import { dateAtMinutes, formatClock, prayerTimes } from './prayerTimes';

/**
 * How stale a wake-up may be before its notice is dropped.
 *
 * A laptop that slept through maghrib fires the timer the moment it wakes, and
 * "it's time for maghrib" two hours late is worse than silence — it is a wrong
 * statement about the present. The schedule still moves on to the next prayer.
 */
const STALE_MS = 5 * 60 * 1000;

interface Scheduled {
    prayer: PrayerId;
    /** When the prayer itself comes in. */
    at: Date;
    /** When to speak up — the prayer, less the configured warning. */
    fireAt: Date;
}

/**
 * Notices at prayer time, while Obsidian is open.
 *
 * Deliberately modest: one timer, pointed at the next event, rebuilt whenever
 * the settings that decide it change. Not an alarm clock and not an adhan — a
 * plugin cannot wake a sleeping phone, and pretending otherwise would be a
 * promise the user relies on and it breaks.
 */
export class PrayerReminderService {
    private timer: number | null = null;
    private unsubscribe: (() => void) | null = null;

    start(): void {
        this.schedule();
        // Any of these changes the answer to "when is the next prayer" — a
        // moved city or a switched method has to re-aim the timer, not wait for
        // the old one to fire.
        this.unsubscribe = useZenithStore.subscribe(
            (state) => {
                const s = state.settings;
                return [
                    s.prayerNotify,
                    s.prayerNotifyBefore,
                    s.prayerMethod,
                    s.prayerAsrMadhab,
                    s.prayerHighLatRule,
                    s.prayerFajrAngle,
                    s.prayerIshaAngle,
                    JSON.stringify(s.prayerAdjustments),
                    JSON.stringify(prayerPlaceOf(s)),
                ].join('|');
            },
            () => this.schedule()
        );
    }

    stop(): void {
        this.clearTimer();
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** Point the timer at the next event, or at nothing when there isn't one. */
    private schedule(): void {
        this.clearTimer();

        const { settings } = useZenithStore.getState();
        if (!settings.prayerNotify) return;

        const now = new Date();
        const next = this.nextEvent(now);
        if (!next) return;

        const delay = next.fireAt.getTime() - now.getTime();
        this.timer = window.setTimeout(() => {
            this.fire(next);
            this.schedule();
        }, Math.max(0, delay));
    }

    private fire(event: Scheduled): void {
        const { settings } = useZenithStore.getState();
        const locale = resolveLocale(settings.language);
        const now = Date.now();

        if (now - event.fireAt.getTime() > STALE_MS) return;

        const prayer = translate(locale, `prayer.${event.prayer}`);
        const time = formatClock(
            event.at.getHours() * 60 + event.at.getMinutes(),
            locale
        );
        const minutesLeft = Math.round((event.at.getTime() - now) / 60000);

        new Notice(
            minutesLeft > 0
                ? translate(locale, 'prayer.notice.soon', { prayer, time, count: minutesLeft })
                : translate(locale, 'prayer.notice.now', { prayer, time })
        );
    }

    /**
     * The next prayer whose warning hasn't passed yet.
     *
     * Today and tomorrow are both searched: after isha the answer is tomorrow's
     * fajr, and it has to be computed against tomorrow's date — the sun does
     * not repeat itself closely enough to reuse today's.
     */
    private nextEvent(now: Date): Scheduled | null {
        const { settings } = useZenithStore.getState();
        const place = prayerPlaceOf(settings);
        if (!place) return null;

        for (const offset of [0, 1]) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
            const { times } = prayerTimes(place, date, prayerCalcOptions(settings, date));

            for (const prayer of PRAYERS) {
                const minutes = times[prayer];
                if (!Number.isFinite(minutes)) continue;
                const fireAt = dateAtMinutes(date, minutes - settings.prayerNotifyBefore);
                if (fireAt.getTime() > now.getTime()) {
                    return { prayer, at: dateAtMinutes(date, minutes), fireAt };
                }
            }
        }
        return null;
    }
}
