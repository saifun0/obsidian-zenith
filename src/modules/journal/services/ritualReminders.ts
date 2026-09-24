import type ZenithPlugin from '../../../main';
import type { EventSource } from '../../../core/scheduler';
import { featureEnabled } from '../../../core/features';
import { resolveLocale, translate } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { ritualEvents, type RitualEvent } from './rituals';

export const RITUAL_SOURCE = 'rituals';

/**
 * The rituals' reminders, through the notification center: at the morning and
 * evening hours, while the rituals are on and their reminders asked for —
 * which they are not, until the user says so.
 *
 * A ritual missed while Obsidian was closed is not worth a record: an evening
 * review offered the next morning is just noise. Only an on-time one is told.
 */
export class RitualReminderService implements EventSource<RitualEvent> {
    readonly id = RITUAL_SOURCE;
    private disposers: Array<() => void> = [];

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        this.disposers.push(this.plugin.scheduler.register(this));
        this.disposers.push(
            useZenithStore.subscribe(
                (s) =>
                    [
                        featureEnabled(s.settings, 'journal.rituals'),
                        s.settings.ritualReminders,
                        s.settings.ritualMorningHour,
                        s.settings.ritualEveningHour,
                    ].join('|'),
                () => this.plugin.scheduler.reschedule()
            )
        );
    }

    stop(): void {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    events(from: number, to: number): RitualEvent[] {
        const { settings } = useZenithStore.getState();
        if (!featureEnabled(settings, 'journal.rituals') || !settings.ritualReminders) return [];
        return ritualEvents(from, to, settings.ritualMorningHour, settings.ritualEveningHour);
    }

    deliver(event: RitualEvent, late: boolean): void {
        if (late) return;
        const locale = resolveLocale(useZenithStore.getState().settings.language);
        this.plugin.notifications.notify(
            {
                key: event.key,
                source: RITUAL_SOURCE,
                title: translate(locale, `ritual.${event.kind}.title`),
                body: translate(locale, `ritual.${event.kind}.remind`),
                at: event.at,
                open: { command: `${this.plugin.manifest.id}:ritual-${event.kind}` },
            },
            false
        );
    }
}
