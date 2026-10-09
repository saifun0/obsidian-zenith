import React, { useState, type CSSProperties, type FC } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import {
    TIMER_CLEARED,
    TIMER_MAX_MINUTES,
    TIMER_MIN_MINUTES,
    TIMER_PRESETS,
    clampMinutes,
    formatClock,
    normalizeTimerSettings,
    timerHold,
    timerResume,
    timerShare,
    timerStart,
    timerState,
} from '../timer';

/**
 * A kitchen timer: pick the minutes, start it, and be told when they are up.
 *
 * The card shows one number at every moment — the length before a start, the
 * time left during it, and nothing but "time's up" after — with one button
 * beside it, which is always the next thing to do: start, hold, go on. Under
 * both runs a hairline that empties as the time does, so how far along it is
 * can be read from across the room without reading the number.
 *
 * What ends a timer is the moment stored in the card's settings, so it keeps
 * time with the board closed and its notice comes through the notification
 * center either way; the card only has to draw the difference between then
 * and now. A held timer stores what was left instead, and has no end until it
 * is let go.
 *
 * The parts are the same in every state and stand in the same places, so the
 * card is one height whatever it is doing: a timer that grew a line when it
 * started would move every card under it.
 */
export const TimerWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.timer' }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTimerSettings);
    // By the second while it runs; a stopped timer has nothing to redraw. The
    // tick only asks for the redraw — the time is read as the card is drawn,
    // so a start shows its full length at once rather than a second later.
    useNow(config.timerEndsAt ? 1000 : 60_000);
    const now = Date.now();
    const state = timerState(config, now);

    const counting = state.kind === 'running' || state.kind === 'held';
    const left = counting ? state.left : config.timerMinutes * 60;
    const share = state.kind === 'idle' ? 0 : state.kind === 'done' ? 1 : timerShare(config, left);

    const until =
        state.kind === 'running'
            ? new Date(config.timerEndsAt).toLocaleTimeString(t.locale, {
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : '';

    return (
        <div className={`zenith-utimer zenith-wmid is-${state.kind}`}>
            <span className="zenith-wfig zenith-utimer__clock" role="timer">
                {state.kind === 'done' ? t('utilities.timer.done') : formatClock(left)}
            </span>

            <span className="zenith-utimer__mid">
                {state.kind === 'idle' && (
                    <span
                        className="zenith-wpick"
                        role="group"
                        aria-label={t('utilities.timer.minutes')}
                    >
                        {TIMER_PRESETS.map((minutes) => (
                            <button
                                key={minutes}
                                type="button"
                                className={`zenith-wpick__item${minutes === config.timerMinutes ? ' is-active' : ''}`}
                                aria-pressed={minutes === config.timerMinutes}
                                onClick={() => setConfig({ timerMinutes: minutes })}
                            >
                                {minutes}
                            </button>
                        ))}
                    </span>
                )}
                {state.kind === 'running' && (
                    <span className="zenith-wcap">{t('utilities.timer.until', { time: until })}</span>
                )}
                {state.kind === 'held' && (
                    <span className="zenith-wcap">{t('utilities.timer.held')}</span>
                )}
            </span>

            <span className="zenith-utimer__acts">
                {/* Putting a timer away is offered once it has stopped moving:
                    held, or done. A running one is held first — one button
                    while it counts, and no way to lose the count by a slip. */}
                {(state.kind === 'held' || state.kind === 'done') && (
                    <button
                        type="button"
                        className="zenith-wact zenith-wact--quiet"
                        aria-label={t('utilities.timer.reset')}
                        title={t('utilities.timer.reset')}
                        onClick={() => setConfig(TIMER_CLEARED)}
                    >
                        <RotateCcw size={15} />
                    </button>
                )}
                {state.kind === 'idle' && (
                    <button
                        type="button"
                        className="zenith-wact"
                        aria-label={t('utilities.timer.start')}
                        title={t('utilities.timer.start')}
                        onClick={() => setConfig(timerStart(config, Date.now()))}
                    >
                        <Play size={15} />
                    </button>
                )}
                {state.kind === 'running' && (
                    <button
                        type="button"
                        className="zenith-wact zenith-wact--quiet"
                        aria-label={t('utilities.timer.pause')}
                        title={t('utilities.timer.pause')}
                        onClick={() => setConfig(timerHold(config, Date.now()))}
                    >
                        <Pause size={15} />
                    </button>
                )}
                {state.kind === 'held' && (
                    <button
                        type="button"
                        className="zenith-wact"
                        aria-label={t('utilities.timer.resume')}
                        title={t('utilities.timer.resume')}
                        onClick={() => setConfig(timerResume(config, Date.now()))}
                    >
                        <Play size={15} />
                    </button>
                )}
            </span>

            <span
                className="zenith-wbar zenith-utimer__bar"
                style={{ '--zenith-wbar': `${(share * 100).toFixed(2)}%` } as CSSProperties}
                aria-hidden="true"
            >
                <span className="zenith-wbar__fill" />
            </span>
        </div>
    );
};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

/** A length the four on the card do not offer. */
export const TimerSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTimerSettings);
    // What is being typed, while it is: `4` on the way to `45` is not yet a length.
    const [draft, setDraft] = useState<string | null>(null);

    return (
        <div className="zenith-widget-settings__row">
            <span className="zenith-widget-settings__label">{t('utilities.timer.minutes')}</span>
            {/* Zenith's own field, typed into: a number field's arrows are the
                browser's, and step a minute at a time through six hundred. */}
            <input
                type="text"
                inputMode="numeric"
                className="zenith-input zenith-input--sm zenith-utimer__minutes"
                value={draft ?? String(config.timerMinutes)}
                aria-label={t('utilities.timer.minutes')}
                onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                    setDraft(digits);
                    // An emptied field is someone still typing, not a request
                    // for the default.
                    const n = Number(digits);
                    if (digits !== '' && n >= TIMER_MIN_MINUTES && n <= TIMER_MAX_MINUTES)
                        setConfig({ timerMinutes: clampMinutes(n) });
                }}
                onBlur={() => setDraft(null)}
                onPointerDown={stop}
            />
        </div>
    );
};
