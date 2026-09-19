import React, { type FC } from 'react';
import {
    Ban,
    CalendarDays,
    Check,
    FileText,
    Hourglass,
    MoveRight,
    PlaneTakeoff,
    Repeat,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EntryKind } from '../services/calendarTasks';

/**
 * Overdue, drawn here rather than taken from the pack.
 *
 * Lucide's `triangle-alert` is three thin things at once: a stroked outline, a
 * stroked bar and a stroked dot. At 24px that is a triangle with an
 * exclamation in it. At the 12px a calendar chip gives it, every stroke is
 * half a pixel of coverage spread over two, the interior marks land on top of
 * the outline's anti-aliasing, and the whole glyph resolves as a red smudge —
 * which is what makes it the worst icon in a list where it is also the most
 * urgent one.
 *
 * A filled shape has one edge instead of three, and it survives any size. The
 * exclamation is cut out of the fill rather than drawn on it, so at 12px it is
 * a gap two pixels wide: something the eye resolves as absence, which is
 * easier than resolving a line.
 */
const OverdueMark: FC<{ size: number }> = ({ size }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.26 4a2 2 0 0 1 3.48 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.73-3zM12 9.2a2 2 0 0 0-2 2v2.6a2 2 0 0 0 4 0v-2.6a2 2 0 0 0-2-2m0 6.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4"
        />
    </svg>
);

/**
 * The icon for each reason a task sits on a day. Lucide rather than the Tasks
 * plugin's emoji (📅🛫⏳) so the calendar matches the rest of Zenith — the
 * emoji still appear in each entry's tooltip, which is where you go when you
 * want to know exactly which marker put a task on a day.
 */
const KIND_GLYPH: Record<Exclude<EntryKind, 'overdue'>, LucideIcon> = {
    due: CalendarDays,
    recurrence: Repeat,
    start: PlaneTakeoff,
    scheduled: Hourglass,
    process: MoveRight,
    dailyNote: FileText,
    done: Check,
    cancelled: Ban,
};

export const KindIcon: FC<{ kind: EntryKind; size?: number }> = ({ kind, size = 12 }) => {
    if (kind === 'overdue') return <OverdueMark size={size} />;
    const Glyph = KIND_GLYPH[kind];
    return <Glyph size={size} />;
};

/** i18n key for a kind's label, e.g. `calendar.kind.due`. */
export const kindKey = (kind: EntryKind): string => `calendar.kind.${kind}`;
