import React, { type FC } from 'react';
import {
    AlertTriangle,
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
 * The icon for each reason a task sits on a day. Lucide rather than the Tasks
 * plugin's emoji (📅🛫⏳) so the calendar matches the rest of Zenith — the
 * emoji still appear in each entry's tooltip, which is where you go when you
 * want to know exactly which marker put a task on a day.
 */
const KIND_GLYPH: Record<EntryKind, LucideIcon> = {
    overdue: AlertTriangle,
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
    const Glyph = KIND_GLYPH[kind];
    return <Glyph size={size} />;
};

/** i18n key for a kind's label, e.g. `calendar.kind.due`. */
export const kindKey = (kind: EntryKind): string => `calendar.kind.${kind}`;
