import { useFeature } from '../../../core/useFeature';
import React, { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { PenLine } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import { usableTrackers } from '../services/usableTrackers';
import type { TrackerValue } from '../../../store/journalSlice';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { entriesByDate, isJournalled } from '../services/journalStats';
import { setTrackerValue, openDailyNote } from '../services/journalActions';
import { TrackerRail } from './TrackerRail';

/** Narrower than this a card is a phone's column, whatever size it was given. */
const NARROW_PX = 420;

/**
 * JournalCheckinWidget — today's trackers and nothing else.
 *
 * The controls wrap onto as many lines as they need, at every size. On the two
 * smaller cards they used to stand in one line that scrolled sideways — every
 * tracker reachable, and most of them out of sight: a card with eight trackers
 * showed three and a scrollbar over two thirds of an empty card. What does not
 * fit now goes down, where the card has the room and scrolls anyway.
 *
 * A control is drawn without its name on the small card, and on any card that
 * is a phone's column wide: in one column every size is that narrow, and a
 * medium card of named controls there was five lines in a card of four.
 */
export const JournalCheckinWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const host = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);
    useLayoutEffect(() => {
        const el = host.current;
        if (!el) return;
        const read = () => setNarrow(el.clientWidth > 0 && el.clientWidth < NARROW_PX);
        read();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
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
        <div className="zenith-jw" ref={host}>
            <div className="zenith-jw__head">
                <div className="zenith-jw__head-text">
                    <span className="zenith-jw__eyebrow">{t('journal.widget.checkIn')}</span>
                    <span className="zenith-jw__summary">
                        {!isJournalled(entry)
                            ? t('journal.widget.blank')
                            : wordsOn
                              ? t.plural('journal.words', entry?.words ?? 0)
                              : t('journal.widget.written')}
                    </span>
                </div>
            </div>

            <TrackerRail
                trackers={usableTrackers(settings)}
                values={entry?.values ?? {}}
                onChange={change}
                layout="wrap"
                compact={size === 'sm' || narrow}
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
