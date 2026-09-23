import React from 'react';
import { DynamicIcon } from '../../components/shared/DynamicIcon';
import { ColorField, Dropdown } from '../../components/ui/fields';

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
 *
 * ── How a control learns its own name ──
 *
 * Every row had a label and a control and nothing joining the two: the label
 * was a span, so a screen reader announced "checkbox, unchecked" with no word
 * about what it switched, and a pointer landing on the words did nothing.
 * Passing an id down through a dozen call sites would mean every hand-rolled
 * row in the plugin inventing one.
 *
 * So the row mints the ids and puts them in context; a control picks up
 * whichever it needs and works without them when it is standing on its own.
 * `id` is the control, `labelId` the words — a radio group cannot be the
 * target of `for`, so it points back at the label instead — and `describedBy`
 * gathers the description and the error the row is already drawing.
 */

export interface FieldIds {
    /** For the one form control this row labels. */
    id: string;
    /** The label element itself, for controls that are a group, not a field. */
    labelId: string;
    /** Description and error lines, already joined. */
    describedBy?: string;
}

const FieldIdContext = React.createContext<FieldIds | null>(null);

/** The ids of the row this control sits in, if it sits in one at all. */
export const useFieldIds = (): FieldIds | null => React.useContext(FieldIdContext);

/**
 * A caveat, folded into a mark beside the label.
 *
 * These notes are worth keeping — "this password is stored in plain text",
 * "turning this on needs an empty folder" — but they are things to read once,
 * and a page of them shouts every one of them on every visit. A page that
 * shouts everything is a page nobody reads, which is the opposite of what a
 * warning is for.
 *
 * ── Why the bubble is `position: fixed` ──
 *
 * The settings pane scrolls, and a scroll container clips on both axes whether
 * you ask it to or not — `overflow-y: auto` forces `overflow-x` away from
 * `visible`. An absolutely positioned bubble would therefore be cut off exactly
 * at the top and bottom of the list, which is where half the rows are. Viewport
 * coordinates escape that.
 */
export const InfoHint: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
    const anchor = React.useRef<HTMLButtonElement>(null);
    const bubble = React.useRef<HTMLDivElement>(null);
    const [open, setOpen] = React.useState(false);
    const id = React.useId();

    // Layout effect, not effect: the bubble is measured and placed before the
    // browser paints, so it never appears at the top-left corner first.
    React.useLayoutEffect(() => {
        const tip = bubble.current;
        const button = anchor.current;
        if (!open || !tip || !button) return;

        const from = button.getBoundingClientRect();
        const box = tip.getBoundingClientRect();
        const edge = 8;
        // The settings window's own size: settings open in a window of their
        // own, and the global `window` is the main one behind it.
        const win = button.ownerDocument.defaultView ?? window;

        const centred = from.left + from.width / 2 - box.width / 2;
        const left = Math.max(edge, Math.min(centred, win.innerWidth - box.width - edge));

        // Below by default, above when there is no room — the rows near the
        // bottom of a long settings page are the common case, not the corner one.
        const below = from.bottom + 8;
        const top =
            below + box.height > win.innerHeight - edge ? from.top - box.height - 8 : below;

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    }, [open]);

    return (
        <span className="zenith-settings__note">
            <button
                ref={anchor}
                type="button"
                className={`zenith-settings__noteMark${open ? ' is-open' : ''}`}
                // Tap toggles, hover reveals. Pointer events rather than mouse
                // ones because a tap on a touchscreen also fires a synthetic
                // `mouseenter` first — which with a plain toggle would open the
                // note and then immediately close it again, on exactly the
                // devices the tap is there for.
                onClick={() => setOpen((on) => !on)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
                // The note itself is the accessible name. A screen reader
                // cannot hover, so a button announced only as "more info" would
                // put the caveat somewhere its user can never reach.
                aria-label={label ? `${label}. ${text}` : text}
                aria-describedby={open ? id : undefined}
            >
                <DynamicIcon name="info" size={14} />
            </button>
            {open && (
                <div ref={bubble} id={id} role="tooltip" className="zenith-settings__noteBubble">
                    {text}
                </div>
            )}
        </span>
    );
};

interface RowProps {
    label: string;
    desc?: string;
    /** A caveat worth reading once. Shown from a mark beside the label. */
    note?: string;
    /** Translated accessible name for that mark. */
    noteLabel?: string;
    error?: string;
    layout?: 'row' | 'stack';
    /**
     * The control is small enough to live beside the words at any width — a
     * checkbox, a short number.
     *
     * It only matters on a narrow pane, where every other row gives up and
     * stacks: a checkbox stacked under its own label would put it back at the
     * bottom-left corner this layout exists to get it out of.
     */
    compact?: boolean;
    /**
     * The control is several elements rather than one field — a radio group, a
     * row of chips, a button.
     *
     * A `for` attribute may only point at a single labelable element, and
     * pointing it at a button would mean a click on the words fires the
     * action. Those rows get a plain span that the group names with
     * `aria-labelledby` instead.
     */
    group?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}

