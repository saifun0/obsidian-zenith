import React, { type CSSProperties, type FC } from 'react';
import { CalendarRange, Clock3, Flame, Gauge, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { trackerFacts, type TrackerFact } from './trackerWindow';

interface TrackerStripProps {
    stat: TrackerStat;
}

/** The mark that says what a chip is counting, before the number does. */
const ICONS: Record<TrackerFact['key'], LucideIcon> = {
    average: Gauge,
    coverage: CalendarRange,
    run: Flame,
    last: Clock3,
};

/**
 * The active tracker's window in one line, for a card with no room for the panel.
 *
 * A small card used to say one thing: a figure and the tracker's name. That is
 * the *reading* with none of what makes a reading mean anything — "3.5 of 5" is
 * the same sentence whether it stands on twenty-eight days or on two, and
 * whether the last of them was this morning or in July. The panel says all of
 * that beside the face on a wide card and is dropped on every card too narrow
 * to seat a column, which is exactly where the figure alone is least
 * defensible.
 *
 * So the panel's own facts get a line under the deck instead: the tracker's
 * average, how much of the window was recorded, how long the current run is,
 * how stale the last mark is — whichever of those its kind has, in the same
 * order the panel would have set them. Two words each, an icon apiece so the
 * line scans as separate readings rather than as one sentence, and the panel's
 * full phrasing on each chip's tooltip.
 *
 * It is mounted with the active tracker's id as its key, so switching trackers
 * remounts it and the chips play their entrance again — see `zenith-jfact-in`.
 * That is the whole animation, and it is deliberately tied to the mount:
 * content that CHANGED says so by arriving, and content that merely updated (a
 * value edited in the journal while this card is on screen) stays still.
 */
export const TrackerStrip: FC<TrackerStripProps> = ({ stat }) => {
    const t = useTranslation();
    const facts = trackerFacts(stat, t);

    return (
        <div
            className="zenith-jdeck__strip"
            style={{ ['--jdeck-color' as string]: stat.tracker.color } as CSSProperties}
            aria-label={t('journal.stats.panelAria', { name: stat.tracker.label })}
        >
            {facts.map((fact, i) => {
                const Icon = ICONS[fact.key];
                return (
                    <span
                        key={fact.key}
                        className="zenith-jfact"
                        // The stagger is a number on the element rather than a
                        // selector per position: how many chips there are is
                        // the tracker's kind's business, and `nth-child` would
                        // have to be written once per count to say one thing.
                        style={{ ['--jfact-at' as string]: i } as CSSProperties}
                        title={fact.label}
                    >
                        <Icon size={11} strokeWidth={2.25} aria-hidden="true" />
                        <span className="zenith-jfact__value">{fact.short}</span>
                        {fact.unit && <span className="zenith-jfact__unit">{fact.unit}</span>}
                    </span>
                );
            })}
        </div>
    );
};
