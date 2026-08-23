import React from 'react';
import { useTranslation } from '../../../core/i18n';
import type { PrayerStatus } from '../prayerConfig';

/**
 * What a prayer looks like at a glance.
 *
 * Five states, told apart by **shape** first and colour second: a filled circle
 * for on time, an empty ring for late, a cross for a missed prayer, a dashed
 * ring for one nobody has answered for, and a small dot for one whose time
 * hasn't come. Colour only confirms what the shape already said.
 *
 * That order matters because the same mark has to survive being drawn at 4px in
 * a calendar cell, on a light theme and on a dark one, and next to four of its
 * siblings. Five shades of a status would fail all three.
 */

/** A prayer's state on a given day — the status, or why there isn't one. */
export type MarkState = PrayerStatus | 'future' | 'absent' | 'none';

/** Resolve a prayer to the state its mark should show. */
export function markState(
    status: PrayerStatus | undefined,
    entered: boolean,
    hasTime: boolean
): MarkState {
    if (!hasTime) return 'absent';
    if (status) return status;
    return entered ? 'none' : 'future';
}

/** Whether a state can be acted on: no time, or no time *yet*, means no. */
export function isActionable(state: MarkState): boolean {
    return state !== 'future' && state !== 'absent';
}

interface PrayerMarkProps {
    state: MarkState;
    /** Edge length in px. Everything else scales off it. */
    size?: number;
}

export const PrayerMark: React.FC<PrayerMarkProps> = ({ state, size = 13 }) => {
    const t = useTranslation();

    // Not a mark at all: at a latitude where the sun never reaches the angle
    // there is no time to show, and a shape would imply there was one.
    if (state === 'absent') {
        return <span className="zenith-prayer__mark-absent">{t('prayer.absent')}</span>;
    }

    // The dot for a prayer whose time hasn't come is deliberately tiny.
    const box = state === 'future' ? Math.max(4, Math.round(size * 0.36)) : size;

    const style: React.CSSProperties = { width: box, height: box };
    if (state === 'late') style.borderWidth = Math.max(2, Math.round(size * 0.23));
    if (state === 'missed') style.fontSize = size + 2;

    return (
        <i className={`zenith-prayer__mark is-${state}`} style={style} aria-hidden="true">
            {state === 'missed' ? '✕' : ''}
        </i>
    );
};