/**
 * One setting: what it is on the left, the control on the right.
 *
 * The control cell is pinned to the end of the row rather than merely placed
 * after the label — see `--zs-*` in the stylesheet for why a row with a long
 * description used to drop its checkbox onto a line of its own, at its own
 * left edge, while the row above kept its own at the right.
 */
export const SettingRow: React.FC<RowProps> = ({
    label,
    desc,
    note,
    noteLabel,
    error,
    layout = 'row',
    compact,
    group,
    disabled,
    children,
}) => {
    const base = React.useId();
    const descId = desc ? `${base}-desc` : undefined;
    const errorId = error ? `${base}-error` : undefined;

    const ids = React.useMemo<FieldIds>(
        () => ({
            id: `${base}-control`,
            labelId: `${base}-label`,
            describedBy: [descId, errorId].filter(Boolean).join(' ') || undefined,
        }),
        [base, descId, errorId]
    );

    const name = (
        <>
            {label}
            {note && <InfoHint text={note} label={noteLabel} />}
        </>
    );

    return (
        <div
            className={[
                'zenith-settings__item',
                layout === 'stack' ? 'zenith-settings__item--stack' : '',
                compact ? 'zenith-settings__item--compact' : '',
                disabled ? 'is-disabled' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="zenith-settings__item-info">
                {group ? (
                    <span className="zenith-settings__item-name" id={ids.labelId}>
                        {name}
                    </span>
                ) : (
                    <label className="zenith-settings__item-name" id={ids.labelId} htmlFor={ids.id}>
                        {name}
                    </label>
                )}
                {desc && (
                    <span className="zenith-settings__item-desc" id={descId}>
                        {desc}
                    </span>
                )}
            </div>
            <div className="zenith-settings__item-control">
                <FieldIdContext.Provider value={ids}>{children}</FieldIdContext.Provider>
            </div>
            {/* An error stays on the page rather than hiding behind a mark. A note
                is background someone can choose to read; an error is the reason the
                thing in front of them is not working. */}
            {error && (
                <div
                    className="zenith-settings__hint zenith-settings__hint--warn"
                    id={errorId}
                    role="alert"
                >
                    {error}
                </div>
            )}
        </div>
    );
};

export const Toggle: React.FC<{
    checked: boolean;
    disabled?: boolean;
    onChange: (v: boolean) => void;
}> = ({ checked, disabled, onChange }) => {
    const ids = useFieldIds();

    // A span, not a second label element: the row already draws one and points
    // it at this input by id, and nesting the box inside another label gave it
    // two names, the outer of which named nothing.
    return (
        <span className="zenith-settings__toggle-label">
            <input
                type="checkbox"
                id={ids?.id}
                aria-describedby={ids?.describedBy}
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
        </span>
    );
};

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
}> = ({ value, options, disabled, onChange }) => {
    const ids = useFieldIds();

    // Zenith's dropdown, not `<select>`: the native list is drawn by the
    // platform, and looked like a different program on every one of them.
    return (
        <Dropdown
            className="zenith-settings__picker"
            id={ids?.id}
            aria-describedby={ids?.describedBy}
            value={value}
            options={options}
            disabled={disabled}
            onChange={onChange}
        />
    );
};

/**
 * A short list of choices, shown all at once. Better than a select for two or
 * three options — the alternatives are visible without opening anything, which
 * on a phone saves a modal.
 *
 * A real radio group, which means one tab stop and not four: the arrow keys
 * move between the options and select as they go, which is what a radio group
 * does everywhere else and what a keyboard user will try first. Without the
 * roving `tabIndex` every backend on the sync page was its own stop, and
 * tabbing past the control took as many presses as it had options.
 */
export const Segmented: React.FC<{
    value: string;
    options: ChoiceOption[];
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, options, disabled, onChange }) => {
    const ids = useFieldIds();
    const box = React.useRef<HTMLDivElement>(null);

    const active = Math.max(
        0,
        options.findIndex((o) => o.value === value)
    );

    const step = (from: number, by: number) => {
        const to = (from + by + options.length) % options.length;
        const next = options[to];
        if (!next) return;
        onChange(next.value);
        // Focus follows selection, or an arrow key would move the mark and
        // leave the focus ring behind on the option just left.
        box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[to]?.focus();
    };

    return (
        <div
            ref={box}
            className="zenith-seg"
            role="radiogroup"
            aria-labelledby={ids?.labelId}
            aria-describedby={ids?.describedBy}
        >
            {options.map((o, i) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={o.value === value}
                    tabIndex={i === active ? 0 : -1}
                    disabled={disabled}
                    className={`zenith-seg__opt${o.value === value ? ' is-active' : ''}`}
                    onClick={() => onChange(o.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            step(i, 1);
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            step(i, -1);
                        }
                    }}
                >
                    {o.icon && <DynamicIcon name={o.icon} size={13} />}
                    {o.label}
                </button>
            ))}
        </div>
    );
};

