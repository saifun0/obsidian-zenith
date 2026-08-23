import React from 'react';
import { useTranslation } from '../../../core/i18n';
import type { PrayerId, PrayerStatus } from '../prayerConfig';
import { formatClock } from '../prayerTimes';
import { PrayerMark, isActionable, markState, type MarkState } from './PrayerMark';

/**
 * One prayer as a control.
 *
 * Two shapes, same anatomy: a **tile** (name over time over mark) for the grid
 * beside the countdown, and a **row** (name, time, mark on one line) for narrow
 * panes where five tiles would each be 60px wide.
 *
 * The name is always present. The version this replaces dropped it whenever the
 * card got short, which left five identical unlabelled boxes — the tile has a
 * fixed anatomy now, and the sizes differ only in scale.
 */

export type TileVariant = 'tile' | 'row' | 'note';

export interface PrayerTileProps {
    prayer: PrayerId;
    /** Minutes from midnight, or NaN where the time doesn't exist. */
    at: number;
    status: PrayerStatus | undefined;
    /** Whether its time has come in. */
    entered: boolean;
    /** The next prayer gets the accent outline — one focal point per card. */
    isNext?: boolean;
    variant?: TileVariant;
    /** Mark size in px; the tile scales with the card. */
    markSize?: number;
    /** Spell the status out under the mark. Only the largest card has room. */
    showStatus?: boolean;
    onTap: (prayer: PrayerId) => void;
    onMenu: (e: React.MouseEvent, prayer: PrayerId, status: PrayerStatus | undefined) => void;
}

export const PrayerTile: React.FC<PrayerTileProps> = ({
    prayer,
    at,
    status,
    entered,
    isNext = false,
    variant = 'tile',
    markSize = 13,
    showStatus = false,
    onTap,
    onMenu,
}) => {
    const t = useTranslation();
    const state: MarkState = markState(status, entered, Number.isFinite(at));
    const actionable = isActionable(state);
    const label = t(`prayer.${prayer}`);
    const time = formatClock(at, t.locale);

    const title = actionable
        ? `${label} ${time} — ${t(`prayer.status.${status ?? 'none'}`)}`
        : `${label} — ${state === 'absent' ? t('prayer.absent') : t('prayer.notEntered')}`;

    return (
        <button
            type="button"
            className={`zenith-prayer__tile zenith-prayer__tile--${variant} is-${state} ${
                isNext ? 'is-next' : ''
            }`}
            data-prayer={prayer}
            disabled={!actionable}
            onClick={() => actionable && onTap(prayer)}
            onContextMenu={(e) => actionable && onMenu(e, prayer, status)}
            title={title}
            aria-label={title}
        >
            <span className="zenith-prayer__tile-name">{label}</span>
            {variant !== 'note' && (
                <span className="zenith-prayer__tile-time">
                    {state === 'absent' ? '—' : time}
                </span>
            )}
            <span className="zenith-prayer__tile-mark">
                <PrayerMark state={state} size={markSize} />
            </span>
            {showStatus && actionable && (
                <span className="zenith-prayer__tile-status">
                    {t(`prayer.status.${status ?? 'none'}`)}
                </span>
            )}
        </button>
    );
};
