import React, { useMemo, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { effectiveContentTypes } from '../../../core/contentTypes';
import { useZenithStore } from '../../../store';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { SettingRow, Toggle } from '../../../settings/controls';
import { goalsFor, withGoal } from '../services/challenge';

/**
 * Settings → Content → the year's challenge: a number per type, for this year
 * only. Empty or zero is no goal.
 */
export const ChallengeField: FC = () => {
    const t = useTranslation();
    const saved = useZenithStore((s) => s.settings.contentTypes);
    const goals = useZenithStore((s) => s.settings.contentChallenges);
    const rereads = useZenithStore((s) => s.settings.contentChallengeRereads);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const types = useMemo(() => effectiveContentTypes(saved), [saved]);
    const year = Number(getTodayString().slice(0, 4));
    const current = goalsFor(goals, year);

    return (
        <div className="zenith-settings__item zenith-settings__item--stack">
            <div className="zenith-settings__item-info">
                <span className="zenith-settings__item-name">
                    {t('settings.contentChallenge', { year })}
                </span>
                <span className="zenith-settings__item-desc">
                    {t('settings.contentChallenge.desc')}
                </span>
            </div>
            <div className="zenith-challenge-settings">
                {types.map((type) => (
                    <label key={type.id} className="zenith-ctype__field">
                        <span>
                            <ObsidianIcon name={type.icon} size={12} /> {type.label}
                        </span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            className="zenith-input zenith-input--sm"
                            value={current[type.id] ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                                updateSettings({
                                    contentChallenges: withGoal(
                                        goals,
                                        year,
                                        type.id,
                                        Number(e.target.value) || 0
                                    ),
                                })
                            }
                        />
                    </label>
                ))}
            </div>
            <SettingRow
                label={t('settings.contentChallengeRereads')}
                desc={t('settings.contentChallengeRereads.desc')}
                compact
            >
                <Toggle
                    checked={rereads}
                    onChange={(v) => updateSettings({ contentChallengeRereads: v })}
                />
            </SettingRow>
        </div>
    );
};
