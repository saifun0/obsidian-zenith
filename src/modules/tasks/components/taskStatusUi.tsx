import React, { useEffect, useRef, useState, type FC } from 'react';
import { TASK_STATUSES } from '../../../core/constants';
import type { TaskStatus } from '../../../core/constants';
import { useTranslation } from '../../../core/i18n';
import { useLongPress } from '../../../core/useLongPress';
import { Popover, usePopover } from '../../../components/shared';

/**
 * A colour per status, for the places that chart statuses side by side.
 *
 * Not for the checkbox: that says its status by shape, in the colour of the
 * text around it, so that across a list the only colour left is a deadline
 * that has passed.
 */
export const STATUS_COLOR: Record<TaskStatus, string> = {
    todo: 'var(--zenith-text-muted)',
    'in-progress': 'var(--zenith-info, #4c9be8)',
    done: 'var(--zenith-success, #3fb950)',
    cancelled: 'var(--zenith-danger, #e5534b)',
};

/**
 * The dictionary key for each status. `STATUS_META` carries an English `label`
 * beside the character it writes into the note — a fallback, not a label, and
 * it was being printed straight into the menu, which is how "In progress" came
 * to name a status the rest of the interface calls "В работе".
 */
export const STATUS_I18N: Record<TaskStatus, string> = {
    todo: 'status.todo',
    'in-progress': 'status.inProgress',
    done: 'status.done',
    cancelled: 'status.cancelled',
};

const isClosed = (status: TaskStatus) => status === 'done' || status === 'cancelled';

/** How long the fill of a just-completed circle takes, in ms. Matches tasks-ui.css. */
const INK_MS = 420;

/**
 * The checkbox, drawn as an ink circle: an empty ring to do, half filled once
 * started, filled with the tick cut out of it when done, struck through when
 * given up. Monochrome on purpose — see `STATUS_COLOR`.
 *
 * The tick is cut out in the page's own colour rather than drawn in white, so
 * a filled circle on a light theme does not turn into a black button.
 */
export const StatusBox: FC<{ status: TaskStatus; size?: number; inked?: boolean }> = ({
    status,
    size = 18,
    inked = false,
}) => (
    <svg
        className={`zenith-status__box is-${status}${inked ? ' is-inked' : ''}`}
        width={size}
        height={size}
        viewBox="0 0 20 20"
        aria-hidden="true"
    >
        {status === 'done' ? (
            <>
                <circle className="zenith-status__fill" cx="10" cy="10" r="9" />
                <path className="zenith-status__tick" d="M6.2 10.3l2.6 2.6 5-5.4" />
            </>
        ) : (
            <>
                <circle className="zenith-status__ring" cx="10" cy="10" r="8.25" />
                {status === 'in-progress' && (
                    <path className="zenith-status__half" d="M10 4.6a5.4 5.4 0 0 0 0 10.8z" />
                )}
                {status === 'cancelled' && (
                    <path className="zenith-status__slash" d="M5.6 14.4l8.8-8.8" />
                )}
                {status === 'todo' && (
                    // What a click will do, shown faintly under the pointer.
                    <path className="zenith-status__ghost" d="M6.2 10.3l2.6 2.6 5-5.4" />
                )}
            </>
        )}
    </svg>
);

interface StatusControlProps {
    status: TaskStatus;
    onChange: (status: TaskStatus) => void;
    size?: number;
}

const MENU_WIDTH = 180;
const MENU_HEIGHT = 170;

/**
 * The checkbox of every task the plugin draws.
 *
 * A click closes the task, and a second click opens it again — that is nearly
 * every click there is, and it used to cost two: the circle opened a menu of
 * the four statuses, and "done" had to be picked out of it each time. The menu
 * is still there, a right-click or a long press away, for "in progress" and
 * "cancelled".
 */
export const TaskStatusControl: FC<StatusControlProps> = ({ status, onChange, size = 18 }) => {
    const t = useTranslation();
    const pop = usePopover();
    const [inked, setInked] = useState(false);
    const inkTimer = useRef(0);
    useEffect(() => () => window.clearTimeout(inkTimer.current), []);

    const press = useLongPress(
        () => pop.setOpen(true),
        (e) => {
            e.preventDefault();
            pop.setOpen(true);
        }
    );

    const closed = isClosed(status);

    const toggle = (e: React.MouseEvent) => {
        // The row behind the circle opens the editor on a click; this one is ours.
        e.stopPropagation();
        if (press.swallowClick()) return;
        const next: TaskStatus = closed ? 'todo' : 'done';
        if (next === 'done') {
            setInked(true);
            window.clearTimeout(inkTimer.current);
            inkTimer.current = window.setTimeout(() => setInked(false), INK_MS);
        }
        onChange(next);
    };

    return (
        <div className="zenith-status">
            <button
                {...pop.anchorProps}
                type="button"
                className="zenith-status__btn"
                onClick={toggle}
                onPointerDown={press.onPointerDown}
                onPointerMove={press.onPointerMove}
                onPointerUp={press.onPointerUp}
                onPointerCancel={press.onPointerCancel}
                onContextMenu={(e) => {
                    // The row has a menu of its own on the same gesture.
                    e.stopPropagation();
                    press.onContextMenu(e);
                }}
                aria-label={t(closed ? 'status.reopen' : 'status.complete')}
                title={`${t(STATUS_I18N[status])} · ${t('status.menuHint')}`}
            >
                <StatusBox status={status} size={size} inked={inked} />
            </button>
            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={MENU_WIDTH}
                height={MENU_HEIGHT}
                label={t('status.menu')}
            >
                {TASK_STATUSES.map((s) => (
                    <button
                        key={s}
                        type="button"
                        role="menuitem"
                        className={`zenith-pop__item ${s === status ? 'is-active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(s);
                            pop.close();
                        }}
                    >
                        <StatusBox status={s} size={16} />
                        <span>{t(STATUS_I18N[s])}</span>
                    </button>
                ))}
            </Popover>
        </div>
    );
};
