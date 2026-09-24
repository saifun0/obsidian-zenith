import React, { useMemo, type CSSProperties, type FC } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import {
    SCALE_COLORS,
    SCALE_MAX,
    coerceTrackerValue,
    trackerColor,
    trackerFill,
    type JournalTracker,
} from '../../../core/journalConfig';
import type { JournalEntry } from '../../../store/journalSlice';
import { Dropdown } from '../../../components/ui/fields';

/** One cell's look: its colour and how strongly it is drawn, or nothing recorded. */
export interface Pixel {
    date: string;
    color: string | null;
    strength: number;
}

/** Every date of a year, month by month — twelve rows of up to 31. */
export function yearMonths(year: number): string[][] {
    return Array.from({ length: 12 }, (_, m) => {
        const count = new Date(year, m + 1, 0).getDate();
        return Array.from(
            { length: count },
            (_, d) => `${year}-${String(m + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
        );
    });
}

/**
 * A day's pixel for one tracker.
 *
 * A day with nothing recorded is neutral — not the colour of a bad day. A
 * year with gaps in it reads as a year with gaps, not as a year of misery.
 */
export function pixelFor(
    tracker: JournalTracker,
    entry: JournalEntry | undefined,
    date: string
): Pixel {
    const raw = entry?.values[tracker.id];
    const value = coerceTrackerValue(tracker.kind, raw);
    if (value === undefined) return { date, color: null, strength: 0 };
    if (tracker.kind === 'scale') return { date, color: trackerColor(tracker, value), strength: 1 };
    return { date, color: tracker.color, strength: Math.max(0.25, trackerFill(tracker, raw)) };
}

interface YearPixelsProps {
    year: number;
    byDate: Map<string, JournalEntry>;
    /** Trackers the year can be drawn by. */
    trackers: JournalTracker[];
    tracker: JournalTracker | undefined;
    selected: string;
    today: string;
    onSelect: (date: string) => void;
    onYear: (year: number) => void;
    onTracker: (id: string) => void;
    /** Back to the month. */
    onMonth: () => void;
}

/**
 * The year in pixels: every day a square, coloured by one tracker — the mood,
 * unless another is chosen.
 *
 * Twelve rows, one per month, so the same day of every month lines up in a
 * column and a season shows as a band. Unrecorded days stay neutral. A click
 * selects the day, as the month does.
 */
export const YearPixels: FC<YearPixelsProps> = ({
    year,
    byDate,
    trackers,
    tracker,
    selected,
    today,
    onSelect,
    onYear,
    onTracker,
    onMonth,
}) => {
    const t = useTranslation();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const months = useMemo(() => yearMonths(year), [year]);
    const monthName = new Intl.DateTimeFormat(locale, { month: 'narrow' });

    return (
        <div className="zenith-jcal zenith-jyear">
            <div className="zenith-jcal__head">
                <button
                    className="zenith-jcal__nav"
                    onClick={() => onYear(year - 1)}
                    aria-label={t('journal.year.prev')}
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    className="zenith-jcal__month"
                    onClick={() => onYear(Number(today.slice(0, 4)))}
                    title={t('journal.year.this')}
                >
                    {year}
                </button>
                <button
                    className="zenith-jcal__nav"
                    onClick={() => onYear(year + 1)}
                    aria-label={t('journal.year.next')}
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    className="zenith-jcal__nav zenith-jcal__scale"
                    onClick={onMonth}
                    title={t('journal.year.month')}
                    aria-label={t('journal.year.month')}
                >
                    <CalendarDays size={15} />
                </button>
            </div>

            <div className="zenith-jyear__grid" role="grid" aria-label={String(year)}>
                {months.map((days, m) => (
                    <div className="zenith-jyear__row" role="row" key={m}>
                        <span className="zenith-jyear__month" aria-hidden="true">
                            {monthName.format(new Date(year, m, 1))}
                        </span>
                        {days.map((date) => {
                            const pixel = tracker
                                ? pixelFor(tracker, byDate.get(date), date)
                                : { date, color: null, strength: 0 };
                            const future = date > today;
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    role="gridcell"
                                    className={[
                                        'zenith-jyear__px',
                                        pixel.color ? 'is-filled' : '',
                                        future ? 'is-future' : '',
                                        date === selected ? 'is-selected' : '',
                                        date === today ? 'is-today' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    style={
                                        pixel.color
                                            ? ({
                                                  '--jyear-color': pixel.color,
                                                  '--jyear-strength': pixel.strength,
                                              } as CSSProperties)
                                            : undefined
                                    }
                                    title={date}
                                    aria-label={date}
                                    aria-selected={date === selected}
                                    onClick={() => onSelect(date)}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="zenith-jcal__foot zenith-jyear__foot">
                {trackers.length > 1 && tracker && (
                    <Dropdown
                        size="sm"
                        value={tracker.id}
                        aria-label={t('journal.year.by')}
                        options={trackers.map((tr) => ({ value: tr.id, label: tr.label }))}
                        onChange={onTracker}
                    />
                )}
                {tracker?.kind === 'scale' && (
                    <span className="zenith-jyear__legend" aria-hidden="true">
                        {Array.from({ length: SCALE_MAX }, (_, i) => (
                            <span
                                key={i}
                                className="zenith-jyear__legend-px"
                                style={{ background: SCALE_COLORS[i + 1] }}
                            />
                        ))}
                    </span>
                )}
                <span className="zenith-jyear__hint">{t('journal.year.neutral')}</span>
            </div>
        </div>
    );
};
