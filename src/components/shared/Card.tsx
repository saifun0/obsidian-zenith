import React from 'react';

// ── Types ────────────────────────────────────────────

interface CardProps {
    children: React.ReactNode;
    /** Additional CSS class */
    className?: string;
    /** Enable hover lift effect */
    hoverable?: boolean;
    /** Inner padding size */
    padding?: 'none' | 'sm' | 'md' | 'lg';
    /** Click handler (makes the card interactive) */
    onClick?: () => void;
}

// ── Component ────────────────────────────────────────

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    hoverable = false,
    padding = 'md',
    onClick,
}) => {
    const classes = [
        'zenith-card',
        `zenith-card--pad-${padding}`,
        hoverable ? 'zenith-card--hoverable' : '',
        onClick ? 'zenith-card--clickable' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes} onClick={onClick} role={onClick ? 'button' : undefined}>
            {children}
        </div>
    );
};
