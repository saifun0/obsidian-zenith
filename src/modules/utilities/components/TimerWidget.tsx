import React, { type FC } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import {
    TIMER_MAX_MINUTES,
    TIMER_MIN_MINUTES,
    TIMER_PRESETS,
    clampMinutes,
    formatClock,
    normalizeTimerSettings,
    timerState,
} from '../timer';

/**
 * A kitchen timer: pick the minutes, start it, and be told when they are up.
 *
 * The card shows one number at every moment — the length before a start, the
 * time left during it, and nothing but "time's up" after. What ends it is the
 * moment stored in the card's settings, so the timer keeps time with the board
 * closed and its notice comes through the notification center either way; the
 * card only has to draw the difference between then and now.
 */
export const TimerWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.timer' }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTimerSettings);
    // By the second while it runs; a stopped timer has nothing to redraw. The
    // tick only asks for the redraw — the time is read as the card is drawn,
    // so a start shows its full length at once rather than a second later.
    useNow(config.timerEndsAt ? 1000 : 60_000);
    const state = timerState(config, Date.now());

    if (state.kind === 'done') {
        return (
            <div className="zenith-utimer is-done">
                <span className="zenith-utimer__clock">{t('utilities.timer.done')}</span>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--outline zenith-btn--md"
                    onClick={() => setConfig({ timerEndsAt: 0 })}
                >
                    <RotateCcw size={14} />
                    {t('utilities.timer.reset')}
                </button>
            </div>
        );
    }

    if (state.kind === 'running') {
        const until = new Date(config.timerEndsAt).toLocaleTimeString(t.locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
        return (
            <div className="zenith-utimer is-running">
                <span className="zenith-utimer__clock" role="timer">
                    {formatClock(state.left)}
                </span>
                <span className="zenith-utimer__until">
                    {t('utilities.timer.until', { time: until })}
                </span>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--outline zenith-btn--md"
                    onClick={() => setConfig({ timerEndsAt: 0 })}
                >
                    <Square size={12} />
                    {t('utilities.timer.stop')}
                </button>
            </div>
        );
    }

    return (
        <div className="zenith-utimer">
            <span className="zenith-utimer__clock">{formatClock(config.timerMinutes * 60)}</span>
            <span
                className="zenith-utimer__presets"
                role="group"
                aria-label={t('utilities.timer.minutes')}
            >
                {TIMER_PRESETS.map((minutes) => (
                    <button
                        key={minutes}
                        type="button"
                        className={`zenith-btn zenith-btn--ghost zenith-btn--sm zenith-utimer__preset${minutes === config.timerMinutes ? ' zenith-btn--active' : ''}`}
                        aria-pressed={minutes === config.timerMinutes}
                        onClick={() => setConfig({ timerMinutes: minutes })}
                    >
                        {minutes}
                    </button>
                ))}
            </span>
            <button
                type="button"
                className="zenith-btn zenith-btn--cta zenith-btn--md"
                onClick={() =>
                    setConfig({ timerEndsAt: Date.now() + config.timerMinutes * 60_000 })
                }
            >
                <Play size={13} />
                {t('utilities.timer.start')}
            </button>
        </div>
    );
};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

/** A length the four on the card do not offer. */
export const TimerSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTimerSettings);

    return (
        <div className="zenith-widget-settings__row">
            <span className="zenith-widget-settings__label">{t('utilities.timer.minutes')}</span>
            <input
                type="number"
                className="zenith-input zenith-input--sm zenith-utimer__minutes"
                value={config.timerMinutes}
                min={TIMER_MIN_MINUTES}
                max={TIMER_MAX_MINUTES}
                step={1}
                inputMode="numeric"
                onChange={(e) => {
                    // An emptied field is someone still typing, not a request
                    // for the default.
                    if (e.target.value !== '')
                        setConfig({ timerMinutes: clampMinutes(e.target.value) });
                }}
                onPointerDown={stop}
            />
        </div>
    );
};
