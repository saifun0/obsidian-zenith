import type { EventSource } from '../../core/scheduler';
import { featureEnabled } from '../../core/features';
import { resolveLocale, translate } from '../../core/i18n';
import { useZenithStore } from '../../store';
import type ZenithPlugin from '../../main';
import { normalizeSchedule, timeOf } from './studyModel';
import { lessonsOn, studyEvents, type StudyEvent } from './studyTime';
import { studyOptions } from './useStudy';

export const STUDY_SOURCE = 'study';

/**
 * A notice before each class — the subject, how soon, and the room, which is
 * the part worth being told on the way there. One per slot: two subgroups at
 * the same time are one moment. Off until switched on.
 */
export class StudyReminderService implements EventSource<StudyEvent> {
    readonly id = STUDY_SOURCE;
    private disposers: Array<() => void> = [];

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        this.disposers.push(this.plugin.scheduler.register(this));
        const reschedule = () => this.plugin.scheduler.reschedule();
        this.disposers.push(
            useZenithStore.subscribe(
                (s) => [
                    featureEnabled(s.settings, 'study.reminders'),
                    s.settings.studyRemindBefore,
                    s.settings.studySchedule,
                    s.settings.studyTwoWeeks,
                    s.settings.studyWeekAnchor,
                    s.settings.studySubgroup,
                    s.settings.studyTermStart,
                    s.settings.studyTermEnd,
                ],
                reschedule,
                { equalityFn: (a, b) => a.every((v, i) => v === b[i]) }
            )
        );
    }

    stop(): void {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    events(from: number, to: number): StudyEvent[] {
        const { settings } = useZenithStore.getState();
        if (!featureEnabled(settings, 'study.reminders')) return [];
        const schedule = normalizeSchedule(settings.studySchedule);
        if (!schedule.lessons.length) return [];
        return studyEvents(schedule, studyOptions(settings), from, to, settings.studyRemindBefore);
    }

    deliver(event: StudyEvent, late: boolean): void {
        // A class that has started or passed is not news.
        if (late) return;
        const { settings } = useZenithStore.getState();
        const locale = resolveLocale(settings.language);
        const schedule = normalizeSchedule(settings.studySchedule);
        // Looked up again: the timetable may have changed since this was aimed.
        const slot = lessonsOn(schedule, event.date, studyOptions(settings)).filter(
            (l) => l.start === event.start
        );
        if (!slot.length) return;
        const minutes = Math.round(
            (event.at + settings.studyRemindBefore * 60_000 - Date.now()) / 60_000
        );
        const place =
            slot
                .map((l) => l.lesson.room)
                .filter(Boolean)
                .join(' / ') || translate(locale, 'study.remind.noRoom');
        this.plugin.notifications.notify(
            {
                key: event.key,
                source: STUDY_SOURCE,
                title: slot.map((l) => l.lesson.subject).join(' / '),
                body:
                    minutes > 0
                        ? translate(locale, 'study.remind.in', { minutes, place })
                        : translate(locale, 'study.remind.at', {
                              time: timeOf(event.start),
                              place,
                          }),
                at: event.at,
                open: { module: 'study' },
            },
            false
        );
    }
}
