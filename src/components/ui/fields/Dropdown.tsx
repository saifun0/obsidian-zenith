import React, { useEffect, useRef, type FC } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, usePopover } from '../../shared/Popover';
import { DynamicIcon } from '../../shared/DynamicIcon';
import { isCoarsePointer, revealIn } from './pointer';

export interface DropdownOption {
    value: string;
    label: string;
    /** A lucide id, drawn before the label in the list and on the field. */
    icon?: string;
    disabled?: boolean;
}

export interface DropdownProps {
    value: string;
    options: DropdownOption[];
    onChange: (value: string) => void;
    /** Shown while `value` matches no option — for a picker with no default. */
    placeholder?: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    /** Extra classes on the field: a width, or a tone the value is drawn in. */
    className?: string;
    id?: string;
    title?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

/** Rows as tall as `.zenith-pop__item` draws them, plus the menu's padding. */
const ROW = 34;
const ROW_COARSE = 44;
const PAD = 10;
/** `.zenith-pop--scroll` caps the list here; the flip decision has to agree. */
const MAX_H = 280;
/** A narrow field still gets a list its longest option can be read in. */
const MIN_W = 180;

/** Put the keyboard on row `index` of an open list, and the row in view. */
function focusRowIn(list: HTMLElement | null, index: number) {
    const row = list?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index];
    if (!row) return;
    row.focus({ preventScroll: true });
    revealIn(list?.closest<HTMLElement>('.zenith-pop') ?? null, row);
}

/**
 * A select that looks the same everywhere.
 *
 * `<select>` hands its list to the platform: a Chromium menu on Windows, a
 * wheel on iOS, a sheet on Android, each in its own type, colours and spacing,
 * none of them following the theme. This is the plugin's own popover instead,
 * so the list is drawn by the same rules as every other menu in Zenith.
 *
 * It behaves like the native one where that matters. The field opens on click,
 * Enter, Space and the arrow keys; the list opens with the chosen row focused;
 * the arrows, Home and End move; typing jumps to the next row starting with
 * what was typed; Enter or Space picks; Escape and Tab leave. And like a native
 * select it keeps the focus afterwards, so a keyboard user is where they were.
 */
