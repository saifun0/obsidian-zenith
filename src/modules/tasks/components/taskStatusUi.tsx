import React, { useState, useRef, useEffect, useLayoutEffect, type FC } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TASK_STATUSES, STATUS_META } from '../../../core/constants';
import type { TaskStatus } from '../../../core/constants';

export const STATUS_COLOR: Record<TaskStatus, string> = {
    todo: 'var(--zenith-text-muted)',
    'in-progress': 'var(--zenith-info, #4c9be8)',
    done: 'var(--zenith-success, #3fb950)',
    cancelled: 'var(--zenith-danger, #e5534b)',
};

/** White glyph drawn inside the filled checkbox for each non-empty status. */
const STATUS_GLYPH: Record<TaskStatus, LucideIcon | null> = {
    todo: null,
    'in-progress': Minus,
    done: Check,
    cancelled: X,
};

/**
 * A rounded-square checkbox: an outline when empty, or filled in the status
 * colour with a white glyph (check / minus / cross) otherwise.
 */
export const StatusBox: FC<{ status: TaskStatus; size?: number }> = ({ status, size = 18 }) => {
    const Glyph = STATUS_GLYPH[status];
    const filled = status !== 'todo';
    const color = STATUS_COLOR[status];
    return (
        <span
            className={`zenith-status__box ${filled ? 'is-filled' : ''}`}
            style={{
                width: size,
                height: size,
                background: filled ? color : 'transparent',
                // Native --text-muted (with a hex fallback) so the outline is
                // visible even in the status menu, which portals outside
                // .zenith-root where --zenith-* vars aren't defined.
                borderColor: filled ? color : 'var(--text-muted, #9a9a9a)',
            }}
        >
            {Glyph && <Glyph size={Math.round(size * 0.68)} strokeWidth={3} color="#fff" />}
        </span>
    );
};

interface StatusControlProps {
    status: TaskStatus;
    onChange: (status: TaskStatus) => void;
    size?: number;
}

const MENU_WIDTH = 180;
const MENU_HEIGHT = 170;

/**
 * A status icon button that opens a small popover to pick one of the four
 * statuses. The popover is rendered through a portal with fixed positioning so
 * it's never clipped by an ancestor's `overflow: hidden` (task rows, widget
 * cards, etc.).
 */
export const TaskStatusControl: FC<StatusControlProps> = ({ status, onChange, size = 18 }) => {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Position the menu next to the button, flipping up/left near the edges.
    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const openUp = r.bottom + MENU_HEIGHT > window.innerHeight;
        const left = Math.min(r.left, window.innerWidth - MENU_WIDTH - 8);
        setCoords({
            top: openUp ? r.top - MENU_HEIGHT - 4 : r.bottom + 4,
            left: Math.max(8, left),
        });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: Event) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
            setOpen(false);
        };
        const dismiss = () => setOpen(false);
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }, [open]);

    return (
        <div className="zenith-status">
            <button
                ref={btnRef}
                className="zenith-status__btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                aria-label={`Status: ${STATUS_META[status].label}`}
                title={STATUS_META[status].label}
            >
                <StatusBox status={status} size={size} />
            </button>
            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        className="zenith-status__menu"
                        style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {TASK_STATUSES.map((s) => (
                            <button
                                key={s}
                                className={`zenith-status__item ${s === status ? 'is-active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(s);
                                    setOpen(false);
                                }}
                            >
                                <StatusBox status={s} size={16} />
                                <span>{STATUS_META[s].label}</span>
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
        </div>
    );
};
