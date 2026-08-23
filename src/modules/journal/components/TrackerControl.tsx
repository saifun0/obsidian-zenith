import React, { type FC } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import {
    SCALE_MAX,
    coerceTrackerValue,
    trackerColor,
    type JournalTracker,
} from '../../../core/journalConfig';
import type { TrackerValue } from '../../../store/journalSlice';

export interface TrackerControlProps {
    tracker: JournalTracker;
    /** What the day currently records, or undefined for "not recorded". */
    value?: TrackerValue;
    /** `null` clears the value; the caller decides how that reaches the note. */
    onChange: (next: TrackerValue | null) => void;
    /** Drop the text label and tighten the spacing, for crowded rails. */
    compact?: boolean;
    /**
     * `row` is the day panel's layout, where the tracker's name has a column of
     * its own: the control drops its own copy of the name, and the check says
     * what it IS rather than what it is called — the name is already there, an
     * arm's length to the left, and repeating it says nothing twice.
     */
    variant?: 'inline' | 'row';
}

/** Tint used by a ticked check / a filled step, legible on both themes. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/**
 * One tracker's control, in the shape its kind calls for:
 *
 * * `check` — a chip that toggles.
 * * `scale` — five steps; clicking the active one clears it, which is the only
 *   route back to "not recorded" and has to stay reachable, because an average
 *   over days you didn't rate is a different number from one that counts them
 *   as neutral.
 * * `number` — a −/+ stepper; stepping below zero clears rather than going
 *   negative, so the same "un-record" gesture exists here too.
 */
export const TrackerControl: FC<TrackerControlProps> = ({
    tracker,
    value,
    onChange,
    compact = false,
    variant = 'inline',
}) => {
    const t = useTranslation();
    const current = coerceTrackerValue(tracker.kind, value);
    const row = variant === 'row';
    const named = !compact && !row;
    const cls = `zenith-tracker zenith-tracker--${tracker.kind} ${compact ? 'is-compact' : ''} ${
        row ? 'is-row' : ''
    }`;

    if (tracker.kind === 'check') {
        const on = current === true;
        return (
            <button
                type="button"
                className={`${cls} zenith-tracker__chip ${on ? 'is-on' : ''}`}
                style={
                    on
                        ? {
                              background: tint(tracker.color, 18),
                              borderColor: tint(tracker.color, 45),
                              color: tracker.color,
                          }
                        : undefined
                }
                aria-pressed={on}
                title={tracker.label}
                onClick={() => onChange(on ? null : true)}
            >
                {on ? <Check size={14} /> : <DynamicIcon name={tracker.icon} size={14} />}
                {named && <span className="zenith-tracker__label">{tracker.label}</span>}
                {row && (
                    <span className="zenith-tracker__label">
                        {t(on ? 'journal.tracker.marked' : 'journal.tracker.mark')}
                    </span>
                )}
            </button>
        );
    }

    if (tracker.kind === 'scale') {
        const score = typeof current === 'number' ? current : undefined;
        return (
            <div className={cls}>
                {!row && (
                    <span className="zenith-tracker__head" title={tracker.label}>
                        <DynamicIcon name={tracker.icon} size={14} style={{ color: tracker.color }} />
                        {named && <span className="zenith-tracker__label">{tracker.label}</span>}
                    </span>
                )}
                <div className="zenith-tracker__steps" role="group" aria-label={tracker.label}>
                    {Array.from({ length: SCALE_MAX }, (_, i) => i + 1).map((step) => {
                        const filled = score !== undefined && step <= score;
                        return (
                            <button
                                key={step}
                                type="button"
                                className={`zenith-tracker__step ${filled ? 'is-active' : ''}`}
                                style={
                                    filled
                                        ? { background: trackerColor(tracker, score) }
                                        : undefined
                                }
                                aria-label={
                                    score === step
                                        ? t('journal.clearValue', { name: tracker.label })
                                        : `${tracker.label}: ${step}`
                                }
                                aria-pressed={score === step}
                                onClick={() => onChange(score === step ? null : step)}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── number ──
    const step = tracker.step && tracker.step > 0 ? tracker.step : 1;
    const amount = typeof current === 'number' ? current : undefined;
    const decimals = Number.isInteger(step) ? 0 : 1;
    // Steps can be fractional, so round to the step's own precision rather than
    // letting 0.1 + 0.2 surface as 0.30000000000000004 in the note.
    const round = (n: number) => Number(n.toFixed(decimals));

    return (
        <div className={cls}>
            {!row && (
                <span className="zenith-tracker__head" title={tracker.label}>
                    <DynamicIcon name={tracker.icon} size={14} style={{ color: tracker.color }} />
                    {named && <span className="zenith-tracker__label">{tracker.label}</span>}
                </span>
            )}
            <div className="zenith-tracker__stepper">
                <button
                    type="button"
                    className="zenith-tracker__step-btn"
                    aria-label={
                        amount === undefined || amount - step < 0
                            ? t('journal.clearValue', { name: tracker.label })
                            : `${tracker.label} −${step}`
                    }
                    onClick={() => {
                        const next = round((amount ?? 0) - step);
                        onChange(amount === undefined || next < 0 ? null : next);
                    }}
                >
                    <Minus size={13} />
                </button>
                <span
                    className={`zenith-tracker__amount ${amount === undefined ? 'is-empty' : ''}`}
                    style={amount !== undefined ? { color: tracker.color } : undefined}
                >
                    {amount === undefined ? t('journal.tracker.unset') : amount}
                    {amount !== undefined && tracker.unit && !compact && (
                        <span className="zenith-tracker__unit">{tracker.unit}</span>
                    )}
                </span>
                <button
                    type="button"
                    className="zenith-tracker__step-btn"
                    aria-label={`${tracker.label} +${step}`}
                    onClick={() => onChange(round((amount ?? 0) + step))}
                >
                    <Plus size={13} />
                </button>
            </div>
        </div>
    );
};
