import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { useTranslation } from '../../core/i18n';

interface StarRatingProps {
    /** Current rating on the 0–10 scale. */
    value: number;
    onChange?: (value: number) => void;
    /** Star glyph size in px. */
    size?: number;
    /** Render the numeric "7/10" readout next to the stars. */
    showValue?: boolean;
    /** Display only — no hover, no clicks. */
    readOnly?: boolean;
    ariaLabel?: string;
}

const MAX = 10;
const STARS = 5;
const GOLD = '#f59e0b';

/**
 * StarRating — a 0–10 rating on five stars, where each *half* of a star is its
 * own target, so odd scores (7/10) are reachable by clicking the left half of
 * the fourth star. The old control only had whole stars, which silently made
 * every odd value unreachable.
 *
 * Half-filled stars are drawn by overlaying a clipped gold star on a grey one —
 * lucide has no half-star glyph, and a CSS `width` clip keeps it crisp at any
 * size. Arrow keys adjust by one point for keyboard users.
 */
export const StarRating: React.FC<StarRatingProps> = ({
    value,
    onChange,
    size = 20,
    showValue = false,
    readOnly = false,
    ariaLabel = 'Rating',
}) => {
    const t = useTranslation();
    const [hover, setHover] = useState<number | null>(null);
    const interactive = !readOnly && !!onChange;
    const shown = hover ?? value;

    const set = (next: number) => {
        if (!interactive) return;
        const clamped = Math.min(MAX, Math.max(0, next));
        // Clicking the exact current value clears it — the only way back to 0.
        onChange?.(clamped === value ? 0 : clamped);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!interactive) return;
        const step = e.shiftKey ? 2 : 1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange?.(Math.min(MAX, value + step));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange?.(Math.max(0, value - step));
        } else if (e.key === 'Home') {
            e.preventDefault();
            onChange?.(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            onChange?.(MAX);
        }
    };

    return (
        <div className={`zenith-stars ${interactive ? 'is-interactive' : ''}`}>
            <div
                className="zenith-stars__row"
                role={interactive ? 'slider' : 'img'}
                tabIndex={interactive ? 0 : undefined}
                aria-label={ariaLabel}
                aria-valuemin={interactive ? 0 : undefined}
                aria-valuemax={interactive ? MAX : undefined}
                aria-valuenow={interactive ? value : undefined}
                aria-valuetext={`${value} of ${MAX}`}
                onKeyDown={onKeyDown}
                onMouseLeave={() => setHover(null)}
            >
                {Array.from({ length: STARS }, (_, i) => {
                    const points = (i + 1) * 2; // this star's full value
                    // 0 = empty, 1 = half, 2 = full
                    const fill = Math.min(2, Math.max(0, shown - i * 2));
                    return (
                        <span key={i} className="zenith-stars__star" style={{ width: size, height: size }}>
                            <Star size={size} fill="none" stroke="var(--zenith-text-faint, #666)" />
                            {fill > 0 && (
                                <span
                                    className="zenith-stars__fill"
                                    style={{ width: `${(fill / 2) * 100}%` }}
                                    aria-hidden="true"
                                >
                                    <Star size={size} fill={GOLD} stroke={GOLD} />
                                </span>
                            )}
                            {interactive && (
                                <>
                                    <span
                                        className="zenith-stars__hit zenith-stars__hit--left"
                                        role="button"
                                        aria-label={`Set rating to ${points - 1}`}
                                        onMouseEnter={() => setHover(points - 1)}
                                        onClick={() => set(points - 1)}
                                    />
                                    <span
                                        className="zenith-stars__hit zenith-stars__hit--right"
                                        role="button"
                                        aria-label={`Set rating to ${points}`}
                                        onMouseEnter={() => setHover(points)}
                                        onClick={() => set(points)}
                                    />
                                </>
                            )}
                        </span>
                    );
                })}
            </div>

            {showValue && (
                <span className="zenith-stars__value">
                    {shown > 0 ? `${shown}/${MAX}` : '—'}
                </span>
            )}

            {interactive && value > 0 && (
                <button
                    type="button"
                    className="zenith-stars__clear"
                    aria-label={t('a11y.clearRating')}
                    title={t('a11y.clearRating')}
                    onClick={() => onChange?.(0)}
                >
                    <X size={12} />
                </button>
            )}
        </div>
    );
};
