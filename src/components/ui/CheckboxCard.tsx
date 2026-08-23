import React from 'react';
import { Box, Check, Settings2 } from 'lucide-react';
import { DynamicIcon } from '../shared/DynamicIcon';

interface CheckboxCardProps {
    title: string;
    description: string;
    iconName?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** When provided, renders a settings (gear) button that calls this. */
    onSettings?: () => void;
}

/**
 * A module tile: icon, name, description, an on/off state and a way into its
 * settings.
 *
 * Laid out as a tile rather than a full-width row because there are seven
 * built-in modules and a list of them fills the screen with mostly empty space.
 * The icon leads the header instead of sitting wedged between the checkbox and
 * the title, where it read as decoration attached to neither.
 */
export const CheckboxCard: React.FC<CheckboxCardProps> = ({
    title,
    description,
    iconName,
    checked,
    onChange,
    onSettings,
}) => (
    <label className={`zenith-checkbox-card ${checked ? 'is-checked' : ''}`}>
        <input
            type="checkbox"
            className="zenith-checkbox-card__input"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
        />

        <div className="zenith-checkbox-card__head">
            <span className="zenith-checkbox-card__icon">
                {/* Shared resolver rather than a second kebab→Pascal lookup of
                    its own, which is what this used to carry. */}
                <DynamicIcon name={iconName ?? ''} fallback={Box} size={18} strokeWidth={2} />
            </span>

            {onSettings && (
                <button
                    type="button"
                    className="zenith-checkbox-card__settings"
                    aria-label={`${title} settings`}
                    title="Settings"
                    onClick={(e) => {
                        // Don't let the click toggle the surrounding label.
                        e.preventDefault();
                        e.stopPropagation();
                        onSettings();
                    }}
                >
                    <Settings2 size={15} />
                </button>
            )}

            <span className="zenith-checkbox-card__indicator">
                {checked && <Check size={13} strokeWidth={3} />}
            </span>
        </div>

        <div className="zenith-checkbox-card__title">{title}</div>
        <div className="zenith-checkbox-card__desc">{description}</div>
    </label>
);
