import React, { useMemo, type FC } from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { buildDateMatcher, relativeNotePath } from '../../journal/services/journalDates';
import { EXTRA_PRAYERS, PRAYERS, isPerformed, type PrayerId } from '../prayerConfig';
import { setExtraPrayer, setPrayerStatus, statusForTap } from '../prayerActions';
import { dayOf } from '../prayerStats';
import { formatClock, hasEntered, nextPrayer } from '../prayerTimes';
import { useCountdownText } from './useCountdownText';
import {
    useDayTimes,
    useNowMinutes,
    usePrayerDays,
    usePrayerExtras,
    usePrayerPlace,
} from '../usePrayer';
import { PrayerTile } from './PrayerTile';
import { ExtraButton } from './PrayerWidget';
import { usePrayerMenu } from './usePrayerMenu';

interface PrayerNoteBlockProps {
    /** Vault path of the note the block was rendered in. */
    sourcePath: string;
}

/**
 * The `zenith-prayer` code block: the day's prayers, inside the note itself.
 *
 * Framed by two rules rather than boxed in a card — it sits in the middle of
 * prose, and a card would read as an attachment rather than as part of the
 * entry. The date comes from the note the block sits in, so opening last
 * Tuesday's note and ticking maghrib records it against last Tuesday.
 */
export const PrayerNoteBlock: FC<PrayerNoteBlockProps> = ({ sourcePath }) => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const entries = useZenithStore((s) => s.journalEntries);

    const today = getTodayString();

    /**
     * Which day this note is. The parsed entry is the most reliable answer; the
     * filename pattern covers a note the parser hasn't reached yet, and today
     * is the last resort for a block pasted outside the journal entirely.
     */
    const date = useMemo(() => {
        const parsed = entries.find((e) => e.filePath === sourcePath);
        if (parsed) return parsed.date;
        const relative = relativeNotePath(sourcePath, settings.journalFolderPath);
        const matched = relative ? buildDateMatcher(settings.journalDateFormat)(relative) : null;
        return matched ?? today;
    }, [entries, sourcePath, settings.journalFolderPath, settings.journalDateFormat, today]);

    const day = useDayTimes(date);
    const place = usePrayerPlace();
    const days = usePrayerDays();
    const nowMinutes = useNowMinutes();
    const extras = usePrayerExtras();
    const openMenu = usePrayerMenu(date);
    const countdownText = useCountdownText(today);

    if (!place || !day) {
        return <div className="zenith-prayer__note">{t('prayer.noPlace')}</div>;
    }

    const { times } = day;
    const record = dayOf(days, date);
    const isToday = date === today;
    const done = PRAYERS.filter((id) => isPerformed(record.statuses[id])).length;
    const enabledExtras = EXTRA_PRAYERS.filter((id) => extras.includes(id));
    const next = isToday ? nextPrayer(times, nowMinutes) : null;

    const tap = (prayer: PrayerId) => {
        const status = record.statuses[prayer];
        void setPrayerStatus(
            app,
            settings,
            date,
            prayer,
            status ? null : statusForTap(times, prayer, isToday ? nowMinutes : 1440)
        );
    };

    return (
        <div className="zenith-prayer zenith-prayer--block">
            <div className="zenith-prayer__block-head">
                {next ? (
                    <span>
                        {t(`prayer.${next.id}`)} {countdownText(next)}
                        {' · '}
                        <b>{formatClock(next.at, t.locale)}</b>
                    </span>
                ) : (
                    <span>{isToday ? t('prayer.noTimes') : date}</span>
                )}
                <span className="zenith-prayer__counter">
                    {t('prayer.done', { done, total: PRAYERS.length })}
                </span>
            </div>

            <div className="zenith-prayer__tiles">
                {PRAYERS.map((id) => (
                    <PrayerTile
                        key={id}
                        prayer={id}
                        at={times[id]}
                        status={record.statuses[id]}
                        entered={!isToday ? date <= today : hasEntered(times, id, nowMinutes)}
                        variant="note"
                        markSize={11}
                        onTap={tap}
                        onMenu={openMenu}
                    />
                ))}
            </div>

            {enabledExtras.length > 0 && (
                <div className="zenith-prayer__extras">
                    {enabledExtras.map((id) => (
                        <ExtraButton
                            key={id}
                            extra={id}
                            done={!!record.extras[id]}
                            onToggle={() =>
                                void setExtraPrayer(app, settings, date, id, !record.extras[id])
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
