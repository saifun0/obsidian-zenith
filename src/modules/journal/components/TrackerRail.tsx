import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import type { JournalTracker } from '../../../core/journalConfig';
import type { TrackerValue } from '../../../store/journalSlice';
import { TrackerControl } from './TrackerControl';

interface TrackerRailProps {
    trackers: JournalTracker[];
    /** The day's recorded values, by tracker id. */
    values: Record<string, TrackerValue>;
    onChange: (tracker: JournalTracker, next: TrackerValue | null) => void;
    /**
     * `rail` keeps everything on one scrollable line — for widgets and the
     * in-note block, where vertical space is whatever the user gave it.
     * `wrap` lets controls flow onto several lines, for the day panel.
     */
    layout?: 'rail' | 'wrap';
    compact?: boolean;
}

/**
 * Every tracker's control in one strip.
 *
 * In `rail` layout the strip scrolls horizontally instead of wrapping, and no
 * control is ever allowed to shrink. That is deliberate: a widget resized small
 * used to drop the controls that no longer fit, which silently made some
 * habits un-tickable at some sizes. Scrolling keeps all of them reachable at
 * every width — you may have to swipe, but nothing disappears.
 */
export const TrackerRail: FC<TrackerRailProps> = ({
    trackers,
    values,
    onChange,
    layout = 'rail',
    compact = false,
}) => {
    const t = useTranslation();

    if (trackers.length === 0) {
        return <p className="zenith-trail__empty">{t('journal.noTrackers')}</p>;
    }

    return (
        <div
            className={`zenith-trail zenith-trail--${layout}`}
            role="group"
            aria-label={t('journal.trackers')}
        >
            {trackers.map((tracker) => (
                <div key={tracker.id} className="zenith-trail__item">
                    <TrackerControl
                        tracker={tracker}
                        value={values[tracker.id]}
                        onChange={(next) => onChange(tracker, next)}
                        compact={compact}
                    />
                </div>
            ))}
        </div>
    );
};
