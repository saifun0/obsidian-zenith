import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { PRAYERS, TIME_ICONS } from '../prayerConfig';
import type { PrayerTimeId } from '../prayerTimes';

/** Everything that can be nudged: the five, plus sunrise (it closes fajr). */
const ADJUSTABLE: readonly PrayerTimeId[] = ['fajr', 'sunrise', ...PRAYERS.slice(1)] as const;

/** Far enough to reconcile any published table; further would be a wrong method. */
const LIMIT = 30;

/**
 * Per-prayer minute offsets.
 *
 * A settings row per prayer would be six near-identical rows of the same
 * control; this is one row of steppers that reads as what it is — a column of
 * corrections against a calculation, with the deviation shown next to each so a
 * forgotten −7 can be spotted at a glance.
 */
export const PrayerAdjustField: React.FC = () => {
    const t = useTranslation();
    const adjustments = useZenithStore((s) => s.settings.prayerAdjustments);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const valueOf = (id: PrayerTimeId): number => adjustments[id] ?? 0;

    const nudge = (id: PrayerTimeId, delta: number) => {
        const next = Math.max(-LIMIT, Math.min(LIMIT, valueOf(id) + delta));
        const patch = { ...adjustments };
        // A zero offset is the absence of an offset: keeping it would grow the
        // stored object with entries that mean nothing.
        if (next === 0) delete patch[id];
        else patch[id] = next;
        updateSettings({ prayerAdjustments: patch });
    };

    const touched = Object.values(adjustments).some((v) => v !== 0);

    return (
        <div className="zenith-settings__item zenith-settings__item--stack">
            <div className="zenith-settings__item-info">
                <span className="zenith-settings__item-name">{t('settings.prayerAdjust')}</span>
                <span className="zenith-settings__item-desc">{t('settings.prayerAdjust.desc')}</span>
            </div>

            <div className="zenith-prayer-adjust">
                {ADJUSTABLE.map((id) => {
                    const value = valueOf(id);
                    return (
                        <div key={id} className="zenith-prayer-adjust__row">
                            <span className="zenith-prayer-adjust__name">
                                <DynamicIcon name={TIME_ICONS[id]} size={13} />
                                {t(`prayer.${id}`)}
                            </span>
                            <span className="zenith-prayer-adjust__stepper">
                                <button
                                    type="button"
                                    className="zenith-prayer-adjust__btn"
                                    onClick={() => nudge(id, -1)}
                                    disabled={value <= -LIMIT}
                                    aria-label={`${t(`prayer.${id}`)} −1`}
                                >
                                    −
                                </button>
                                <span
                                    className={`zenith-prayer-adjust__value ${value !== 0 ? 'is-set' : ''}`}
                                >
                                    {value > 0 ? `+${value}` : value}
                                </span>
                                <button
                                    type="button"
                                    className="zenith-prayer-adjust__btn"
                                    onClick={() => nudge(id, 1)}
                                    disabled={value >= LIMIT}
                                    aria-label={`${t(`prayer.${id}`)} +1`}
                                >
                                    +
                                </button>
                            </span>
                        </div>
                    );
                })}
            </div>

            {touched && (
                <button
                    type="button"
                    className="zenith-settings__inline-btn"
                    onClick={() => updateSettings({ prayerAdjustments: {} })}
                >
                    <RotateCcw size={13} />
                    {t('settings.reset')}
                </button>
            )}
        </div>
    );
};
