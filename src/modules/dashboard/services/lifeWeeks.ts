import { isoToDate } from '../../../core/calendarDates';
import { daysBetweenIso, toLocalIsoDate } from '../../../core/dateUtils';

/**
 * A life as a grid of weeks: a column per year of it, fifty-two weeks down
 * each. The year runs from birthday to birthday, so a column is a year of the
 * person's life rather than of the calendar, and the week within it is counted
 * from the last birthday — the drift of 52 × 7 against 365 is absorbed at each
 * birthday instead of accumulating across eighty years.
 */

export const WEEKS_PER_YEAR = 52;

export interface LifeWeeks {
    /** Whole years lived. */
    age: number;
    /** Week of the current year of life, 0-based, under 52. */
    week: number;
    /** Weeks lived, the current one included. */
    lived: number;
    total: number;
    fraction: number;
}

/** Leap-day birthdays fall on 28 February in the years without one. */
function birthdayIn(birth: string, year: number): string {
    const [, m, d] = birth.split('-').map(Number);
    const last = new Date(year, m, 0).getDate();
    return toLocalIsoDate(new Date(year, m - 1, Math.min(d, last)));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Null when the birth date is missing, malformed, or still to come. */
export function lifeWeeks(birth: string, years: number, today: string): LifeWeeks | null {
    const value = birth.trim();
    if (!ISO.test(value) || Number.isNaN(isoToDate(value).getTime()) || value > today) return null;
    const span = Math.max(1, Math.round(years));

    const year = isoToDate(today).getFullYear();
    const thisYears = birthdayIn(value, year);
    const last = thisYears <= today ? thisYears : birthdayIn(value, year - 1);
    const age = isoToDate(last).getFullYear() - isoToDate(value).getFullYear();
    const week = Math.min(WEEKS_PER_YEAR - 1, Math.floor(daysBetweenIso(last, today) / 7));

    const total = span * WEEKS_PER_YEAR;
    const lived = Math.min(total, age * WEEKS_PER_YEAR + week + 1);
    return { age, week, lived, total, fraction: lived / total };
}

/** What one mark of the grid stands for. */
export type LifeGrain = 'week' | 'month' | 'year';

export interface LifeGridPlan {
    grain: LifeGrain;
    cols: number;
    rows: number;
    /** A mark's pitch, in px. */
    cell: number;
    /** The count stands beside the grid rather than over it. */
    beside: boolean;
}

/** Marks to a year of life, down a column, at each grain that has columns. */
const MARKS_PER_YEAR: Record<Exclude<LifeGrain, 'year'>, number> = { week: 52, month: 12 };

/** The smallest pitch a mark is still a mark at; under it the grain coarsens. */
const MIN_CELL: Record<Exclude<LifeGrain, 'year'>, number> = { week: 5, month: 4.5 };

/** The largest a mark gets: past this a grid is a wall of tiles. */
const MAX_CELL = 14;

/** Years across, when a mark is a year. */
const YEARS_ACROSS = 20;

/** What the count takes: over the grid (its line and the gap), or beside it. */
const FIGURE_ABOVE_PX = 58;
const FIGURE_BESIDE_PX = 204;

/**
 * The finest grid of a life that fits a room `width` by `height`.
 *
 * Weeks if a week's mark can be five pixels; else months; else years, twenty
 * to a row. At each grain the count goes wherever leaves the marks larger —
 * over a grid that is wide, beside one that is tall. A room not yet measured
 * gets the coarsest plan, which is the one that cannot be wrong for long.
 */
export function lifeGridPlan(span: number, width: number, height: number): LifeGridPlan {
    const years = Math.max(1, Math.round(span));
    if (width > 0 && height > 0) {
        for (const grain of ['week', 'month'] as const) {
            const rows = MARKS_PER_YEAR[grain];
            const above = Math.min(width / years, (height - FIGURE_ABOVE_PX) / rows);
            const beside = Math.min((width - FIGURE_BESIDE_PX) / years, height / rows);
            const cell = Math.max(above, beside);
            if (cell >= MIN_CELL[grain]) {
                return {
                    grain,
                    cols: years,
                    rows,
                    cell: Math.min(MAX_CELL, cell),
                    beside: beside > above,
                };
            }
        }
    }
    const cols = Math.min(years, YEARS_ACROSS);
    const rows = Math.ceil(years / cols);
    const cell =
        width > 0 && height > 0
            ? Math.min(MAX_CELL, width / cols, Math.max(4, (height - FIGURE_ABOVE_PX) / rows))
            : MAX_CELL;
    return { grain: 'year', cols, rows, cell: Math.max(4, cell), beside: false };
}

/** A block of marks, in marks. */
export interface LifeRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * The marks lived, as the fewest rectangles that cover them, and the one that
 * is now. Null for `now` when the life has run past the span drawn.
 */
export function lifeMarks(
    life: LifeWeeks,
    span: number,
    plan: Pick<LifeGridPlan, 'grain' | 'cols' | 'rows'>
): { lived: LifeRect[]; now: LifeRect | null } {
    const years = Math.max(1, Math.round(span));
    const age = Math.min(life.age, years);
    const lived: LifeRect[] = [];

    if (plan.grain === 'year') {
        const fullRows = Math.floor(age / plan.cols);
        const rest = age % plan.cols;
        if (fullRows > 0) lived.push({ x: 0, y: 0, w: plan.cols, h: fullRows });
        if (rest > 0) lived.push({ x: 0, y: fullRows, w: rest, h: 1 });
        return {
            lived,
            now: life.age < years ? { x: rest, y: fullRows, w: 1, h: 1 } : null,
        };
    }

    if (age > 0) lived.push({ x: 0, y: 0, w: age, h: plan.rows });
    if (life.age >= years) return { lived, now: null };
    // How far down this year's column: the week, at this grain.
    const into = Math.min(plan.rows - 1, Math.floor((life.week * plan.rows) / WEEKS_PER_YEAR));
    if (into > 0) lived.push({ x: age, y: 0, w: 1, h: into });
    return { lived, now: { x: age, y: into, w: 1, h: 1 } };
}
