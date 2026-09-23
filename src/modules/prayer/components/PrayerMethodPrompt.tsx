import React, { useState, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { Dropdown } from '../../../components/ui/fields';
import { ActionButton, Segmented, SettingRow } from '../../../settings/controls';
import { PRAYER_METHODS, type AsrMadhab } from '../prayerConfig';
import { PrayerMatchDialog } from './PrayerMatchDialog';

/**
 * Settings → Prayer → "Match my app": the way into the dialog, at the top of
 * the calculation group, above the four settings it fills in.
 */
export const PrayerMatchField: FC = () => {
    const t = useTranslation();
    const [open, setOpen] = useState(false);
    return (
        <>
            <SettingRow
                label={t('settings.prayerMatch')}
                desc={t('settings.prayerMatch.desc')}
                group
            >
                <ActionButton
                    label={t('settings.prayerMatch.button')}
                    cta
                    onClick={() => setOpen(true)}
                />
            </SettingRow>
            {open && <PrayerMatchDialog onClose={() => setOpen(false)} />}
        </>
    );
};

/**
 * The question the prayer view asks until it has an answer: which method, and
 * which madhab for asr.
 *
 * These used to be silent defaults — the Russian muftiate's angles and a
 * Hanafi asr — and a user elsewhere got times twelve minutes out at fajr and
 * fifty at asr without ever being told a choice had been made for them. Both
 * are genuine disagreements between authorities, and the madhab is a matter of
 * practice, so the view asks rather than assumes. The current values are
 * offered as they stand; confirming them is enough.
 */
export const PrayerMethodPrompt: FC = () => {
    const t = useTranslation();
    const current = useZenithStore((s) => s.settings.prayerMethod);
    const currentMadhab = useZenithStore((s) => s.settings.prayerAsrMadhab);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [method, setMethod] = useState(current);
    const [madhab, setMadhab] = useState<AsrMadhab>(currentMadhab);
    const [matching, setMatching] = useState(false);

    // Own angles are set on the settings page, where their two fields are; here
    // they are offered only when already chosen.
    const methods = PRAYER_METHODS.filter((m) => m.id !== 'custom' || m.id === current);

    return (
        <section className="zenith-prayer-choose">
            <p className="zenith-prayer-choose__title">{t('prayer.choose.title')}</p>
            <p className="zenith-prayer-choose__lead">{t('prayer.choose.lead')}</p>

            <div className="zenith-prayer-choose__fields">
                <label className="zenith-prayer-choose__field">
                    <span>{t('prayer.choose.method')}</span>
                    <Dropdown
                        size="sm"
                        value={method}
                        options={methods.map((m) => ({
                            value: m.id,
                            label: t(`prayer.method.${m.id}`),
                        }))}
                        onChange={setMethod}
                    />
                </label>
                <div className="zenith-prayer-choose__field">
                    <span>{t('prayer.match.asr')}</span>
                    <Segmented
                        value={madhab}
                        options={[
                            { value: 'standard', label: t('prayer.madhab.standard') },
                            { value: 'hanafi', label: t('prayer.madhab.hanafi') },
                        ]}
                        onChange={(v) => setMadhab(v as AsrMadhab)}
                    />
                </div>
            </div>

            <div className="zenith-prayer-choose__actions">
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost"
                    onClick={() => setMatching(true)}
                >
                    {t('prayer.choose.match')}
                </button>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--primary"
                    onClick={() =>
                        updateSettings({
                            prayerMethod: method,
                            prayerAsrMadhab: madhab,
                            prayerMethodChosen: true,
                        })
                    }
                >
                    {t('prayer.choose.confirm')}
                </button>
            </div>

            {matching && <PrayerMatchDialog onClose={() => setMatching(false)} />}
        </section>
    );
};
