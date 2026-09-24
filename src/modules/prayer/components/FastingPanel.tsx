import React, { useMemo, type FC } from 'react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { useZenithStore } from '../../../store';
import { writeTrackerValues } from '../../journal/services/journalActions';
import {
    FAST_KEY,
    fastChoices,
    fastsByDate,
    qadaCount,
    ramadanProgress,
    voluntaryHint,
    type FastKind,
} from '../fasting';

/**
 * The day's fast, under the prayers: a choice of what fits the day — in
 * Ramadan, kept / broken / excused; otherwise made up / voluntary — and a tap
 * on the chosen one clears it. In Ramadan a line of progress; all year, how
 * many fasts have been made up; and, if asked for, whether the day is one of
 * the recommended voluntary fasts.
 */
export const FastingPanel: FC<{ date: string; locked: boolean }> = ({ date, locked }) => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const entries = useZenithStore((s) => s.journalEntries);
    const hintsOn = useFeature('prayer.fastingHints');
    const offset = settings.prayerHijriOffset;

    const fasts = useMemo(() => fastsByDate(entries), [entries]);
    const current = fasts.get(date);
    const ramadan = useMemo(() => ramadanProgress(fasts, date, offset), [fasts, date, offset]);
    const madeUp = useMemo(() => qadaCount(fasts), [fasts]);
    const hint = hintsOn ? voluntaryHint(date, offset) : null;
    const choices = fastChoices(date, offset);

    const set = (kind: FastKind) =>
        void writeTrackerValues(app, settings, date, {
            [FAST_KEY]: current === kind ? null : kind,
        });

    return (
        <section className="zenith-prayer__fast">
            <div className="zenith-prayer__list-head">
                <span className="zenith-prayer__kicker">{t('fast.title')}</span>
            </div>
            <div className="zenith-prayer__fast-choices" role="group" aria-label={t('fast.title')}>
                {choices.map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        className={`zenith-prayer__extra is-compact ${current === kind ? 'is-done' : ''}`}
                        aria-pressed={current === kind}
                        disabled={locked}
                        onClick={() => set(kind)}
                    >
                        {t(`fast.kind.${kind}`)}
                    </button>
                ))}
            </div>
            {ramadan && (
                <p className="zenith-prayer__note">
                    {t('fast.ramadan', {
                        day: ramadan.day,
                        length: ramadan.length,
                        fasted: ramadan.fasted,
                    })}
                </p>
            )}
            {madeUp > 0 && (
                <p className="zenith-prayer__note">{t.plural('fast.qadaCount', madeUp)}</p>
            )}
            {hint && <p className="zenith-prayer__note is-hint">{t(`fast.hint.${hint}`)}</p>}
        </section>
    );
};
