import React, { useMemo, type FC } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { isoToDate } from '../../../core/calendarDates';
import { useZenithStore } from '../../../store';
import { DateField } from '../../../components/ui/fields';
import { ROOM_WIDE, rowPx, rowsThatFit, useCardRoom } from '../cardRoom';
import { useWidgetConfig } from '../widgetConfig';
import { WidgetEmpty } from './WidgetEmpty';
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

/** The most rows a card lists under its figure, however tall it is. */
const MAX_ROWS = 12;

/** What the figure and its caption take, when the rows go under them. */
const LEAD_PX = 84;

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
 * prayer module — Ramadan and the two Eids.
 *
 * The soonest is the card's figure — the number of days, and under it what
 * they lead to — because the soonest is the one being waited for; the rest
 * are a list, soonest first, a line each. Beside the figure in a wide card,
 * under it in a narrow one, and as many of them as the card's height holds.
 * Anything that comes from a note opens it.
 */
export const CountdownWidget: FC<DashboardWidgetProps> = ({
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
    const room = useCardRoom();

    // The Hijri walk converts up to a year of days; once a day is plenty.
    const hijri = useMemo(
        () => (hijriOn ? hijriCountdowns(today, offset) : []),
        [hijriOn, today, offset]
    );
    const all = upcoming(
        [
            ownCountdowns(config.events, today),
            hijri,
            config.projects ? projectCountdowns(projects, today) : [],
            config.tasks ? taskCountdowns(tasks, config.tag, today) : [],
        ],
        Number.MAX_SAFE_INTEGER
    );

    if (all.length === 0) {
        return <WidgetEmpty settings>{t('countdown.empty')}</WidgetEmpty>;
    }

    const [lead, ...rest] = all;
    // Beside the figure the rows have the card's whole height; under it, what
    // the figure leaves. One of them gives its place to "N more" when there
    // are more dates than rows.
    const split = room.width >= ROOM_WIDE;
    const fits = Math.min(MAX_ROWS, rowsThatFit(room.height, rowPx(), split ? 0 : LEAD_PX));
    const rows = rest.length > fits ? rest.slice(0, Math.max(1, fits - 1)) : rest;
    const more = rest.length - rows.length;

    const dateOf = (c: Countdown) =>
        isoToDate(c.date).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' });
    const open = (c: Countdown) => void app.workspace.openLinkText(c.path ?? '', '', false);

    const leadDays = daysUntil(lead.date, today);
    const leadBody = (
        <>
            {leadDays > 1 ? (
                <span className="zenith-wfig">
                    {leadDays}
                    <span className="zenith-wfig__unit">{t.plural('countdown.unit', leadDays)}</span>
                </span>
            ) : (
                <span className="zenith-wfig is-word">{inDays(leadDays, t)}</span>
            )}
            <span className="zenith-countdowns__what">
                <span>{title(lead, t)}</span>
                <span className="zenith-wcap zenith-wcap--faint">{dateOf(lead)}</span>
            </span>
        </>
    );
    const leadClass = `zenith-countdowns__lead${leadDays === 0 ? ' is-today' : ''}`;

    return (
        <div className="zenith-countdowns zenith-wsplit">
            {lead.path ? (
                <button type="button" className={leadClass} onClick={() => open(lead)}>
                    {leadBody}
                </button>
            ) : (
                <div className={leadClass}>{leadBody}</div>
            )}

            {rows.length > 0 && (
                <ul className="zenith-wlist">
                    {rows.map((c) => {
                        const days = daysUntil(c.date, today);
                        const body = (
                            <>
                                <span className="zenith-wline__name">{title(c, t)}</span>
                                <span className="zenith-countdowns__date">{dateOf(c)}</span>
                                <span
                                    className={`zenith-countdowns__days${days === 0 ? ' is-today' : ''}`}
                                >
                                    {inDays(days, t)}
                                </span>
                            </>
                        );
                        return (
                            <li key={c.key}>
                                {c.path ? (
                                    <button
                                        type="button"
                                        className="zenith-wline"
                                        onClick={() => open(c)}
                                    >
                                        {body}
                                    </button>
                                ) : (
                                    <div className="zenith-wline">{body}</div>
                                )}
                            </li>
                        );
                    })}
                    {more > 0 && (
                        <li className="zenith-wcap zenith-wcap--faint zenith-countdowns__more">
                            {t('common.more', { count: more })}
                        </li>
                    )}
                </ul>
            )}
        </div>
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
                        <span onPointerDown={stop}>
                            <DateField
                                size="sm"
                                clearable={false}
                                value={event.date}
                                onChange={(date) => setEvent(i, { date })}
                            />
                        </span>
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
