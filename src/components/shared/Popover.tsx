import React, { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Kept clear of the viewport edges by this much, on every side. */
const EDGE = 8;
/** Between the anchor and the menu. */
const GAP = 4;

export interface PopoverProps {
    /** The control the menu hangs off. Null means there is nothing to hang on. */
    anchor: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    /**
     * The menu's box. It has to be known before the menu is in the document,
     * because which way it opens is decided from it — measuring after the fact
     * means one frame of the menu hanging off the bottom of the screen.
     */
    width: number;
    height: number;
    /** Which edge of the anchor the menu lines up with. */
    align?: 'start' | 'end';
    /** Take the anchor's width instead of `width` — for a select-alike. */
    matchWidth?: boolean;
    className?: string;
    /** Announced to a screen reader; `menu` unless the content is a form. */
    role?: 'menu' | 'dialog' | 'listbox';
    label?: string;
    children: ReactNode;
}

/**
 * One popover, for all of them.
 *
 * There were seven hand-written versions of this in the plugin — the task
 * status menu, the library's progress menu, the journal's habit picker, the
 * task filters, the calendar toolbar, the metadata picker and the tasks view's
 * own sort menu — and each one had rewritten the same three problems from
 * scratch, with a different subset solved:
 *
 *   · Where to put it. Five of them positioned absolutely inside their own
 *     parent, which works until the parent clips — and a widget card, a task
 *     row and a grid cell all clip. This one portals onto document.body and
 *     positions fixed, so nothing an ancestor does can cut it off.
 *   · When to shut it. All seven closed on a click outside. Four ignored
 *     Escape. Six ignored scrolling, which leaves a menu pointing at a row
 *     that has moved out from under it.
 *   · Which way to open. Two flipped upward near the bottom of the window;
 *     the rest ran off the screen.
 *
 * Nothing here is clever. It is only written once.
 */
export const Popover: FC<PopoverProps> = ({
    anchor,
    open,
    onClose,
    width,
    height,
    align = 'start',
    matchWidth = false,
    className = '',
    role = 'menu',
    label,
    children,
}) => {
    const [box, setBox] = useState({ top: 0, left: 0, width });
    const menuRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open || !anchor) return;
        const r = anchor.getBoundingClientRect();
        const w = matchWidth ? r.width : width;

        // Below unless there is no room below and more room above — not simply
        // "below unless it would overflow", which flips a menu upward into an
        // even smaller gap when the anchor sits mid-screen on a short window.
        const below = window.innerHeight - r.bottom;
        const above = r.top;
        const openUp = below < height + GAP + EDGE && above > below;

        const wanted = align === 'end' ? r.right - w : r.left;
        setBox({
            top: openUp ? Math.max(EDGE, r.top - height - GAP) : r.bottom + GAP,
            left: Math.max(EDGE, Math.min(wanted, window.innerWidth - w - EDGE)),
            width: w,
        });
    }, [open, anchor, width, height, align, matchWidth]);

    useEffect(() => {
        if (!open) return;

        const onDown = (e: Event) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target)) return;
            // The anchor closes the menu through its own click handler; letting
            // this fire too would close and reopen it in the same gesture.
            if (anchor?.contains(target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        const dismiss = () => onClose();

        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        // Capture, because the thing that scrolls is usually an inner pane
        // rather than the window, and a bubbling listener never hears it.
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }, [open, anchor, onClose]);

    // Give the keyboard back what it was using. Only when the focus is inside
    // the menu: a scroll or a click elsewhere closed this too, and yanking the
    // caret out of whatever the user moved to would be its own bug.
    useEffect(() => {
        if (open) return;
        const active = document.activeElement;
        if (active && menuRef.current?.contains(active)) anchor?.focus();
    }, [open, anchor]);

    if (!open || !anchor) return null;

    return createPortal(
        <div
            ref={menuRef}
            className={`zenith-pop ${className}`}
            role={role}
            aria-label={label}
            style={{ top: box.top, left: box.left, width: box.width }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
};

/**
 * The state a popover needs, so a caller does not keep re-deriving it: the
 * anchor element (as state rather than a ref, because the menu's position is
 * computed from it and a ref does not re-render when it is filled in), whether
 * the menu is open, and the props to spread onto the control that opens it.
 */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
    const [anchor, setAnchor] = useState<T | null>(null);
    const [open, setOpen] = useState(false);
    return {
        anchor,
        open,
        setOpen,
        close: () => setOpen(false),
        toggle: (e?: React.MouseEvent) => {
            e?.stopPropagation();
            setOpen((v) => !v);
        },
        anchorProps: { ref: setAnchor, 'aria-expanded': open, 'aria-haspopup': true as const },
    };
}
