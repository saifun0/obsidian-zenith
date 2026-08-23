import React from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { progressPercent, type ProgressValue } from '../services/progress';
import { useTranslation } from '../../../core/i18n';

interface ProgressControlProps {
    value: ProgressValue;
    onChange: (next: ProgressValue) => void;
    /** "pages", "episodes", "chapters" … drives the labels. */
    unit: string;
    /** Compact variant for the add form (no "mark finished" shortcut). */
    compact?: boolean;
    /** Disable the total input (e.g. while a provider is filling it in). */
    idPrefix?: string;
}

/**
 * ProgressControl — "88 / 320 pages" as an actual control: two number inputs, a
 * bar, −/+ steppers and a one-click "finished".
 *
 * Progress used to be a free-text field, so it couldn't be shown as a bar,
 * incremented, or compared. Here the numbers stay editable (type 88 directly)
 * while the common action — "I watched one more episode" — is a single click.
 */
export const ProgressControl: React.FC<ProgressControlProps> = ({
    value,
    onChange,
    unit,
    compact = false,
    idPrefix = 'progress',
}) => {
    const t = useTranslation();
    const pct = progressPercent(value);
    const total = value.total;

    const setCurrent = (n: number) => {
        const clamped = Math.max(0, total ? Math.min(total, n) : n);
        onChange({ ...value, current: clamped });
    };

    const setTotal = (raw: string) => {
        const n = Number(raw);
        const next = Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
        onChange({ current: next ? Math.min(value.current, next) : value.current, total: next });
    };

    return (
        <div className={`zenith-progress-control ${compact ? 'is-compact' : ''}`}>
            <div className="zenith-progress-control__row">
                <button
                    type="button"
                    className="zenith-progress-control__step"
                    aria-label={t('content.progress.less', { unit })}
                    disabled={value.current <= 0}
                    onClick={() => setCurrent(value.current - 1)}
                >
                    <Minus size={14} />
                </button>

                <div className="zenith-progress-control__inputs">
                    <input
                        id={`${idPrefix}-current`}
                        type="number"
                        min={0}
                        max={total || undefined}
                        inputMode="numeric"
                        className="zenith-progress-control__num"
                        aria-label={t('content.progress.done', { unit })}
                        value={value.current}
                        onChange={(e) => setCurrent(Math.round(Number(e.target.value) || 0))}
                    />
                    <span className="zenith-progress-control__sep">/</span>
                    <input
                        id={`${idPrefix}-total`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="zenith-progress-control__num"
                        aria-label={t('content.progress.total', { unit })}
                        placeholder="?"
                        value={total ?? ''}
                        onChange={(e) => setTotal(e.target.value)}
                    />
                    <span className="zenith-progress-control__unit">{unit}</span>
                </div>

                <button
                    type="button"
                    className="zenith-progress-control__step"
                    aria-label={t('content.progress.more', { unit })}
                    disabled={!!total && value.current >= total}
                    onClick={() => setCurrent(value.current + 1)}
                >
                    <Plus size={14} />
                </button>

                {!compact && !!total && value.current < total && (
                    <button
                        type="button"
                        className="zenith-progress-control__finish"
                        onClick={() => setCurrent(total)}
                    >
                        <Check size={13} /> {t('content.progress.finished')}
                    </button>
                )}
            </div>

            {pct != null && (
                <div className="zenith-progress-control__meter">
                    <div className="zenith-progress-control__track">
                        <div className="zenith-progress-control__fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="zenith-progress-control__pct">{Math.round(pct)}%</span>
                </div>
            )}
        </div>
    );
};
