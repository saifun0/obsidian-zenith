import React, { type FC } from 'react';
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
}

function normalizePeriodConfig(raw: Record<string, unknown> | undefined): PeriodConfig {
    return { hijri: raw?.hijri === true };
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
 * How far through the day, week, month and year — a bar and a percentage
 * each, and nothing else on the card. What is left is in the row's title for
 * whoever wants the number; the bar already answers the question at a glance.
 */
export const PeriodWidget: FC<DashboardWidgetProps> = ({ instanceId = 'dashboard.progress' }) => {
    const t = useTranslation();
    const [config] = useWidgetConfig(instanceId, normalizePeriodConfig);
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const offset = useZenithStore((s) => s.settings.prayerHijriOffset);
    const now = useNow(60_000);

    const rows = periodRows(
        toLocalIsoDate(now),
        now.getHours() * 60 + now.getMinutes(),
        weekStart,
        config.hijri ? { offset } : null
    );

    return (
        <div className="zenith-periods">
            {rows.map((row) => {
                const percent = Math.floor(row.fraction * 100);
                const left =
                    row.id === 'day'
                        ? t.plural('period.hoursLeft', row.left)
                        : t.plural('period.daysLeft', row.left);
                return (
                    <div key={row.id} className="zenith-periods__row" title={left}>
                        <span className="zenith-periods__label">{rowLabel(row, now, t)}</span>
                        <span className="zenith-periods__bar" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                        </span>
                        <span
                            className="zenith-periods__value"
                            aria-label={`${percent}% · ${left}`}
                        >
                            {percent}%
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
    );
};
