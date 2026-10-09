import React, { useId, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import { useCardRoom } from '../cardRoom';
import type { DashboardWidgetProps } from '../widgets';
import { lifeGridPlan, lifeMarks, lifeWeeks, WEEKS_PER_YEAR } from '../services/lifeWeeks';

/** One mark's square, and the gap around it, in the grid's own units. */
const CELL = 10;
const DOT = 7;

/**
 * A life as a field of marks, the part lived filled in, and the count of its
 * weeks set beside it.
 *
 * The field is as fine as the card has room for. Given the room it is the
 * poster: a column for each year, fifty-two weeks down it. In less it is the
 * same life in months, and in a card too small for those, in years — the
 * share lived looks the same at every grain, which is the thing the card is
 * for, and no size of it is a bar pretending to be a grid. The count beside it
 * is always in weeks. See `lifeGridPlan`.
 *
 * Four rectangles, not four thousand: each region is one rect filled with a
 * repeating one-mark pattern, so the card costs what a clock costs however
 * long the life.
 */
export const LifeWeeksWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const birth = useZenithStore((s) => s.settings.dashboardBirthDate);
    const years = useZenithStore((s) => s.settings.dashboardLifeYears);
    const today = toLocalIsoDate(useNow(60 * 60_000));
    const id = useId().replace(/:/g, '');
    const room = useCardRoom();

    const life = lifeWeeks(birth, years, today);
    if (!life) return <p className="zenith-wempty">{t('lifeWeeks.empty')}</p>;

    const span = Math.round(life.total / WEEKS_PER_YEAR);
    const percent = Math.floor(life.fraction * 100);
    const plan = lifeGridPlan(span, room.width, room.height);
    const marks = lifeMarks(life, span, plan);

    const width = plan.cols * CELL;
    const height = plan.rows * CELL;
    const dot = (name: string, cls: string) => (
        <pattern id={`${id}-${name}`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect className={cls} x={0} y={0} width={DOT} height={DOT} rx={1.5} />
        </pattern>
    );

    return (
        <div className={`zenith-life${plan.beside ? ' is-beside' : ''}`}>
            <div className="zenith-life__figure">
                <span className="zenith-wfig">{life.lived.toLocaleString(t.locale)}</span>
                <span className="zenith-wcap">
                    {t('lifeWeeks.of', { total: life.total.toLocaleString(t.locale), percent })}
                </span>
            </div>
            {/* Not before the card has been measured: the grain is chosen from
                the room, and a guess would be drawn and then redrawn finer. */}
            {room.width > 0 && (
                <svg
                    className="zenith-life__grid"
                    width={plan.cols * plan.cell}
                    height={plan.rows * plan.cell}
                    viewBox={`0 0 ${width} ${height}`}
                    role="img"
                    aria-labelledby={`${id}-name`}
                >
                    {/* Named through `aria-labelledby`, never `aria-label`:
                        Obsidian shows a tooltip for anything carrying
                        `aria-label` and asks it `isShown()`, which an SVG
                        element does not have — so a labelled <svg> threw on
                        every pass of the pointer. */}
                    <desc id={`${id}-name`}>
                        {t('lifeWeeks.aria', { lived: life.lived, total: life.total })}
                    </desc>
                    <defs>
                        {dot('lived', 'zenith-life__lived')}
                        {dot('left', 'zenith-life__left')}
                    </defs>
                    <rect width={width} height={height} fill={`url(#${id}-left)`} />
                    <g className="zenith-life__past">
                        {marks.lived.map((r, i) => (
                            <rect
                                key={i}
                                x={r.x * CELL}
                                y={r.y * CELL}
                                width={r.w * CELL}
                                height={r.h * CELL}
                                fill={`url(#${id}-lived)`}
                            />
                        ))}
                    </g>
                    {marks.now && (
                        <rect
                            className="zenith-life__now"
                            x={marks.now.x * CELL}
                            y={marks.now.y * CELL}
                            width={DOT}
                            height={DOT}
                            rx={1.5}
                        />
                    )}
                </svg>
            )}
        </div>
    );
};
