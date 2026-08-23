import React from 'react';

// ── Types ────────────────────────────────────────────

interface BadgeProps {
    /** Text content */
    text: string;
    /** Color variant */
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
    /** Size variant */
    size?: 'sm' | 'md';
    /** Show a leading status dot */
    dot?: boolean;
}

// ── Component ────────────────────────────────────────

export const Badge: React.FC<BadgeProps> = ({
    text,
    variant = 'default',
    size = 'sm',
    dot = false,
}) => {
    const classes = [
        'zenith-badge',
        `zenith-badge--${variant}`,
        `zenith-badge--${size}`,
    ].join(' ');

    return (
        <span className={classes}>
            {dot && <span className="zenith-badge__dot" />}
            {text}
        </span>
    );
};
