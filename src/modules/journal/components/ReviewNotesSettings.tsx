import React, { type FC } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { isPluginEnabled } from '../../../core/otherPlugins';
import { getTodayString } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import {
    REVIEW_PERIODS,
    normalizeReviewNotes,
    type ReviewNoteConfig,
    type ReviewPeriod,
} from '../services/reviewPeriods';
import { reviewPath, reviewRange } from '../services/reviewNotes';

/** Periodic Notes keeps weekly, monthly and yearly notes of its own. */
export const PERIODIC_NOTES_ID = 'periodic-notes';

/**
 * Where each period's note goes, what it is called and what it starts from —
 * one row per period, with the path this week's (month's…) note would get,
 * so a pattern is checked by reading its result rather than its tokens.
 */
export const ReviewNotesSettings: FC = () => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const notes = normalizeReviewNotes(settings.journalReviewNotes);
    const today = getTodayString();

    const patch = (period: ReviewPeriod, change: Partial<ReviewNoteConfig>) =>
        updateSettings({
            journalReviewNotes: { ...notes, [period]: { ...notes[period], ...change } },
        });

    return (
        <div className="zenith-settings__item zenith-settings__item--stack">
            <div className="zenith-settings__item-info">
                <span className="zenith-settings__item-name">{t('settings.reviews')}</span>
                <span className="zenith-settings__item-desc">{t('settings.reviews.desc')}</span>
            </div>
            {isPluginEnabled(app, PERIODIC_NOTES_ID) && (
                <div className="zenith-settings__hint zenith-settings__hint--warn">
                    <AlertTriangle size={13} />
                    {t('settings.reviews.periodicNotes')}
                </div>
            )}
            <div className="zenith-review-settings">
                {REVIEW_PERIODS.map((period) => (
                    <div key={period} className="zenith-review-settings__row">
                        <span className="zenith-review-settings__period">
                            {t(`review.period.${period}`)}
                        </span>
                        <input
                            type="text"
                            className="zenith-settings__input"
                            value={notes[period].folder}
                            placeholder={settings.journalFolderPath || t('settings.reviews.folder')}
                            aria-label={t('settings.reviews.folder')}
                            onChange={(e) => patch(period, { folder: e.target.value })}
                        />
                        <input
                            type="text"
                            className="zenith-settings__input is-mono"
                            value={notes[period].format}
                            aria-label={t('settings.reviews.format')}
                            onChange={(e) => patch(period, { format: e.target.value })}
                        />
                        <input
                            type="text"
                            className="zenith-settings__input"
                            value={notes[period].template}
                            placeholder={t('settings.reviews.template')}
                            aria-label={t('settings.reviews.template')}
                            onChange={(e) => patch(period, { template: e.target.value })}
                        />
                        <span className="zenith-review-settings__path">
                            {reviewPath(settings, reviewRange(settings, period, today))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
