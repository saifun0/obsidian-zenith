import React, { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Kept clear of the viewport edges by this much, on every side. */
const EDGE = 8;
/** Between the anchor and the menu. */
const GAP = 4;

/**
 * The open popovers, oldest first. A dropdown can open inside the task filter
 * panel, and Escape there means "shut the list", not "shut everything": only
 * the newest one answers it.
 */
const openStack: object[] = [];

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
 *     that has moved out from under it. This one follows its anchor as the
 *     page scrolls or the window changes size, and shuts only when the
 *     anchor itself has gone out of sight.
 *   · Which way to open. Two flipped upward near the bottom of the window;
 *     the rest ran off the screen. This one opens where there is room, and
 *     where there is not enough either way it takes what there is and
 *     scrolls — which on a phone with the keyboard up is the usual case.
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
    const [box, setBox] = useState<{
        top: number;
        left: number;
        width: number;
        maxHeight?: number;
    }>({ top: 0, left: 0, width });
    // Bumped when the page scrolls or the window resizes, to re-place the menu.
    const [moved, setMoved] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);
    // One place in the stack per opening. Not pushed from the effect below,
    // which re-runs whenever a caller hands in a fresh `onClose` — every render
    // for most of them — and would keep moving an outer menu back on top.
    const token = useRef({});

    useEffect(() => {
        if (!open) return;
        const mine = token.current;
        openStack.push(mine);
        return () => {
            openStack.splice(openStack.indexOf(mine), 1);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open || !anchor) return;
        const win = anchor.ownerDocument.defaultView ?? window;
        const r = anchor.getBoundingClientRect();
        // Never wider than the window: a 320px calendar on a 320px phone.
        const w = Math.min(matchWidth ? r.width : width, win.innerWidth - EDGE * 2);

        // The part of the window that can be seen. An on-screen keyboard takes
        // the bottom of it without always resizing the window, and a menu
        // placed under the keyboard is a menu nobody can reach.
        const vv = win.visualViewport;
        const bottom = Math.min(win.innerHeight, vv ? vv.offsetTop + vv.height : Infinity);

        // Below unless there is no room below and more room above — not simply
        // "below unless it would overflow", which flips a menu upward into an
        // even smaller gap when the anchor sits mid-screen on a short window.
        // The menu's real height, measured: it is already in the document by
        // the time this runs, one commit after `open`. The caller's `height` is
        // only the guess for when there is nothing to measure yet — and a guess
        // ten pixels high was enough to decide a menu did not fit, scroll it,
        // and cut the top off what was in it.
        const natural = menuRef.current?.scrollHeight || height;

        // Measured from the part of the anchor that is on screen: when the
        // keyboard has covered it, "above the anchor" means above the keyboard.
        const anchorTop = Math.min(r.top, bottom);
        const anchorBottom = Math.max(r.bottom, 0);
        const below = bottom - anchorBottom - GAP - EDGE;
        const above = anchorTop - GAP - EDGE;
        const openUp = below < natural && above > below;
        const room = Math.max(0, openUp ? above : below);
        const fits = room >= natural;
        const h = fits ? natural : room;

        const wanted = align === 'end' ? r.right - w : r.left;
        // Kept on screen even when the anchor is not — which happens while
        // someone types into the menu and the keyboard covers the field it
        // hangs from.
        const top = openUp ? anchorTop - GAP - h : anchorBottom + GAP;
        setBox({
            top: Math.max(EDGE, Math.min(top, bottom - EDGE - h)),
            left: Math.max(EDGE, Math.min(wanted, win.innerWidth - w - EDGE)),
            width: w,
            maxHeight: fits ? undefined : room,
        });
    }, [open, anchor, width, height, align, matchWidth, moved]);

    useEffect(() => {
        if (!open) return;
        // The anchor's own window, which is not always the plugin's: Obsidian
        // opens settings — and can pop any pane out — into a window of its own.
        const doc = anchor?.ownerDocument ?? document;
        const win = doc.defaultView ?? window;

        // `pointerdown`, not `mousedown`: iOS sends no mouse events for a tap
        // on something that is not itself clickable, so a tap on empty space
        // beside an open menu never reached this and the menu stayed open.
        const onDown = (e: Event) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target)) return;
            // The anchor closes the menu through its own click handler; letting
            // this fire too would close and reopen it in the same gesture.
            if (anchor?.contains(target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || openStack[openStack.length - 1] !== token.current) return;
            e.stopPropagation();
            onClose();
        };
        // The page scrolled or the window changed size: follow the anchor, once
        // a frame, and shut only when it has gone out of sight. Closing on
        // every scroll made the menus unusable on a phone, where focusing a
        // field scrolls it into view and raising the keyboard resizes the
        // window — both of which happened the moment a menu's own field was
        // touched.
        let frame = 0;
        const follow = (e?: Event) => {
            // A list scrolling inside a menu — this one or one opened from it —
            // is someone reading it; there is nothing to follow.
            if (e?.target instanceof Element && e.target.closest('.zenith-pop')) return;
            if (frame) return;
            frame = win.requestAnimationFrame(() => {
                frame = 0;
                const r = anchor?.getBoundingClientRect();
                const gone =
                    !r ||
                    (r.width === 0 && r.height === 0) ||
                    r.bottom < 0 ||
                    r.top > win.innerHeight;
                // Not while it is being typed into: on a phone the keyboard
                // coming up is exactly what hides the anchor.
                const inUse = menuRef.current?.contains(doc.activeElement) ?? false;
                if (gone && !inUse) onClose();
                else setMoved((n) => n + 1);
            });
        };

        doc.addEventListener('pointerdown', onDown);
        doc.addEventListener('keydown', onKey, true);
        // Capture, because the thing that scrolls is usually an inner pane
        // rather than the window, and a bubbling listener never hears it.
        win.addEventListener('scroll', follow, true);
        win.addEventListener('resize', follow);
        win.visualViewport?.addEventListener('resize', follow);
        win.visualViewport?.addEventListener('scroll', follow);
        return () => {
            win.cancelAnimationFrame(frame);
            doc.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('keydown', onKey, true);
            win.removeEventListener('scroll', follow, true);
            win.removeEventListener('resize', follow);
            win.visualViewport?.removeEventListener('resize', follow);
            win.visualViewport?.removeEventListener('scroll', follow);
        };
    }, [open, anchor, onClose]);

    // Give the keyboard back what it was using. Only when the focus is inside
    // the menu: a scroll or a click elsewhere closed this too, and yanking the
    // caret out of whatever the user moved to would be its own bug.
    useEffect(() => {
        if (open) return;
        const active = anchor?.ownerDocument.activeElement;
        if (active && menuRef.current?.contains(active)) anchor?.focus();
    }, [open, anchor]);

    if (!open || !anchor) return null;

    // Into the anchor's document. `document.body` is always the main window's,
    // so a menu opened from the settings window used to appear in the window
    // behind it, at that window's coordinates — nowhere near its field.
    return createPortal(
        <div
            ref={menuRef}
            className={`zenith-pop ${className}`}
            role={role}
            aria-label={label}
            style={{
                // Border-box, so the width and height worked out above are the
                // box on screen. Content-box added the padding and border on
                // top: every menu was wider than asked, which on a phone ran it
                // off the right edge, and a height capped to the room left was
                // thirty pixels taller than the room.
                boxSizing: 'border-box',
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                overflowY: box.maxHeight === undefined ? undefined : 'auto',
            }}
            // A press inside is not a press outside — for this menu's own
            // listener, and for any menu this one was opened from.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        anchor.ownerDocument.body
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
