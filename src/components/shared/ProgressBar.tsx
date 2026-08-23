import React from 'react';

// ── Types ────────────────────────────────────────────

interface ProgressBarProps {
    /** Current value */
    value: number;
    /** Maximum value (default: 100) */
    max?: number;
    /** Optional label displayed above the bar */
    label?: string;
    /** CSS color override for the fill */
    color?: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Enable pulse animation on incomplete bars */
    animated?: boolean;
}

// ── Size Map ─────────────────────────────────────────

const SIZE_HEIGHT: Record<string, string> = {
    sm: '4px',
    md: '8px',
    lg: '12px',
};

// ── Component ────────────────────────────────────────

export const ProgressBar: React.FC<ProgressBarProps> = ({
    value,
    max = 100,
    label,
    color,
    size = 'md',
    animated = false,
}) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const height = SIZE_HEIGHT[size] ?? SIZE_HEIGHT.md;

    return (
        <div className="zenith-progress-bar">
            {label && (
                <div className="zenith-progress-bar__header">
                    <span className="zenith-progress-bar__label">{label}</span>
                    <span className="zenith-progress-bar__value">{Math.round(pct)}%</span>
                </div>
            )}
            <div
                className="zenith-progress-bar__track"
                style={{ height }}
            >
                <div
                    className={`zenith-progress-bar__fill${animated && pct < 100 ? ' zenith-progress-bar__fill--animated' : ''}`}
                    style={{
                        width: `${pct}%`,
                        ...(color ? { backgroundColor: color } : {}),
                    }}
                />
            </div>
        </div>
    );
};
