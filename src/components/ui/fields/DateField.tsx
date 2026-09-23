import React, { useEffect, useRef, useState, type FC } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, usePopover } from '../../shared/Popover';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { getTodayString } from '../../../core/dateUtils';
import {
    addDays,
    addMonths,
    isoToDate,
    monthGrid,
    monthLabel,
    sameMonth,
    startOfWeek,
    weekdayLabels,
} from '../../../core/calendarDates';
import { isCoarsePointer } from './pointer';

export interface DateFieldProps {
    /** `YYYY-MM-DD`, or `''` for no date. */
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Offer to empty the field. On by default: most dates here are optional. */
    clearable?: boolean;
    size?: 'sm' | 'md';
    className?: string;
    id?: string;
    title?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "сентябрь 2026 г." → "Сентябрь 2026 г.". Only the first letter: CSS
 * `capitalize` raises every word, and the Russian year suffix came out "Г.".
 */
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * A date, picked from Zenith's own calendar.
 *
 * `<input type="date">` is the most platform-shaped control there is: a
 * locale-mangled `dd.mm.yyyy` mask with a Chromium popup on Windows, a wheel on
 * iOS, and a text box on some Android WebViews — and on none of them does the
 * week start where the journal and the calendar view say it does. The field
 * here shows the date the way the rest of Zenith writes one, and the calendar
 * is laid out by the same week-start setting as every other calendar in it.
 *
 * The value is the same `YYYY-MM-DD` string the native input produced, so
 * callers swapped one for the other without touching what they store.
 */
export const DateField: FC<DateFieldProps> = ({
    value,
    onChange,
    placeholder,
    disabled,
    clearable = true,
    size = 'md',
    className = '',
    id,
    title,
    ...aria
}) => {
    const t = useTranslation();
    const pop = usePopover<HTMLButtonElement>();
    const valid = ISO.test(value) ? value : '';

    const label = valid
        ? new Intl.DateTimeFormat(t.locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          }).format(isoToDate(valid))
        : (placeholder ?? t('fields.date.placeholder'));

    const coarse = isCoarsePointer();

    return (
        <div
            className={[
                'zenith-input zenith-datefield',
                size === 'sm' ? 'zenith-input--sm' : '',
                pop.open ? 'is-open' : '',
                disabled ? 'is-disabled' : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <button
                ref={pop.anchorProps.ref}
                type="button"
                id={id}
                title={title}
                className="zenith-datefield__open"
                aria-haspopup="dialog"
                aria-expanded={pop.open}
                aria-label={aria['aria-label']}
                aria-labelledby={aria['aria-labelledby']}
                aria-describedby={aria['aria-describedby']}
                disabled={disabled}
                onClick={pop.toggle}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        pop.setOpen(true);
                    }
                }}
            >
                <CalendarDays size={15} className="zenith-field-icon" aria-hidden="true" />
                <span className={`zenith-datefield__value${valid ? '' : ' is-placeholder'}`}>
                    {label}
                </span>
            </button>
            {clearable && valid && !disabled && (
                <button
                    type="button"
                    className="zenith-field-btn"
                    aria-label={t('common.clear')}
                    title={t('common.clear')}
                    onClick={() => onChange('')}
                >
                    <X size={13} />
                </button>
            )}

            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={coarse ? 320 : 276}
                height={coarse ? 392 : 316}
                role="dialog"
                label={aria['aria-label'] ?? t('fields.date.placeholder')}
                className="zenith-datepick"
            >
                <Calendar
                    value={valid}
                    clearable={clearable}
                    onPick={(iso) => {
                        pop.close();
                        pop.anchor?.focus();
                        onChange(iso);
                    }}
                />
            </Popover>
        </div>
    );
};

/**
 * The month grid. Mounted only while open, so it starts on the chosen date's
 * month every time rather than wherever it was last left.
 */
const Calendar: FC<{ value: string; clearable: boolean; onPick: (iso: string) => void }> = ({
    value,
    clearable,
    onPick,
}) => {
    const t = useTranslation();
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const today = getTodayString();
    const [focus, setFocus] = useState(value || today);
    const grid = useRef<HTMLDivElement>(null);
    // Arrow keys move the focus; only a real move should pull it into view,
    // not every render — the first one included, which is the open.
    const moved = useRef(true);

    const days = monthGrid(focus, weekStart);
    const names = weekdayLabels(t.locale, weekStart);

    useEffect(() => {
        if (!moved.current) return;
        moved.current = false;
        grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus();
    }, [focus]);

    const go = (iso: string) => {
        moved.current = true;
        setFocus(iso);
    };

    const onKey = (e: React.KeyboardEvent) => {
        const moves: Record<string, () => string> = {
            ArrowLeft: () => addDays(focus, -1),
            ArrowRight: () => addDays(focus, 1),
            ArrowUp: () => addDays(focus, -7),
            ArrowDown: () => addDays(focus, 7),
            PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
            PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
            Home: () => startOfWeek(focus, weekStart),
            End: () => addDays(startOfWeek(focus, weekStart), 6),
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        go(move());
    };

    return (
        <>
            <div className="zenith-datepick__head">
                <button
                    type="button"
                    className="zenith-datepick__nav"
                    aria-label={t('fields.date.prevMonth')}
                    onClick={() => setFocus(addMonths(focus, -1))}
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="zenith-datepick__title" aria-live="polite">
                    {capitalize(monthLabel(focus, t.locale))}
                </span>
                <button
                    type="button"
                    className="zenith-datepick__nav"
                    aria-label={t('fields.date.nextMonth')}
                    onClick={() => setFocus(addMonths(focus, 1))}
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Plain buttons rather than an ARIA grid: each says its whole date,
                which is what a grid's row and column headers would have been for. */}
            <div className="zenith-datepick__grid" ref={grid} onKeyDown={onKey}>
                {names.map((name) => (
                    <span key={name} className="zenith-datepick__dow" aria-hidden="true">
                        {name}
                    </span>
                ))}
                {days.map((iso) => {
                    const classes = [
                        'zenith-datepick__day',
                        sameMonth(iso, focus) ? '' : 'is-outside',
                        iso === today ? 'is-today' : '',
                        iso === value ? 'is-selected' : '',
                    ]
                        .filter(Boolean)
                        .join(' ');
                    return (
                        <button
                            key={iso}
                            type="button"
                            data-iso={iso}
                            className={classes}
                            aria-pressed={iso === value}
                            aria-current={iso === today ? 'date' : undefined}
                            aria-label={new Intl.DateTimeFormat(t.locale, {
                                dateStyle: 'full',
                            }).format(isoToDate(iso))}
                            // One stop for the whole month; the arrows do the rest.
                            tabIndex={iso === focus ? 0 : -1}
                            onClick={() => onPick(iso)}
                        >
                            {isoToDate(iso).getDate()}
                        </button>
                    );
                })}
            </div>

            <div className="zenith-datepick__foot">
                <button
                    type="button"
                    className="zenith-datepick__link"
                    onClick={() => onPick(today)}
                >
                    {t('fields.date.today')}
                </button>
                {clearable && value && (
                    <button
                        type="button"
                        className="zenith-datepick__link"
                        onClick={() => onPick('')}
                    >
                        {t('common.clear')}
                    </button>
                )}
            </div>
        </>
    );
};
