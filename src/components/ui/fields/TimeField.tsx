import React, { useEffect, useRef, useState, type FC } from 'react';
import { Clock } from 'lucide-react';
import { Popover, usePopover } from '../../shared/Popover';
import { useTranslation } from '../../../core/i18n';
import { isCoarsePointer, revealIn } from './pointer';

export interface TimeFieldProps {
    /** `HH:MM`, or `''` for no time. */
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Minutes between the picker's rows, and what the arrow keys add. */
    step?: number;
    size?: 'sm' | 'md';
    className?: string;
    id?: string;
    title?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Read a typed time the way people type one: `9`, `930`, `0930`, `9:30`,
 * `9.30`, `9,30` and `9 30` are all half past nine — the comma because it is
 * what the Russian numeric keypad on a phone has instead of a colon. `''` means no time; `null` means
 * the text is not a time at all.
 */
export function parseTimeOfDay(raw: string): string | null {
    const text = raw.trim();
    if (!text) return '';
    let h: number;
    let m: number;
    const split = text.match(/^(\d{1,2})\s*[:.,\-\s]\s*(\d{1,2})$/);
    if (split) {
        h = Number(split[1]);
        m = Number(split[2]);
    } else if (/^\d{1,4}$/.test(text)) {
        // Bare digits: the last two are minutes once there are more than two.
        h = Number(text.length <= 2 ? text : text.slice(0, -2));
        m = text.length <= 2 ? 0 : Number(text.slice(-2));
    } else {
        return null;
    }
    if (h > 23 || m > 59) return null;
    return `${pad(h)}:${pad(m)}`;
}

/** `HH:MM` moved by `minutes`, wrapping round midnight. */
function shift(value: string, minutes: number): string {
    const [h, m] = (value || '00:00').split(':').map(Number);
    const total = ((((h ?? 0) * 60 + (m ?? 0) + minutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * A time of day, typed or picked.
 *
 * `<input type="time">` renders a 12- or 24-hour mask depending on the
 * operating system's locale rather than Zenith's, a spinner on Windows and a
 * wheel on iOS. This is a plain field that accepts the time however it is
 * typed — the numeric keypad comes up on a phone — with a clock button for
 * picking it from two columns instead.
 *
 * The arrow keys step it like the native one did, by `step` minutes.
 */
export const TimeField: FC<TimeFieldProps> = ({
    value,
    onChange,
    placeholder = '--:--',
    disabled,
    step = 5,
    size = 'md',
    className = '',
    id,
    title,
    ...aria
}) => {
    const t = useTranslation();
    const pop = usePopover<HTMLButtonElement>();
    const [draft, setDraft] = useState(value);
    // Follow the value when it changes from outside — during render, the way
    // React asks for state derived from a prop, not in an effect a frame late.
    const [seen, setSeen] = useState(value);
    if (value !== seen) {
        setSeen(value);
        setDraft(value);
    }

    const commit = () => {
        const parsed = parseTimeOfDay(draft);
        if (parsed === null) {
            setDraft(value);
            return;
        }
        setDraft(parsed);
        if (parsed !== value) onChange(parsed);
    };

    return (
        <div
            className={[
                'zenith-input zenith-timefield',
                size === 'sm' ? 'zenith-input--sm' : '',
                pop.open ? 'is-open' : '',
                disabled ? 'is-disabled' : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            title={title}
        >
            <input
                type="text"
                id={id}
                inputMode="numeric"
                autoComplete="off"
                maxLength={5}
                placeholder={placeholder}
                value={draft}
                disabled={disabled}
                aria-label={aria['aria-label']}
                aria-labelledby={aria['aria-labelledby']}
                aria-describedby={aria['aria-describedby']}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit();
                    } else if (e.altKey && e.key === 'ArrowDown') {
                        e.preventDefault();
                        pop.setOpen(true);
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const base = parseTimeOfDay(draft) || value;
                        const next = shift(base, e.key === 'ArrowUp' ? step : -step);
                        setDraft(next);
                        onChange(next);
                    }
                }}
            />
            <button
                ref={pop.anchorProps.ref}
                type="button"
                className="zenith-field-btn"
                aria-label={t('fields.time.pick')}
                title={t('fields.time.pick')}
                aria-haspopup="dialog"
                aria-expanded={pop.open}
                disabled={disabled}
                onClick={pop.toggle}
            >
                <Clock size={14} />
            </button>

            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={isCoarsePointer() ? 200 : 164}
                height={300}
                align="end"
                role="dialog"
                label={t('fields.time.pick')}
                className="zenith-timepick"
            >
                <TimePicker
                    value={parseTimeOfDay(draft) || value}
                    step={step}
                    onChange={(next, done) => {
                        setDraft(next);
                        onChange(next);
                        if (done) {
                            pop.close();
                            pop.anchor?.focus();
                        }
                    }}
                />
            </Popover>
        </div>
    );
};

const TimePicker: FC<{
    value: string;
    step: number;
    /** `done` once a minute is picked: the hour alone is half an answer. */
    onChange: (value: string, done: boolean) => void;
}> = ({ value, step, onChange }) => {
    const t = useTranslation();
    const hoursCol = useRef<HTMLDivElement>(null);
    const minutesCol = useRef<HTMLDivElement>(null);

    const [h, m] = value ? value.split(':').map(Number) : [NaN, NaN];
    const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
    // A time typed off the grid — 09:07 — still shows as chosen.
    if (Number.isFinite(m) && !minutes.includes(m)) minutes.push(m);
    minutes.sort((a, b) => a - b);

    // Open on the chosen hour and minute, centred, rather than at midnight.
    useEffect(() => {
        revealIn(hoursCol.current, hoursCol.current?.querySelector('.is-selected') ?? null, true);
        revealIn(
            minutesCol.current,
            minutesCol.current?.querySelector('.is-selected') ?? null,
            true
        );
    }, []);

    const hourNow = new Date().getHours();

    return (
        <>
            <div className="zenith-timepick__cols">
                <div>
                    <div className="zenith-timepick__head">{t('fields.time.hours')}</div>
                    <div className="zenith-timepick__col" ref={hoursCol}>
                        {Array.from({ length: 24 }, (_, hour) => (
                            <button
                                key={hour}
                                type="button"
                                className={`zenith-timepick__cell${hour === h ? ' is-selected' : ''}`}
                                aria-pressed={hour === h}
                                onClick={() =>
                                    onChange(
                                        `${pad(hour)}:${pad(Number.isFinite(m) ? m : 0)}`,
                                        false
                                    )
                                }
                            >
                                {pad(hour)}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="zenith-timepick__head">{t('fields.time.minutes')}</div>
                    <div className="zenith-timepick__col" ref={minutesCol}>
                        {minutes.map((minute) => (
                            <button
                                key={minute}
                                type="button"
                                className={`zenith-timepick__cell${minute === m ? ' is-selected' : ''}`}
                                aria-pressed={minute === m}
                                onClick={() =>
                                    onChange(
                                        `${pad(Number.isFinite(h) ? h : hourNow)}:${pad(minute)}`,
                                        true
                                    )
                                }
                            >
                                {pad(minute)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {value && (
                <button
                    type="button"
                    className="zenith-timepick__clear"
                    onClick={() => onChange('', true)}
                >
                    {t('common.clear')}
                </button>
            )}
        </>
    );
};
