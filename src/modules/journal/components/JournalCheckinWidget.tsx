import { useFeature } from '../../../core/useFeature';
import React, { useMemo, type FC } from 'react';
import { PenLine } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import { usableTrackers } from '../services/usableTrackers';
import type { TrackerValue } from '../../../store/journalSlice';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { ROOM_WIDE, useCardRoom } from '../../dashboard/cardRoom';
import { entriesByDate, isJournalled } from '../services/journalStats';
import { setTrackerValue, openDailyNote } from '../services/journalActions';
import { TrackerRail } from './TrackerRail';

/**
 * JournalCheckinWidget — today's trackers and nothing else.
 *
 * The controls wrap onto as many lines as they need, and the card is as tall
 * as they come to: it follows its content, so eight trackers and two both
 * make a card that is full. Under them, one line — whether today has been
 * written on, and the way into its note.
 *
 * A control is drawn with its name where there is the width for names, and
 * without where there is not: in a phone's column, or a third of a board, a
 * card of named controls was five lines in a card of four.
 */
export const JournalCheckinWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const room = useCardRoom();
    const compact = room.width < ROOM_WIDE;
    const wordsOn = useFeature('journal.wordCount');
    const { app } = useApp();
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);

    const today = getTodayString();
    const byDate = useMemo(() => entriesByDate(entries), [entries]);
    const entry = byDate.get(today);

    const change = (tracker: JournalTracker, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, today, tracker.id, next);

    return (
        <div className="zenith-jw zenith-jw--checkin">
            <TrackerRail
                trackers={usableTrackers(settings)}
                values={entry?.values ?? {}}
                onChange={change}
                layout="wrap"
                compact={compact}
            />

            <div className="zenith-wfoot">
                <span className="zenith-wfoot__note">
                    {!isJournalled(entry)
                        ? t('journal.widget.blank')
                        : wordsOn
                          ? t.plural('journal.words', entry?.words ?? 0)
                          : t('journal.widget.written')}
                </span>
                <button
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-wfoot__open"
                    onClick={() => void openDailyNote(app, settings, today)}
                >
                    <PenLine size={13} />
                    <span>{entry ? t('journal.openNote') : t('journal.createNote')}</span>
                </button>
            </div>
        </div>
    );
};
