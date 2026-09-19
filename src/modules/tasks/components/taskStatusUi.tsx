import React, { type FC } from 'react';
import { Check, Minus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TASK_STATUSES } from '../../../core/constants';
import type { TaskStatus } from '../../../core/constants';
import { useTranslation } from '../../../core/i18n';
import { Popover, usePopover } from '../../../components/shared';

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
 * A status icon button that opens a small menu to pick one of the four.
 *
 * The positioning, the portal and the three ways of dismissing it all live in
 * `Popover` now; this file is down to what is actually about a task status.
 */
export const TaskStatusControl: FC<StatusControlProps> = ({ status, onChange, size = 18 }) => {
    const t = useTranslation();
    const pop = usePopover();

    return (
        <div className="zenith-status">
            <button
                {...pop.anchorProps}
                type="button"
                className="zenith-status__btn"
                onClick={pop.toggle}
                aria-label={t(STATUS_I18N[status])}
                title={t(STATUS_I18N[status])}
            >
                <StatusBox status={status} size={size} />
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
