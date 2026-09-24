import React, { type FC } from 'react';
import type { CalendarEntry } from '../services/calendarTasks';
import type { Translator } from '../../../core/i18n';
import { formatMinutes } from '../services/calendarTime';
import { KindIcon, kindKey } from './kindUi';

/** The Tasks-plugin marker each kind comes from, for the tooltip. */
const KIND_MARKER: Record<string, string> = {
    overdue: '📅',
    due: '📅',
    recurrence: '🔁',
    start: '🛫',
    scheduled: '⏳',
    process: '🛫→📅',
    dailyNote: '📄',
    done: '✅',
    cancelled: '🚫',
};

/** Note filename without the folder or the extension. */
export function noteName(path: string): string {
    return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

interface TaskChipProps {
    entry: CalendarEntry;
    t: Translator;
    /** Dimmed because the statistics popover is focusing another kind. */
    dim: boolean;
    /** Hide the note name — the compact month cells have no room for it. */
    compact?: boolean;
    onOpen: (entry: CalendarEntry) => void;
    /** Pressed to be dragged onto the hour grid — set only where that is possible. */
    onPointerDown?: (e: React.PointerEvent) => void;
    /** A click that ends a drag is not a request to open. */
    swallowClick?: () => boolean;
}

/**
 * One task on one day. Clicking opens the task's line in its note; that's the
 * whole interaction, because a chip in a month cell is too small a target to
 * hang a status control off without making mis-clicks the norm. The agenda has
 * the room and does offer one.
 */
export const TaskChip: FC<TaskChipProps> = ({
    entry,
    t,
    dim,
    compact,
    onOpen,
    onPointerDown,
    swallowClick,
}) => {
    const { task, kind, overdueBy } = entry;
    const kindLabel = t(kindKey(kind));
    const marker = KIND_MARKER[kind] ?? '';

    return (
        <button
            className={[
                'zenith-tcal__chip',
                `is-${kind}`,
                dim ? 'is-dim' : '',
                task.priority !== 'none' ? `is-priority-${task.priority}` : '',
                onPointerDown ? 'is-placeable' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            data-task={task.id}
            onPointerDown={onPointerDown}
            onClick={(e) => {
                e.stopPropagation();
                if (swallowClick?.()) return;
                onOpen(entry);
            }}
            title={`${marker} ${kindLabel} · ${noteName(task.filePath)}\n${task.title}`}
        >
            <span className="zenith-tcal__chip-icon">
                <KindIcon kind={kind} />
            </span>
            {/* The month grid has no hour rows, so the hour has to be written
                out — otherwise "15:45" exists only in the week view. */}
            {entry.startMinutes !== undefined && (
                <span className="zenith-tcal__chip-time">{formatMinutes(entry.startMinutes)}</span>
            )}
            <span className="zenith-tcal__chip-title">{task.title}</span>
            {overdueBy != null && overdueBy > 0 && (
                <span className="zenith-tcal__chip-flag">
                    {t('calendar.overdueBy', { days: overdueBy })}
                </span>
            )}
            {!compact && <span className="zenith-tcal__chip-note">{noteName(task.filePath)}</span>}
        </button>
    );
};
