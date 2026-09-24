import React, { useMemo, type FC } from 'react';
import { ChevronLeft, ChevronRight, CalendarCheck, Flame } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import { usableTrackers } from '../services/usableTrackers';
import type { TrackerValue } from '../../../store/journalSlice';
import { entriesByDate, currentStreak } from '../services/journalStats';
import { setTrackerValue, openDailyNote } from '../services/journalActions';
import { addDays, buildDateMatcher, relativeNotePath, dayLabel } from '../services/journalDates';
import { TrackerRail } from './TrackerRail';
import { DailyPrompt } from './DailyPrompt';
import { Replaceable } from '../../../core/extensions/ExtensionSlot';
import { useFeature } from '../../../core/useFeature';

interface DailyNoteBlockProps {
    /** Vault path of the note the block was rendered in. */
    sourcePath: string;
}

/**
 * The `zenith-daily` code block: the day's check-in, rendered inside the note
 * itself.
 *
 * The date comes from the note the block sits in, not from the clock, so
 * opening a note from last Tuesday and ticking a habit records it against last
 * Tuesday. The ‹ › buttons walk to the neighbouring days, creating those notes
 * on demand — which is what makes a journal browsable without leaving the
 * editor.
 */
export const DailyNoteBlock: FC<DailyNoteBlockProps> = ({ sourcePath }) => {
    const t = useTranslation();
    const on = useFeature('journal.dailyBlock');
    // Switched off, the block says so in one quiet line rather than going
    // blank: an empty space in the note would look like something broke.
    if (!on) return <div className="zenith-dblock__off">{t('journal.block.off')}</div>;
    return <DailyNoteBody sourcePath={sourcePath} />;
};

const DailyNoteBody: FC<DailyNoteBlockProps> = ({ sourcePath }) => {
    const t = useTranslation();
    const wordsOn = useFeature('journal.wordCount');
    const promptOn = useFeature('journal.dailyPrompt');
    const { app } = useApp();
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);

    const today = getTodayString();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const byDate = useMemo(() => entriesByDate(entries), [entries]);

    /**
     * Which day this note is. The parsed entry is the most reliable answer (it
     * already reconciled frontmatter against the filename); the pattern is the
     * fallback for a note the parser hasn't reached yet, and today's date is
     * the last resort for a block pasted somewhere that isn't a daily note at
     * all — where recording against today is the only sensible reading.
     */
    const date = useMemo(() => {
        const parsed = entries.find((e) => e.filePath === sourcePath);
        if (parsed) return parsed.date;

        const relative = relativeNotePath(sourcePath, settings.journalFolderPath);
        const matched = relative ? buildDateMatcher(settings.journalDateFormat)(relative) : null;
        return matched ?? today;
    }, [entries, sourcePath, settings.journalFolderPath, settings.journalDateFormat, today]);

    const entry = byDate.get(date);
    const streak = useMemo(() => currentStreak(byDate, today), [byDate, today]);

    const change = (tracker: JournalTracker, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, date, tracker.id, next);

    const go = (target: string) => void openDailyNote(app, settings, target);

    return (
        <div className="zenith-dblock">
            <div className="zenith-dblock__head">
                <button
                    type="button"
                    className="zenith-dblock__nav"
                    aria-label={t('journal.prevDay')}
                    title={t('journal.prevDay')}
                    onClick={() => go(addDays(date, -1))}
                >
                    <ChevronLeft size={16} />
                </button>

                <div className="zenith-dblock__title">
                    <span className="zenith-dblock__date">{dayLabel(date, locale)}</span>
                    <span className="zenith-dblock__meta">
                        {date === today && (
                            <span className="zenith-dblock__badge">{t('journal.today')}</span>
                        )}
                        {entry && wordsOn && <span>{t.plural('journal.words', entry.words)}</span>}
                        {streak > 0 && (
                            <span
                                className="zenith-dblock__streak"
                                title={t('journal.stats.streak')}
                            >
                                <Flame size={12} />
                                {streak}
                            </span>
                        )}
                    </span>
                </div>

                <button
                    type="button"
                    className="zenith-dblock__nav"
                    aria-label={t('journal.goToday')}
                    title={t('journal.goToday')}
                    disabled={date === today}
                    onClick={() => go(today)}
                >
                    <CalendarCheck size={15} />
                </button>
                <button
                    type="button"
                    className="zenith-dblock__nav"
                    aria-label={t('journal.nextDay')}
                    title={t('journal.nextDay')}
                    onClick={() => go(addDays(date, 1))}
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            <TrackerRail
                trackers={usableTrackers(settings)}
                values={entry?.values ?? {}}
                onChange={change}
                layout="rail"
            />

            {promptOn && (
                <Replaceable id="journal.day.prompt" props={{ date }}>
                    <DailyPrompt date={date} />
                </Replaceable>
            )}
        </div>
    );
};
