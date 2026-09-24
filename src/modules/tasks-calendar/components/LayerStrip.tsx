import React, { useEffect, useState, type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import { isoToDate } from '../../../core/calendarDates';
import {
    extensions,
    useExtensions,
    type CalendarLayerEvent,
} from '../../../core/extensions/registry';

interface LayerEvent extends CalendarLayerEvent {
    key: string;
    color?: string;
    layer: string;
}

/**
 * Events from the calendar layers modules registered — another calendar, a
 * timetable — over the days on screen. Read-only, in a strip above the grid:
 * they are shown beside the tasks, never mixed into them, because nothing
 * here can be moved, ticked or written back.
 *
 * Nothing at all is drawn without a layer, or without events in view.
 */
export const LayerStrip: FC<{ t: Translator; days: readonly string[] }> = ({ t, days }) => {
    const layers = useExtensions(extensions.calendarLayers);
    const [events, setEvents] = useState<LayerEvent[]>([]);
    const from = days[0];
    const to = days[days.length - 1];

    useEffect(() => {
        if (!layers.length || !from || !to) {
            setEvents([]);
            return;
        }
        let live = true;
        void Promise.all(
            layers.map(async (layer) =>
                (await layer.events(from, to))
                    .filter(
                        (e) => e && typeof e.title === 'string' && e.date >= from && e.date <= to
                    )
                    .map((e, i) => ({
                        ...e,
                        key: `${layer.moduleId}:${layer.id}:${i}`,
                        color: layer.color,
                        layer: layer.label,
                    }))
            )
        ).then((lists) => {
            if (!live) return;
            setEvents(
                lists
                    .flat()
                    .sort(
                        (a, b) =>
                            a.date.localeCompare(b.date) ||
                            (a.time ?? '').localeCompare(b.time ?? '')
                    )
            );
        });
        return () => {
            live = false;
        };
    }, [layers, from, to]);

    if (!events.length) return null;

    const byDay = new Map<string, LayerEvent[]>();
    for (const event of events) byDay.set(event.date, [...(byDay.get(event.date) ?? []), event]);

    return (
        <div className="zenith-cal-layers" aria-label={t('calendar.layers')}>
            {[...byDay].map(([date, list]) => (
                <div key={date} className="zenith-cal-layers__day">
                    <span className="zenith-cal-layers__date">
                        {isoToDate(date).toLocaleDateString(t.locale, {
                            weekday: 'short',
                            day: 'numeric',
                        })}
                    </span>
                    {list.map((event) => (
                        <span
                            key={event.key}
                            className={`zenith-cal-layers__event${event.url ? ' is-link' : ''}`}
                            style={{
                                ['--layer-color' as string]:
                                    event.color ?? 'var(--zenith-text-faint)',
                            }}
                            title={`${event.layer}: ${event.title}`}
                            onClick={event.url ? () => window.open(event.url, '_blank') : undefined}
                        >
                            {event.time && (
                                <b>
                                    {event.endTime ? `${event.time}–${event.endTime}` : event.time}
                                </b>
                            )}
                            {event.title}
                        </span>
                    ))}
                </div>
            ))}
        </div>
    );
};
