import type ZenithPlugin from '../../main';
import type { EventSource } from '../../core/scheduler';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { resolveLocale, translate, translatePlural } from '../../core/i18n';
import { useZenithStore } from '../../store';
import { TIMER_SOURCE, timerEvents, timerSignature, type TimerEvent } from './timer';

/**
 * A timer card's "time's up", through the notification center.
 *
 * The card draws the countdown; this is what says so when nobody is looking at
 * the card — the board closed, another note in front. It goes through the one
 * scheduler every reminder shares, so quiet hours and a muted source apply to
 * it as they do to the rest.
 *
 * A timer that ran out while Obsidian was closed is not told afterwards: "your
 * five minutes are up", read an hour later, is not news.
 */
export class TimerReminderService implements EventSource<TimerEvent> {
    readonly id = TIMER_SOURCE;
    private disposers: Array<() => void> = [];

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        this.disposers.push(this.plugin.scheduler.register(this));
        this.disposers.push(
            useZenithStore.subscribe(
                (s) => timerSignature(s.settings.widgetConfig),
                () => this.plugin.scheduler.reschedule()
            )
        );
    }

    stop(): void {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    events(from: number, to: number): TimerEvent[] {
        return timerEvents(useZenithStore.getState().settings.widgetConfig, from, to);
    }

    deliver(event: TimerEvent, late: boolean): void {
        if (late) return;
        const locale = resolveLocale(useZenithStore.getState().settings.language);
        this.plugin.notifications.notify(
            {
                key: event.key,
                source: TIMER_SOURCE,
                title: translate(locale, 'utilities.timer.notify.title'),
                body: translatePlural(locale, 'utilities.timer.notify.body', event.minutes),
                at: event.at,
                open: { view: VIEW_TYPE_DASHBOARD },
            },
            false
        );
    }
}
