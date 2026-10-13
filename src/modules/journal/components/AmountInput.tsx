import React, { useEffect, useRef, useState, type FC } from 'react';
import { parseAmount } from '../services/amountInput';

interface AmountInputProps {
    /** What the day records, or undefined when it records nothing. */
    amount: number | undefined;
    /** What stands in the field while there is nothing. */
    placeholder: string;
    /** The tracker's name, for a screen reader. */
    label: string;
    className: string;
    /** A number to record, or `null` to clear the day's value. */
    onCommit: (next: number | null) => void;
}

/**
 * A tracker's amount, as a field you can type into.
 *
 * Between a stepper's − and + it was a figure, and the only way to "sixty
 * reps" was the + sixty times, or twelve with a step of five. Now the figure
 * is the field: click it, type, Enter.
 *
 * Nothing is written while typing — every write goes to the day's note — only
 * on Enter or on leaving the field. Escape puts back what was there.
 */
export const AmountInput: FC<AmountInputProps> = ({
    amount,
    placeholder,
    label,
    className,
    onCommit,
}) => {
    /** What is being typed; `null` while the field is only showing the amount. */
    const [draft, setDraft] = useState<string | null>(null);
    const ref = useRef<HTMLInputElement>(null);
    /** Set by Escape, so the blur that follows it does not record the draft. */
    const dropped = useRef(false);

    // The amount changed under the field — the stepper beside it, or the note
    // itself: what was half-typed is about a value that is no longer there.
    useEffect(() => setDraft(null), [amount]);

    const shown = draft ?? (amount === undefined ? '' : String(amount));

    const commit = () => {
        if (draft === null) return;
        const next = dropped.current ? undefined : parseAmount(draft);
        dropped.current = false;
        setDraft(null);
        // Not an amount, or the amount it already was: nothing to write.
        if (next === undefined || next === (amount ?? null)) return;
        onCommit(next);
    };

    return (
        <input
            ref={ref}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            maxLength={8}
            className={className}
            // As wide as what it holds: a field with room for eight digits
            // would push the − and the + apart around a "2".
            style={{ width: `${Math.max(shown.length || placeholder.length, 2)}ch` }}
            aria-label={label}
            placeholder={placeholder}
            value={shown}
            onFocus={(e) => {
                setDraft(shown);
                // Typing replaces: the usual reason to be here is a new number.
                e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    ref.current?.blur();
                } else if (e.key === 'Escape') {
                    // The field's own Escape: it must not also close the
                    // popover or the dialog the field stands in.
                    e.preventDefault();
                    e.stopPropagation();
                    dropped.current = true;
                    ref.current?.blur();
                }
            }}
        />
    );
};

/**
 * The amount as the last thing done here left it.
 *
 * A write goes through the note and comes back as a prop, which takes a
 * moment. A − or + pressed inside that moment — straight after typing, say —
 * would step from the amount as it was before. This is where the stepper reads
 * from instead.
 */
export function useLiveAmount(amount: number | undefined): React.MutableRefObject<number | undefined> {
    const live = useRef(amount);
    useEffect(() => {
        live.current = amount;
    }, [amount]);
    return live;
}
