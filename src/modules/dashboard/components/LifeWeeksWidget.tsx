import React, { useId, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../widgets';
import { lifeWeeks, WEEKS_PER_YEAR } from '../services/lifeWeeks';

/** One week's square, and the gap around it, in the grid's own units. */
const CELL = 10;
const DOT = 7;

/**
 * A life in weeks: a column for each year, fifty-two weeks down it, the
 * weeks lived filled in. Sideways from the usual poster because a dashboard
 * card is wider than it is tall.
 *
 * Four rectangles, not four thousand: each region is one rect filled with a
 * repeating one-dot pattern, so the card costs what a clock costs however long
 * the life. The small size keeps only the figure and a bar.
 */
export const LifeWeeksWidget: FC<DashboardWidgetProps> = ({ size = 'sm' }) => {
    const t = useTranslation();
    const birth = useZenithStore((s) => s.settings.dashboardBirthDate);
    const years = useZenithStore((s) => s.settings.dashboardLifeYears);
    const today = toLocalIsoDate(useNow(60 * 60_000));
    const id = useId().replace(/:/g, '');

    const life = lifeWeeks(birth, years, today);
    if (!life) return <p className="zenith-life__empty">{t('lifeWeeks.empty')}</p>;

    const span = Math.round(life.total / WEEKS_PER_YEAR);
    const percent = Math.floor(life.fraction * 100);
    const figure = (
        <div className="zenith-life__figure">
            <b>{life.lived.toLocaleString(t.locale)}</b>
            <span>
                {t('lifeWeeks.of', { total: life.total.toLocaleString(t.locale), percent })}
            </span>
        </div>
    );

    if (size === 'sm') {
        return (
            <div className="zenith-life is-compact">
                {figure}
                <span className="zenith-life__bar" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                </span>
            </div>
        );
    }

    const fullYears = Math.min(life.age, span);
    const width = span * CELL;
    const height = WEEKS_PER_YEAR * CELL;
    const dot = (name: string, cls: string) => (
        <pattern id={`${id}-${name}`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect className={cls} x={0} y={0} width={DOT} height={DOT} rx={1.5} />
        </pattern>
    );

    return (
        <div className="zenith-life">
            {figure}
            <svg
                className="zenith-life__grid"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMinYMin meet"
                role="img"
                aria-label={t('lifeWeeks.aria', { lived: life.lived, total: life.total })}
            >
                <defs>
                    {dot('lived', 'zenith-life__lived')}
                    {dot('now', 'zenith-life__now')}
                    {dot('left', 'zenith-life__left')}
                </defs>
                <rect width={width} height={height} fill={`url(#${id}-left)`} />
                {fullYears > 0 && (
                    <rect width={fullYears * CELL} height={height} fill={`url(#${id}-lived)`} />
                )}
                {life.age < span && (
                    <>
                        <rect
                            x={fullYears * CELL}
                            width={CELL}
                            height={life.week * CELL}
                            fill={`url(#${id}-lived)`}
                        />
                        <rect
                            x={fullYears * CELL}
                            y={life.week * CELL}
                            width={CELL}
                            height={CELL}
                            fill={`url(#${id}-now)`}
                        />
                    </>
                )}
            </svg>
        </div>
    );
};
