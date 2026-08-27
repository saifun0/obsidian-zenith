import React from 'react';
import { DynamicIcon } from '../../components/shared/DynamicIcon';

/**
 * Settings form controls.
 *
 * These live here rather than in `components/shared` because they are
 * row-shaped: `SettingRow` owns the label/description/control layout and the
 * rest slot into it. They are also the only styled surface in the plugin that
 * uses Obsidian's own variables (`--text-normal`, `--background-secondary`)
 * instead of the `--zenith-*` tokens — the settings tab renders outside
 * `.zenith-root`, where those tokens are not declared.
 *
 * All of them are presentational: value in, change out, no store access. That
 * is what lets the same components drive both core settings and a third-party
 * module's own bucket.
 */

interface RowProps {
    label: string;
    desc?: string;
    note?: string;
    error?: string;
    layout?: 'row' | 'stack';
    disabled?: boolean;
    children: React.ReactNode;
}

export const SettingRow: React.FC<RowProps> = ({
    label,
    desc,
    note,
    error,
    layout = 'row',
    disabled,
    children,
}) => (
    <div
        className={[
            'zenith-settings__item',
            layout === 'stack' ? 'zenith-settings__item--stack' : '',
            disabled ? 'is-disabled' : '',
        ]
            .filter(Boolean)
            .join(' ')}
    >
        <div className="zenith-settings__item-info">
            <span className="zenith-settings__item-name">{label}</span>
            {desc && <span className="zenith-settings__item-desc">{desc}</span>}
        </div>
        <div className="zenith-settings__item-control">{children}</div>
        {note && <div className="zenith-settings__hint">{note}</div>}
        {error && <div className="zenith-settings__hint zenith-settings__hint--warn">{error}</div>}
    </div>
);

export const Toggle: React.FC<{
    checked: boolean;
    disabled?: boolean;
    onChange: (v: boolean) => void;
}> = ({ checked, disabled, onChange }) => (
    <label className="zenith-settings__toggle-label">
        <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
        />
    </label>
);

export interface ChoiceOption {
    value: string;
    label: string;
    icon?: string;
}

export const Select: React.FC<{
    value: string;
    options: ChoiceOption[];
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, options, disabled, onChange }) => (
    <select
        className="zenith-settings__select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
    >
        {options.map((o) => (
            <option key={o.value} value={o.value}>
                {o.label}
            </option>
        ))}
    </select>
);

/**
 * A short list of choices, shown all at once. Better than a `<select>` for two
 * or three options — the alternatives are visible without opening anything,
 * which on a phone saves a modal.
 */
export const Segmented: React.FC<{
    value: string;
    options: ChoiceOption[];
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, options, disabled, onChange }) => (
    <div className="zenith-seg" role="radiogroup">
        {options.map((o) => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={o.value === value}
                disabled={disabled}
                className={`zenith-seg__opt${o.value === value ? ' is-active' : ''}`}
                onClick={() => onChange(o.value)}
            >
                {o.icon && <DynamicIcon name={o.icon} size={13} />}
                {o.label}
            </button>
        ))}
    </div>
);

export const NumberInput: React.FC<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (v: number) => void;
}> = ({ value, min, max, step, unit, disabled, onChange }) => (
    <div className="zenith-settings__num">
        <input
            type="number"
            className="zenith-settings__input"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => {
                const next = Number(e.target.value);
                // An empty or half-typed box parses to NaN; keep the last good
                // value rather than writing NaN into settings.
                if (Number.isFinite(next)) onChange(next);
            }}
        />
        {unit && <span className="zenith-settings__num-unit">{unit}</span>}
    </div>
);

export const Slider: React.FC<{
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (v: number) => void;
}> = ({ value, min, max, step = 1, unit, disabled, onChange }) => (
    <div className="zenith-settings__slider">
        <input
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
        />
        {/* The readout is the whole reason a slider is usable for a numeric
            setting — without it the user is dragging at an unknown value. */}
        <span className="zenith-settings__slider-value">
            {value}
            {unit ? ` ${unit}` : ''}
        </span>
    </div>
);

/**
 * A text field, optionally a masked one.
 *
 * `secret` hides the value and offers to show it, rather than hiding it for
 * good. Settings passwords are typed once and then only ever checked — against
 * what the other device has, against what the server was set up with — and a
 * field nobody can read turns every such check into deleting it and typing it
 * again from memory, which for the encryption password is exactly the thing
 * that loses a vault.
 */
export const TextInput: React.FC<{
    value: string;
    placeholder?: string;
    monospace?: boolean;
    secret?: boolean;
    revealLabel?: string;
    hideLabel?: string;
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, placeholder, monospace, secret, revealLabel, hideLabel, disabled, onChange }) => {
    const [revealed, setRevealed] = React.useState(false);

    const input = (
        <input
            type={secret && !revealed ? 'password' : 'text'}
            className={`zenith-settings__input${monospace ? ' is-mono' : ''}`}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            // Password managers offering to fill a WebDAV password into a note
            // app's settings is noise at best and a wrong value at worst.
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
        />
    );

    if (!secret) return input;

    const label = revealed ? (hideLabel ?? 'Hide') : (revealLabel ?? 'Show');
    return (
        <div className="zenith-settings__secret">
            {input}
            <button
                type="button"
                className="zenith-settings__reveal"
                onClick={() => setRevealed((on) => !on)}
                disabled={disabled}
                aria-label={label}
                aria-pressed={revealed}
                title={label}
            >
                <DynamicIcon name={revealed ? 'eye-off' : 'eye'} size={15} />
            </button>
        </div>
    );
};

export const TextArea: React.FC<{
    value: string;
    rows?: number;
    placeholder?: string;
    monospace?: boolean;
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, rows = 4, placeholder, monospace, disabled, onChange }) => (
    <textarea
        className={`zenith-settings__textarea${monospace ? ' is-mono' : ''}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
    />
);

export const ColorInput: React.FC<{
    value: string;
    fallback?: string;
    allowEmpty?: boolean;
    resetLabel: string;
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, fallback = '#7c6cff', allowEmpty, resetLabel, disabled, onChange }) => (
    <div className="zenith-settings__color-control">
        <input
            type="color"
            className="zenith-settings__color"
            value={value || fallback}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
        <input
            type="text"
            className="zenith-settings__input"
            value={value}
            placeholder={fallback}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
        {allowEmpty && (
            <button
                type="button"
                className="zenith-settings__inline-btn"
                disabled={disabled}
                onClick={() => onChange('')}
            >
                {resetLabel}
            </button>
        )}
    </div>
);

export const MultiSelect: React.FC<{
    value: string[];
    options: ChoiceOption[];
    disabled?: boolean;
    onChange: (v: string[]) => void;
}> = ({ value, options, disabled, onChange }) => (
    <div className="zenith-settings__chips">
        {options.map((o) => {
            const on = value.includes(o.value);
            return (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    className={`zenith-settings__chip${on ? ' is-active' : ''}`}
                    onClick={() =>
                        onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
                    }
                >
                    {o.icon && <DynamicIcon name={o.icon} size={12} />}
                    {o.label}
                </button>
            );
        })}
    </div>
);

export const ActionButton: React.FC<{
    label: string;
    cta?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}> = ({ label, cta, danger, disabled, onClick }) => (
    <button
        type="button"
        className={[
            'zenith-settings__inline-btn',
            cta ? 'zenith-settings__inline-btn--cta' : '',
            danger ? 'zenith-settings__inline-btn--danger' : '',
        ]
            .filter(Boolean)
            .join(' ')}
        disabled={disabled}
        onClick={onClick}
    >
        {label}
    </button>
);
