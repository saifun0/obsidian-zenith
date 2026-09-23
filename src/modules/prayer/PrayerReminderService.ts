import { useZenithStore } from '../../store';
import { resolveLocale, translate } from '../../core/i18n';
import { featureEnabled } from '../../core/features';
import { toLocalIsoDate } from '../../core/dateUtils';
import type { EventSource, SourceEvent } from '../../core/scheduler';
import type ZenithPlugin from '../../main';
import { PRAYERS, type PrayerId } from './prayerConfig';
import { prayerPlaceOf } from './prayerOptions';
import { subscribeApi } from './prayerApi';
import { dayTimesFor, ensurePrayerDay } from './prayerSource';
import { dateAtMinutes, formatClock } from './prayerTimes';

interface PrayerEvent extends SourceEvent {
    prayer: PrayerId;
    /** When the prayer itself comes in — `at` is that, less the warning. */
    time: number;
}

/**
 * The most days one question is answered for. The scheduler asks about three
 * days back at most and two ahead; this is only a floor under a mistake.
 */
const MAX_DAYS = 10;

/**
 * Prayer reminders, as one source of the plugin's shared scheduler.
 *
 * Deliberately modest, as it always was: a notice at prayer time while
 * Obsidian is open. Not an alarm clock and not an adhan — a plugin cannot wake
 * a sleeping phone, and pretending otherwise would be a promise the user
 * relies on and it breaks. What moved to the scheduler is the timer, and with
 * it the part that used to be missing: a prayer that came while Obsidian was
 * closed now waits in the notification center as missed, where before it was
 * dropped without a word.
 */
export class PrayerReminderService implements EventSource<PrayerEvent> {
    readonly id = 'prayer';
    private disposers: Array<() => void> = [];

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        this.disposers.push(this.plugin.scheduler.register(this));
        const reschedule = () => this.plugin.scheduler.reschedule();
        // A month arriving can move the next prayer by a minute or two, and the
        // timer was aimed with the calculated value — so it is re-aimed.
        this.disposers.push(subscribeApi(reschedule));
        // Any of these changes the answer to "when is the next prayer" — a
        // moved city or a switched method has to re-aim the timer, not wait for
        // the old one to fire.
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => {
                    const s = state.settings;
                    return [
                        featureEnabled(s, 'prayer.reminders'),
                        s.prayerNotifyBefore,
                        s.prayerSource,
                        s.prayerApiMidnight,
                        s.prayerMethod,
                        s.prayerAsrMadhab,
                        s.prayerHighLatRule,
                        s.prayerFajrAngle,
                        s.prayerIshaAngle,
                        JSON.stringify(s.prayerAdjustments),
                        JSON.stringify(prayerPlaceOf(s)),
                    ].join('|');
                },
                reschedule
            )
        );
    }

    stop(): void {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    /**
     * The reminders due in `[from, to)`.
     *
     * Walked day by day, because a day's times are computed against that date:
     * the sun does not repeat itself closely enough to reuse today's for
     * tomorrow. The walk starts a warning's length later than `from` as well,
     * since a reminder for just after midnight belongs to a prayer of the next
     * day.
     */
    events(from: number, to: number): PrayerEvent[] {
        const { settings } = useZenithStore.getState();
        if (!featureEnabled(settings, 'prayer.reminders')) return [];
        const place = prayerPlaceOf(settings);
        if (!place) return [];

        const before = settings.prayerNotifyBefore * 60_000;
        const out: PrayerEvent[] = [];
        const first = new Date(from);
        const last = to + before;
        // Counted in calendar days rather than in 24-hour steps, so a
        // daylight-saving night neither skips a day nor visits one twice.
        for (let i = 0; i < MAX_DAYS; i++) {
            const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
            if (date.getTime() > last) break;
            // The same resolution every surface uses: a notice that fired at a
            // different minute than the widget showed would be worse than none.
            ensurePrayerDay(place, date, settings);
            const { times } = dayTimesFor(place, date, settings);
            const iso = toLocalIsoDate(date);

            for (const prayer of PRAYERS) {
                const minutes = times[prayer];
                if (!Number.isFinite(minutes)) continue;
                const time = dateAtMinutes(date, minutes).getTime();
                const at = time - before;
                if (at >= from && at < to) out.push({ key: `prayer:${iso}:${prayer}`, at, prayer, time });
            }
        }
        return out;
    }

    deliver(event: PrayerEvent, late: boolean): void {
        const locale = resolveLocale(useZenithStore.getState().settings.language);
        const prayer = translate(locale, `prayer.${event.prayer}`);
        const clock = new Date(event.time);
        const time = formatClock(clock.getHours() * 60 + clock.getMinutes(), locale);
        const minutesLeft = Math.round((event.time - Date.now()) / 60_000);

        // Missed, it is a record of when the prayer was rather than a
        // countdown to a moment already gone.
        const title =
            !late && minutesLeft > 0
                ? translate(locale, 'prayer.notice.soon', { prayer, time, count: minutesLeft })
                : late
                  ? translate(locale, 'prayer.notice.at', { prayer, time })
                  : translate(locale, 'prayer.notice.now', { prayer, time });

        this.plugin.notifications.notify(
            { key: event.key, source: this.id, title, at: event.at, open: { module: 'prayer' } },
            late
        );
    }
}
