import React, { type FC } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import type { SpanSegment } from '../services/calendarTasks';
import { spanColor } from '../services/spanColor';
import { noteName } from './TaskChip';

interface SpanRibbonProps {
    segment: SpanSegment;
    t: Translator;
    dim: boolean;
    /** Grid column the row's first day sits in (the week gutter takes one). */
    columnOffset: number;
    /**
     * Grid row lane 0 sits in. The month grid spends its first row on day
     * numbers; the week view puts its ribbons in a band of their own.
     */
    rowOffset: number;
    onOpen: (segment: SpanSegment) => void;
}

/**
 * A task's 🛫→📅 stretch, drawn as one bar across the days it covers.
 *
 * The title is written once, at the bar's left edge, and the due glyph caps the
 * right — so a two-week task costs two labels on a month grid instead of
 * fourteen. Where the bar runs past the row it gets a square end, which is the
 * conventional way a calendar says "this continues".
 */
export const SpanRibbon: FC<SpanRibbonProps> = ({
    segment,
    t,
    dim,
    columnOffset,
    rowOffset,
    onOpen,
}) => {
    const { span, from, to, clippedStart, clippedEnd, lane } = segment;

    return (
        <button
            className={[
                'zenith-tcal__ribbon',
                'is-process',
                dim ? 'is-dim' : '',
                clippedStart ? 'is-clipped-start' : '',
                clippedEnd ? 'is-clipped-end' : '',
                span.task.priority === 'urgent' || span.task.priority === 'high'
                    ? `is-priority-${span.task.priority}`
                    : '',
            ]
                .filter(Boolean)
                .join(' ')}
            style={{
                gridColumn: `${columnOffset + from} / span ${to - from + 1}`,
                gridRow: lane + rowOffset,
                // Overrides the generic "in flight" colour the class carries, so
                // two bars in one week are two visibly different projects.
                ['--tcal-kind' as string]: spanColor(span.task),
            }}
            // The same id in every row the bar crosses, which is what lets a
            // hover light the whole bar rather than the one week under it.
            data-task={span.task.id}
            onClick={(e) => {
                e.stopPropagation();
                onOpen(segment);
            }}
            title={`🛫 ${span.from} → 📅 ${span.to} · ${noteName(span.task.filePath)}\n${span.task.title}`}
        >
            <span className="zenith-tcal__ribbon-title">{span.task.title}</span>
            {!clippedEnd && (
                <span className="zenith-tcal__ribbon-due" aria-label={t('calendar.kind.due')}>
                    <CalendarDays size={11} />
                </span>
            )}
        </button>
    );
};
