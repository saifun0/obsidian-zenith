import React, { useMemo, type FC } from 'react';
import { PenLine } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { activeTrackers, type JournalTracker } from '../../../core/journalConfig';
import type { TrackerValue } from '../../../store/journalSlice';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { entriesByDate, isJournalled } from '../services/journalStats';
import { setTrackerValue, openDailyNote } from '../services/journalActions';
import { TrackerRail } from './TrackerRail';

/**
 * JournalCheckinWidget — today's trackers and nothing else.
 *
 * The controls scroll rather than wrap, so every tracker stays reachable at
 * every card size; a small card shows a short window onto the same strip
 * instead of hiding whatever no longer fits.
 */
export const JournalCheckinWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const { app } = useApp();
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);

    const today = getTodayString();
    const byDate = useMemo(() => entriesByDate(entries), [entries]);
    const entry = byDate.get(today);

    const change = (tracker: JournalTracker, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, today, tracker.id, next);

    return (
        <div className="zenith-jw">
            <div className="zenith-jw__head">
                <div className="zenith-jw__head-text">
                    <span className="zenith-jw__eyebrow">{t('journal.widget.checkIn')}</span>
                    <span className="zenith-jw__summary">
                        {isJournalled(entry)
                            ? t.plural('journal.words', entry?.words ?? 0)
                            : t('journal.widget.blank')}
                    </span>
                </div>
            </div>

            <TrackerRail
                trackers={activeTrackers(settings.journalTrackers)}
                values={entry?.values ?? {}}
                onChange={change}
                layout={size === 'lg' ? 'wrap' : 'rail'}
                compact={size === 'sm'}
            />

            <button
                className="zenith-jw__cta"
                onClick={() => void openDailyNote(app, settings, today)}
            >
                <PenLine size={14} />
                <span>{entry ? t('journal.openNote') : t('journal.createNote')}</span>
            </button>
        </div>
    );
};
