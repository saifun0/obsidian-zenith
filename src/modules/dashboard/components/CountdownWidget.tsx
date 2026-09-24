import React, { useMemo, type FC } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { isoToDate } from '../../../core/calendarDates';
import { useZenithStore } from '../../../store';
import { useWidgetConfig } from '../widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../widgets';
import {
    daysUntil,
    hijriCountdowns,
    ownCountdowns,
    projectCountdowns,
    taskCountdowns,
    upcoming,
    type Countdown,
    type OwnEvent,
} from '../services/countdowns';

interface CountdownConfig extends Record<string, unknown> {
    tasks: boolean;
    /** The tag that puts a dated task on this card. */
    tag: string;
    projects: boolean;
    /** Unset until chosen: then on exactly when the prayer module is. */
    hijri: boolean | null;
    events: OwnEvent[];
}

export const DEFAULT_COUNTDOWN_TAG = 'countdown';

function normalizeCountdownConfig(raw: Record<string, unknown> | undefined): CountdownConfig {
    const events = Array.isArray(raw?.events)
        ? (raw.events as unknown[]).flatMap((e): OwnEvent[] => {
              if (!e || typeof e !== 'object') return [];
              const { title, date, yearly } = e as Record<string, unknown>;
              if (typeof title !== 'string' || typeof date !== 'string') return [];
              return [{ title, date, yearly: yearly === true }];
          })
        : [];
    return {
        tasks: raw?.tasks !== false,
        tag: typeof raw?.tag === 'string' ? raw.tag : DEFAULT_COUNTDOWN_TAG,
        projects: raw?.projects !== false,
        hijri: typeof raw?.hijri === 'boolean' ? raw.hijri : null,
        events,
    };
}

const LIMIT = { sm: 4, md: 6, lg: 10 } as const;

function title(c: Countdown, t: Translator): string {
    return c.hijri ? t(`countdown.hijri.${c.hijri}`) : c.title;
}

function inDays(days: number, t: Translator): string {
    if (days === 0) return t('countdown.today');
    if (days === 1) return t('countdown.tomorrow');
    return t.plural('countdown.days', days);
}

/**
 * Days until what is coming: dates the user typed on the back of the card,
 * tasks tagged for it, projects' target dates and — for whoever keeps the
 * prayer module — Ramadan and the two Eids. One list, soonest first, a line
 * each; a row that comes from a note opens it.
 */
export const CountdownWidget: FC<DashboardWidgetProps> = ({
    size = 'sm',
    instanceId = 'dashboard.countdowns',
}) => {
    const t = useTranslation();
    const { app } = useApp();
    const [config] = useWidgetConfig(instanceId, normalizeCountdownConfig);
    const tasks = useZenithStore((s) => s.tasks);
    const projects = useZenithStore((s) => s.projects);
    const offset = useZenithStore((s) => s.settings.prayerHijriOffset);
    const prayerOn = useZenithStore((s) => s.settings.activeModuleIds.includes('prayer'));
    const today = toLocalIsoDate(useNow(60 * 60_000));
    const hijriOn = config.hijri ?? prayerOn;

    // The Hijri walk converts up to a year of days; once a day is plenty.
    const hijri = useMemo(
        () => (hijriOn ? hijriCountdowns(today, offset) : []),
        [hijriOn, today, offset]
    );
    const list = upcoming(
        [
            ownCountdowns(config.events, today),
            hijri,
            config.projects ? projectCountdowns(projects, today) : [],
            config.tasks ? taskCountdowns(tasks, config.tag, today) : [],
        ],
        LIMIT[size]
    );

    if (list.length === 0) {
        return <p className="zenith-countdowns__empty">{t('countdown.empty')}</p>;
    }

    return (
        <ul className="zenith-countdowns">
            {list.map((c) => {
                const days = daysUntil(c.date, today);
                const date = isoToDate(c.date).toLocaleDateString(t.locale, {
                    day: 'numeric',
                    month: 'short',
                });
                const body = (
                    <>
                        <span className="zenith-countdowns__title">{title(c, t)}</span>
                        <span className="zenith-countdowns__date">{date}</span>
                        <span className={`zenith-countdowns__days${days === 0 ? ' is-today' : ''}`}>
                            {inDays(days, t)}
                        </span>
                    </>
                );
                return (
                    <li key={c.key}>
                        {c.path ? (
                            <button
                                type="button"
                                className="zenith-countdowns__row is-link"
                                onClick={() =>
                                    void app.workspace.openLinkText(c.path ?? '', '', false)
                                }
                            >
                                {body}
                            </button>
                        ) : (
                            <div className="zenith-countdowns__row">{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

/** A text field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

export const CountdownSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeCountdownConfig);
    const prayerOn = useZenithStore((s) => s.settings.activeModuleIds.includes('prayer'));
    const hijriOn = config.hijri ?? prayerOn;

    const sources: Array<{ key: 'tasks' | 'projects' | 'hijri'; on: boolean }> = [
        { key: 'tasks', on: config.tasks },
        { key: 'projects', on: config.projects },
        { key: 'hijri', on: hijriOn },
    ];

    const setEvent = (i: number, patch: Partial<OwnEvent>) =>
        setConfig({ events: config.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

    return (
        <>
            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('countdown.sources')}</span>
                <span className="zenith-widget-settings__presets">
                    {sources.map(({ key, on }) => (
                        <button
                            key={key}
                            className={on ? 'is-active' : ''}
                            aria-pressed={on}
                            onClick={() => setConfig({ [key]: !on })}
                        >
                            {t(`countdown.source.${key}`)}
                        </button>
                    ))}
                </span>
            </div>

            {config.tasks && (
                <div className="zenith-widget-settings__row">
                    <span className="zenith-widget-settings__label">{t('countdown.tag')}</span>
                    <input
                        type="text"
                        className="zenith-input zenith-input--sm is-mono zenith-countdowns__tag"
                        value={config.tag}
                        placeholder={DEFAULT_COUNTDOWN_TAG}
                        spellCheck={false}
                        onChange={(e) => setConfig({ tag: e.target.value })}
                        onPointerDown={stop}
                    />
                </div>
            )}

            <div className="zenith-countdowns__events">
                {config.events.map((event, i) => (
                    <div key={i} className="zenith-countdowns__event">
                        <input
                            type="text"
                            className="zenith-input zenith-input--sm"
                            value={event.title}
                            placeholder={t('countdown.event.title')}
                            onChange={(e) => setEvent(i, { title: e.target.value })}
                            onPointerDown={stop}
                        />
                        <input
                            type="date"
                            className="zenith-input zenith-input--sm"
                            value={event.date}
                            onChange={(e) => setEvent(i, { date: e.target.value })}
                            onPointerDown={stop}
                        />
                        <button
                            type="button"
                            className={`zenith-countdowns__yearly${event.yearly ? ' is-active' : ''}`}
                            aria-pressed={!!event.yearly}
                            onClick={() => setEvent(i, { yearly: !event.yearly })}
                        >
                            {t('countdown.event.yearly')}
                        </button>
                        <button
                            type="button"
                            className="zenith-countdowns__remove"
                            aria-label={t('countdown.event.remove')}
                            title={t('countdown.event.remove')}
                            onClick={() =>
                                setConfig({ events: config.events.filter((_, j) => j !== i) })
                            }
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="zenith-countdowns__add"
                    onClick={() =>
                        setConfig({
                            events: [
                                ...config.events,
                                { title: '', date: toLocalIsoDate(new Date()) },
                            ],
                        })
                    }
                >
                    <Plus size={12} />
                    {t('countdown.event.add')}
                </button>
            </div>
        </>
    );
};
