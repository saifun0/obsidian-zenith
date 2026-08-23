import React, { type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import type { CalendarEntry } from '../services/calendarTasks';
import { formatMinutes, type TimedBlock } from '../services/calendarTime';
import { KindIcon, kindKey } from './kindUi';
import { noteName } from './TaskChip';

/** Below this many minutes a block has no room for a second line. */
const COMPACT_MINUTES = 45;
/** …and below this, not even for the title beside the time. */
const TINY_MINUTES = 20;

interface TimeBlockProps {
    block: TimedBlock<CalendarEntry>;
    t: Translator;
    /** Dimmed because the statistics popover is focusing another kind. */
    dim: boolean;
    /** The day view has a whole column to spend, so it also shows the note. */
    roomy: boolean;
    /** Minutes the grid's first row starts at, and pixels per minute. */
    originMinutes: number;
    pixelsPerMinute: number;
    onOpen: (entry: CalendarEntry) => void;
}

/**
 * One task occupying a stretch of a day.
 *
 * Unlike a chip, this one is filled: it has to read as an object that owns
 * those two hours, and an outline can't say that. Its height is the duration,
 * so a glance at the column answers "how much of this day is already spoken
 * for" without reading a single title.
 *
 * A block whose end was never stated — a bare `⏰ 15:45` — is drawn with a
 * dashed foot. The default slot has to give it *some* height, and the dash is
 * how the grid admits that the height is a guess rather than a claim from the
 * note.
 */
export const TimeBlock: FC<TimeBlockProps> = ({
    block,
    t,
    dim,
    roomy,
    originMinutes,
    pixelsPerMinute,
    onOpen,
}) => {
    const { item: entry, start, end, stated, column, columns } = block;
    const { task, kind } = entry;

    const minutes = end - start;
    const width = 100 / columns;
    const label = `${formatMinutes(start)}${stated ? `–${formatMinutes(end)}` : ''}`;
    const kindLabel = t(kindKey(kind));

    return (
        <button
            className={[
                'zenith-tcal__event',
                `is-${kind}`,
                dim ? 'is-dim' : '',
                stated ? '' : 'is-open-end',
                minutes < COMPACT_MINUTES ? 'is-compact' : '',
                minutes < TINY_MINUTES ? 'is-tiny' : '',
                task.priority === 'urgent' || task.priority === 'high'
                    ? `is-priority-${task.priority}`
                    : '',
            ]
                .filter(Boolean)
                .join(' ')}
            style={{
                top: `${(start - originMinutes) * pixelsPerMinute}px`,
                height: `${Math.max(minutes * pixelsPerMinute - 2, 16)}px`,
                left: `calc(${width * column}% + 1px)`,
                width: `calc(${width}% - 3px)`,
            }}
            onClick={(e) => {
                e.stopPropagation();
                onOpen(entry);
            }}
            title={`⏰ ${label} · ${kindLabel} · ${noteName(task.filePath)}\n${task.title}${
                stated ? '' : `\n${t('calendar.openEnded')}`
            }`}
        >
            <span className="zenith-tcal__event-head">
                <span className="zenith-tcal__event-time">{label}</span>
                <span className="zenith-tcal__event-icon">
                    <KindIcon kind={kind} size={11} />
                </span>
            </span>
            <span className="zenith-tcal__event-title">{task.title}</span>
            {roomy && minutes >= 60 && (
                <span className="zenith-tcal__event-note">{noteName(task.filePath)}</span>
            )}
        </button>
    );
};