/**
 * A number and the unit it is counted in, as one field.
 *
 * The unit used to be a loose word after the box, which read as a caption
 * rather than as part of the control and sat off the input's baseline whenever
 * either changed size. It is a suffix inside the same border now, so "15 min"
 * is one object to look at and one focus ring goes round the whole of it.
 */
export const NumberInput: React.FC<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (v: number) => void;
}> = ({ value, min, max, step, unit, disabled, onChange }) => {
    const ids = useFieldIds();
    const unitId = ids && unit ? `${ids.id}-unit` : undefined;

    return (
        <div className={`zenith-settings__num${disabled ? ' is-disabled' : ''}`}>
            <input
                type="number"
                className="zenith-settings__input"
                id={ids?.id}
                // The unit is part of the question — "every 15" is not an
                // answer without it — so it is announced with the field rather
                // than left as decoration beside it.
                aria-describedby={[ids?.describedBy, unitId].filter(Boolean).join(' ') || undefined}
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
            {unit && (
                <span className="zenith-settings__num-unit" id={unitId}>
                    {unit}
                </span>
            )}
        </div>
    );
};

export const Slider: React.FC<{
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (v: number) => void;
}> = ({ value, min, max, step = 1, unit, disabled, onChange }) => {
    const ids = useFieldIds();

    return (
        <div className="zenith-settings__slider">
            <input
                type="range"
                id={ids?.id}
                aria-describedby={ids?.describedBy}
                aria-valuetext={unit ? `${value} ${unit}` : undefined}
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChange={(e) => onChange(Number(e.target.value))}
            />
            {/* The readout is the whole reason a slider is usable for a numeric
                setting — without it the user is dragging at an unknown value.
                Hidden from the reader, which has `aria-valuetext` for the same
                fact and would otherwise say the number twice. */}
            <span className="zenith-settings__slider-value" aria-hidden="true">
                {value}
                {unit ? ` ${unit}` : ''}
            </span>
        </div>
    );
};

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
    const ids = useFieldIds();

    const input = (
        <input
            type={secret && !revealed ? 'password' : 'text'}
            className={`zenith-settings__input${monospace ? ' is-mono' : ''}`}
            id={ids?.id}
            aria-describedby={ids?.describedBy}
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
                aria-controls={ids?.id}
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
}> = ({ value, rows = 4, placeholder, monospace, disabled, onChange }) => {
    const ids = useFieldIds();

    return (
        <textarea
            className={`zenith-settings__textarea${monospace ? ' is-mono' : ''}`}
            id={ids?.id}
            aria-describedby={ids?.describedBy}
            value={value}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
    );
};

export const ColorInput: React.FC<{
    value: string;
    fallback?: string;
    allowEmpty?: boolean;
    resetLabel: string;
    disabled?: boolean;
    onChange: (v: string) => void;
}> = ({ value, fallback = '#7c6cff', allowEmpty, resetLabel, disabled, onChange }) => {
    const ids = useFieldIds();

    return (
        <div className="zenith-settings__color-control">
            <ColorField
                id={ids?.id}
                aria-describedby={ids?.describedBy}
                value={value}
                fallback={fallback}
                resetLabel={allowEmpty ? resetLabel : undefined}
                disabled={disabled}
                onChange={onChange}
            />
            {/* The same setting twice, so the second box borrows the first's
                name rather than being announced as an unlabelled text field. */}
            <input
                type="text"
                className="zenith-settings__input"
                aria-labelledby={ids?.labelId}
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
};

export const MultiSelect: React.FC<{
    value: string[];
    options: ChoiceOption[];
    disabled?: boolean;
    onChange: (v: string[]) => void;
}> = ({ value, options, disabled, onChange }) => {
    const ids = useFieldIds();

    return (
        <div
            className="zenith-settings__chips"
            role="group"
            aria-labelledby={ids?.labelId}
            aria-describedby={ids?.describedBy}
        >
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
};

export const ActionButton: React.FC<{
    label: string;
    cta?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}> = ({ label, cta, danger, disabled, onClick }) => {
    const ids = useFieldIds();

    return (
        <button
            type="button"
            className={[
                'zenith-settings__inline-btn',
                cta ? 'zenith-settings__inline-btn--cta' : '',
                danger ? 'zenith-settings__inline-btn--danger' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            aria-describedby={ids?.describedBy}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
};
