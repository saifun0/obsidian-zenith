import React, { useEffect, useRef, type CSSProperties, type FC } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import {
    SCALE_MAX,
    coerceTrackerValue,
    trackerColor,
    trackerGoal,
    type JournalTracker,
} from '../../../core/journalConfig';
import type { TrackerValue } from '../../../store/journalSlice';

export interface PickerAnchor {
    tracker: JournalTracker;
    date: string;
    value?: TrackerValue;
    /** Where the cell is, relative to the grid's own box. */
    x: number;
    y: number;
    /** Open downwards — the cell is too near the top for a popover above it. */
    below: boolean;
}

interface HabitValuePickerProps {
    anchor: PickerAnchor;
    /**
     * `keepOpen` marks a value that is on the way to another one — the steps of
     * a stepper. Reaching fifteen reps five at a time is three taps, and having
     * to reopen the popover between each of them was the whole complaint.
     */
    onPick: (next: TrackerValue | null, keepOpen: boolean) => void;
    onClose: () => void;
}

/**
 * The value editor for one day of one tracker.
 *
 * A grid cell can only cycle: click, click, click until the number is right,
 * which is fine for a tick and absurd for "sixty reps, step five". So a scale
 * offers its five steps and a number offers a stepper with its target one
 * button away — one gesture instead of twelve.
 *
 * It is positioned against the grid rather than portalled to the body: the
 * scroll container clips anything inside it (a horizontal `overflow` forces the
 * vertical one), and a portal would leave the `--zenith-*` tokens behind.
 */
export const HabitValuePicker: FC<HabitValuePickerProps> = ({ anchor, onPick, onClose }) => {
    const t = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const { tracker, value } = anchor;
    const current = coerceTrackerValue(tracker.kind, value);

    // Escape in the BUBBLE phase, so a control that wants the key first still
    // gets it; capture here would swallow it from anything nested.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
        };
    }, [onClose]);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    const step = tracker.step && tracker.step > 0 ? tracker.step : 1;
    const goal = trackerGoal(tracker);
    const decimals = Number.isInteger(step) ? 0 : 1;
    const round = (n: number) => Number(n.toFixed(decimals));
    const amount = typeof current === 'number' ? current : 0;

    return (
        <div
            className={`zenith-hpick ${anchor.below ? 'is-below' : ''}`}
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-label={`${tracker.label} · ${anchor.date}`}
            style={
                {
                    left: `${anchor.x}px`,
                    top: `${anchor.y}px`,
                    '--hmon-color': tracker.color,
                } as CSSProperties
            }
        >
            <span className="zenith-hpick__head">
                <span className="zenith-hpick__label">{tracker.label}</span>
                <span className="zenith-hpick__date">{anchor.date.slice(8)}</span>
            </span>

            {tracker.kind === 'scale' ? (
                <div className="zenith-hpick__steps">
                    {Array.from({ length: SCALE_MAX }, (_, i) => i + 1).map((score) => {
                        const on = typeof current === 'number' && score <= current;
                        return (
                            <button
                                key={score}
                                type="button"
                                className={`zenith-hpick__step ${on ? 'is-on' : ''} ${
                                    score >= goal ? 'is-goal' : ''
                                }`}
                                style={on ? { background: trackerColor(tracker, current) } : undefined}
                                aria-label={`${tracker.label}: ${score}`}
                                aria-pressed={current === score}
                                // Clicking the score you're already on clears it —
                                // the only route back to "not recorded", and the
                                // same gesture the day panel's steps use. A score
                                // is a decision, so it also closes.
                                onClick={() => onPick(current === score ? null : score, false)}
                            >
                                {score}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="zenith-hpick__stepper">
                    <button
                        type="button"
                        className="zenith-hpick__round"
                        aria-label={`${tracker.label} −${step}`}
                        onClick={() =>
                            onPick(amount - step <= 0 ? null : round(amount - step), true)
                        }
                    >
                        <Minus size={14} />
                    </button>
                    <span className="zenith-hpick__amount">
                        {current === undefined ? '—' : amount}
                        {tracker.unit && <span className="zenith-hpick__unit">{tracker.unit}</span>}
                    </span>
                    <button
                        type="button"
                        className="zenith-hpick__round"
                        aria-label={`${tracker.label} +${step}`}
                        onClick={() => onPick(round(amount + step), true)}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            )}

            <div className="zenith-hpick__foot">
                {/* One click to the value that actually counts as done — the
                    reason a stepper alone wasn't enough. */}
                {goal > 0 && (
                    <button
                        type="button"
                        className="zenith-hpick__action"
                        onClick={() => onPick(goal, false)}
                    >
                        <Check size={12} />
                        {t('habits.pickGoal', { value: goal })}
                    </button>
                )}
                <button
                    type="button"
                    className="zenith-hpick__action"
                    disabled={current === undefined}
                    onClick={() => onPick(null, false)}
                >
                    <X size={12} />
                    {t('habits.pickClear')}
                </button>
            </div>
        </div>
    );
};