export const Dropdown: FC<DropdownProps> = ({
    value,
    options,
    onChange,
    placeholder,
    disabled,
    size = 'md',
    className = '',
    id,
    title,
    ...aria
}) => {
    const pop = usePopover<HTMLButtonElement>();
    const listRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ text: '', at: 0 });
    /** A row typed for while the list was shut, to land on once it opens. */
    const pending = useRef<number | null>(null);
    // Read by the open effect, which must not re-run — and re-focus the chosen
    // row — every time a parent re-renders with a new options array.
    const latest = useRef({ options, value });
    latest.current = { options, value };

    const selected = options.find((o) => o.value === value);
    const rowH = isCoarsePointer() ? ROW_COARSE : ROW;
    const height = Math.min(options.length * rowH + PAD, MAX_H);
    const width = Math.max(pop.anchor?.offsetWidth ?? 0, MIN_W);

    const focusRow = (index: number) => focusRowIn(listRef.current, index);

    // The list opens with the chosen row under the keyboard, the way a native
    // one does. A frame later, because the popover mounts after this render.
    useEffect(() => {
        if (!pop.open) return;
        const frame = window.requestAnimationFrame(() => {
            const { options: opts, value: current } = latest.current;
            const chosen = opts.findIndex((o) => o.value === current && !o.disabled);
            const target =
                pending.current ?? (chosen >= 0 ? chosen : opts.findIndex((o) => !o.disabled));
            pending.current = null;
            focusRowIn(listRef.current, target);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [pop.open]);

    // Like a native select, the field keeps the focus when the list goes away —
    // unless something else has taken it, which is what a click elsewhere means.
    const wasOpen = useRef(false);
    useEffect(() => {
        if (wasOpen.current && !pop.open) {
            const doc = pop.anchor?.ownerDocument;
            const active = doc?.activeElement;
            if (!active || active === doc?.body) pop.anchor?.focus();
        }
        wasOpen.current = pop.open;
    }, [pop.open, pop.anchor]);

    const choose = (option: DropdownOption) => {
        if (option.disabled) return;
        pop.close();
        pop.anchor?.focus();
        if (option.value !== value) onChange(option.value);
    };

    /** Index of the next enabled row from `from`, stepping `by`, wrapping. */
    const step = (from: number, by: number) => {
        for (let n = 1; n <= options.length; n++) {
            const i = (from + by * n + options.length * n) % options.length;
            if (!options[i]?.disabled) return i;
        }
        return from;
    };

    /** Typeahead: letters typed within a second read as one prefix. */
    const matchTyped = (key: string, from: number): number => {
        const now = Date.now();
        const buffer = now - typed.current.at < 1000 ? typed.current.text + key : key;
        typed.current = { text: buffer, at: now };
        const needle = buffer.toLowerCase();
        for (let n = 1; n <= options.length; n++) {
            // A single repeated letter cycles through the rows it starts, from
            // the one after the current; a longer prefix tries the current first.
            const offset = buffer.length > 1 ? n - 1 : n;
            const i = (from + offset) % options.length;
            const o = options[i];
            if (o && !o.disabled && o.label.toLowerCase().startsWith(needle)) return i;
        }
        return -1;
    };

    // Enter and Space are left to the button's own click, which toggles.
    const onFieldKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            pop.setOpen(true);
        } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
            const current = options.findIndex((o) => o.value === value);
            const hit = matchTyped(e.key, current);
            if (hit >= 0) {
                e.preventDefault();
                pending.current = hit;
                pop.setOpen(true);
            }
        }
    };

    const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusRow(step(index, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusRow(step(index, -1));
        } else if (e.key === 'Home') {
            e.preventDefault();
            focusRow(step(-1, 1));
        } else if (e.key === 'End') {
            e.preventDefault();
            focusRow(step(options.length, -1));
        } else if (e.key === 'Tab') {
            pop.close();
        } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
            const hit = matchTyped(e.key, index);
            if (hit >= 0) {
                e.preventDefault();
                focusRow(hit);
            }
        }
    };

    return (
        <>
            <button
                ref={pop.anchorProps.ref}
                type="button"
                id={id}
                title={title}
                className={[
                    'zenith-input zenith-select',
                    size === 'sm' ? 'zenith-input--sm' : '',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={pop.open}
                aria-label={aria['aria-label']}
                aria-labelledby={aria['aria-labelledby']}
                aria-describedby={aria['aria-describedby']}
                disabled={disabled}
                onClick={pop.toggle}
                onKeyDown={onFieldKey}
            >
                {selected?.icon && <DynamicIcon name={selected.icon} size={14} />}
                <span className={`zenith-select__value${selected ? '' : ' is-placeholder'}`}>
                    {selected?.label ?? placeholder ?? ''}
                </span>
                <ChevronDown size={14} className="zenith-select__chevron" aria-hidden="true" />
            </button>

            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={width}
                height={height}
                role="listbox"
                label={aria['aria-label'] ?? placeholder}
                className="zenith-pop--scroll zenith-select__menu"
            >
                <div ref={listRef} className="zenith-select__list">
                    {options.map((o, i) => {
                        const on = o.value === value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                role="option"
                                aria-selected={on}
                                tabIndex={-1}
                                disabled={o.disabled}
                                className={`zenith-pop__item${on ? ' is-active' : ''}`}
                                onClick={() => choose(o)}
                                onKeyDown={(e) => onRowKey(e, i)}
                            >
                                {o.icon && <DynamicIcon name={o.icon} size={14} />}
                                <span className="zenith-select__label">{o.label}</span>
                                {on && <Check size={14} className="zenith-select__tick" />}
                            </button>
                        );
                    })}
                </div>
            </Popover>
        </>
    );
};
