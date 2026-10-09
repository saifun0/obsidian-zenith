import React, { type CSSProperties, type FC } from 'react';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import { hijriMonthKey } from '../../prayer/hijri';
import { useWidgetConfig } from '../widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../widgets';
import { periodRows, type PeriodRow } from '../services/periods';

interface PeriodConfig extends Record<string, unknown> {
    /** Add the Hijri month (Ramadan, in its month) under the year. */
    hijri: boolean;
    /** Say what is left of each rather than how much has gone. */
    left: boolean;
}

function normalizePeriodConfig(raw: Record<string, unknown> | undefined): PeriodConfig {
    return { hijri: raw?.hijri === true, left: raw?.left === true };
}

function rowLabel(row: PeriodRow, now: Date, t: Translator): string {
    switch (row.id) {
        case 'day':
            return t('period.day');
        case 'week':
            return t('period.week');
        case 'month': {
            const name = now.toLocaleDateString(t.locale, { month: 'long' });
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        case 'year':
            return String(now.getFullYear());
        case 'hijriMonth':
            return t(hijriMonthKey(row.hijriMonth ?? 1));
    }
}

/**
 * How far through the day, week, month and year — a hairline and a figure
 * each, and nothing else on the card.
 *
 * The figure answers one of two questions, and the card is pressed to change
 * which: how much has gone, as a share, or how much is left, in hours and
 * days. The second used to live in a tooltip, which a phone has none of. The
 * choice is the card's own and is kept, since it is a preference rather than
 * a glance — someone who counts days down wants days every morning.
 *
 * Rows where the card is narrow; in a wide one they stand side by side, and
 * the card is a row tall. Four hairlines the width of a board said nothing
 * more than four the width of a column.
 */
export const PeriodWidget: FC<DashboardWidgetProps> = ({ instanceId = 'dashboard.progress' }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizePeriodConfig);
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const offset = useZenithStore((s) => s.settings.prayerHijriOffset);
    const now = useNow(60_000);

    const rows = periodRows(
        toLocalIsoDate(now),
        now.getHours() * 60 + now.getMinutes(),
        weekStart,
        config.hijri ? { offset } : null
    );

    const flip = () => setConfig({ left: !config.left });

    return (
        <div
            className="zenith-periods"
            role="button"
            tabIndex={0}
            aria-pressed={config.left}
            title={t(config.left ? 'period.showGone' : 'period.showLeft')}
            onClick={flip}
            onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                flip();
            }}
        >
            {rows.map((row) => {
                const percent = Math.floor(row.fraction * 100);
                const leftLong =
                    row.id === 'day'
                        ? t.plural('period.hoursLeft', row.left)
                        : t.plural('period.daysLeft', row.left);
                const leftShort =
                    row.id === 'day'
                        ? t('period.hoursShort', { count: row.left })
                        : t('period.daysShort', { count: row.left });
                return (
                    <div key={row.id} className="zenith-periods__row">
                        <span className="zenith-wcap zenith-periods__label">
                            {rowLabel(row, now, t)}
                        </span>
                        <span
                            // Keyed by which reading it is, so the change of
                            // question is seen to happen.
                            key={config.left ? 'left' : 'gone'}
                            className="zenith-periods__value"
                            aria-label={`${percent}% · ${leftLong}`}
                        >
                            {config.left ? leftShort : `${percent}%`}
                        </span>
                        <span
                            className="zenith-wbar zenith-periods__bar"
                            style={{ '--zenith-wbar': `${percent}%` } as CSSProperties}
                            aria-hidden="true"
                        >
                            <span className="zenith-wbar__fill" />
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export const PeriodSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizePeriodConfig);
    return (
        <>
            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('period.reading')}</span>
                <span className="zenith-widget-settings__presets">
                    {[false, true].map((left) => (
                        <button
                            key={String(left)}
                            className={config.left === left ? 'is-active' : ''}
                            aria-pressed={config.left === left}
                            onClick={() => setConfig({ left })}
                        >
                            {t(left ? 'period.reading.left' : 'period.reading.gone')}
                        </button>
                    ))}
                </span>
            </div>
            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('period.hijri')}</span>
                <span className="zenith-widget-settings__presets">
                    {[false, true].map((on) => (
                        <button
                            key={String(on)}
                            className={config.hijri === on ? 'is-active' : ''}
                            aria-pressed={config.hijri === on}
                            onClick={() => setConfig({ hijri: on })}
                        >
                            {t(on ? 'period.show' : 'period.hide')}
                        </button>
                    ))}
                </span>
            </div>
        </>
    );
};
