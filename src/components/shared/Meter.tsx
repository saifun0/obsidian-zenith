import React, { type CSSProperties, type FC } from 'react';

interface MeterProps {
    /** 0–100. Clamped here so no caller has to remember to. */
    percent: number;
    /** `xs` for a card row, `md` (the default) for a view, `lg` for a summary. */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /**
     * What this particular bar is about — a content type's colour, a mood, a
     * status. Left out, it is the accent; at 100% it is the success colour,
     * because "finished" is the one state worth saying in a second colour.
     */
    color?: string;
    className?: string;
    /** A bar with no label beside it needs to say its own number out loud. */
    label?: string;
}

/**
 * How far along something is.
 *
 * Fourteen track/fill pairs drew this: the project card and its widget, the
 * library row and its Continue shelf, the task statistics, the journal's
 * calendar, the sync notice, the prayer rail. They disagreed on height — 3, 4,
 * 5, 6 and 10px — on radius, and on what an empty track is made of, which is
 * why two bars side by side on the dashboard never looked like the same
 * instrument.
 */
export const Meter: FC<MeterProps> = ({ percent, size = 'md', color, className = '', label }) => {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    const done = pct >= 100;
    const style = color ? ({ '--meter': color } as CSSProperties) : undefined;
    return (
        <span
            className={`zenith-meter ${size !== 'md' ? `zenith-meter--${size}` : ''} ${
                done && !color ? 'is-complete' : ''
            } ${className}`}
            style={style}
            role={label ? 'progressbar' : undefined}
            aria-valuenow={label ? pct : undefined}
            aria-valuemin={label ? 0 : undefined}
            aria-valuemax={label ? 100 : undefined}
            aria-label={label}
        >
            <span className="zenith-meter__fill" style={{ width: `${pct}%` }} />
        </span>
    );
};
