import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface IconButtonProps {
    icon: LucideIcon;
    onClick?: () => void;
    tooltip?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'default' | 'ghost' | 'danger';
    disabled?: boolean;
    className?: string;
}

const SIZES = {
    sm: { button: 28, icon: 16 },
    md: { button: 34, icon: 20 },
    lg: { button: 40, icon: 24 },
} as const;

/**
 * Icon-only button with lucide-react icon, tooltip, and variant styles.
 */
export const IconButton: React.FC<IconButtonProps> = ({
    icon: Icon,
    onClick,
    tooltip,
    size = 'md',
    variant = 'default',
    disabled = false,
    className = '',
}) => {
    const dims = SIZES[size];

    return (
        <button
            className={`zenith-icon-btn zenith-icon-btn--${variant} zenith-icon-btn--${size} ${className}`}
            onClick={onClick}
            disabled={disabled}
            aria-label={tooltip}
            title={tooltip}
            style={{ width: dims.button, height: dims.button }}
        >
            <Icon size={dims.icon} />
        </button>
    );
};
