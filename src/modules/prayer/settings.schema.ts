import { whenFeature } from '../../settings/schema/featureGroup';
import { Notice } from 'obsidian';
import { coreSchema } from '../../settings/schema/types';
import { useZenithStore } from '../../store';
import { createPlaceField } from '../../settings/components/PlaceField';
import { PrayerAdjustField } from './components/PrayerAdjustField';
import { PrayerMatchField } from './components/PrayerMethodPrompt';
import {
    EXTRA_PRAYERS,
    HIGH_LAT_RULES,
    PRAYER_METHODS,
    PRAYER_ROUNDINGS,
    PRAYER_SOURCES,
} from './prayerConfig';
import { prayerPlaceOf } from './prayerOptions';
import { refreshPrayerTimes } from './prayerSource';

/**
 * Prayer settings.
 *
 * The method, the madhab and the high-latitude rule are all genuine
 * disagreements between authorities rather than preferences, so every one of
 * them is offered rather than decided here — with the values Russian calendars
 * print as the defaults, since that is where this is being used. The per-prayer
 * offsets at the end exist because the mosque you actually pray at rounds and
 * adjusts in its own way, and matching it matters more than matching us.
 */
export const prayerSettingsSchema = coreSchema({
    moduleId: 'prayer',
    groups: [
        {
            id: 'location',
            fields: [
                {
                    type: 'custom',
                    key: 'prayerPlace',
                    row: true,
                    render: createPlaceField({
                        settingsKey: 'prayerPlace',
                        labelKey: 'settings.prayerPlace',
                        descKey: 'settings.prayerPlace.desc',
                        inheritsGlobal: true,
                    }),
                },
            ],
        },
        {
            id: 'calculation',
            titleKey: 'settings.prayerCalcGroup',
            descKey: 'settings.prayerCalcGroup.desc',
            fields: [
                // First, above the settings it fills in: most people know
                // which app they trust, not which method it uses.
                { type: 'custom', key: 'prayerMatch', row: true, render: PrayerMatchField },
                {
                    type: 'segmented',
                    key: 'prayerSource',
                    labelKey: 'settings.prayerSource',
                    descKey: 'settings.prayerSource.desc',
                    default: 'api',
                    options: PRAYER_SOURCES.map((id) => ({
                        value: id,
                        labelKey: `prayer.source.${id}`,
                    })),
                },
                {
                    type: 'select',
                    key: 'prayerApiMidnight',
                    labelKey: 'settings.prayerApiMidnight',
                    descKey: 'settings.prayerApiMidnight.desc',
                    default: 'toFajr',
                    options: [
                        { value: 'toFajr', labelKey: 'prayer.midnight.toFajr' },
                        { value: 'toSunrise', labelKey: 'prayer.midnight.toSunrise' },
                    ],
                    showIf: (v) => v.prayerSource === 'api',
                },
                {
                    type: 'action',
                    key: 'prayerApiRefresh',
                    labelKey: 'settings.prayerApiRefresh',
                    descKey: 'settings.prayerApiRefresh.desc',
                    buttonKey: 'settings.prayerApiRefresh.button',
                    showIf: (v) => v.prayerSource === 'api',
                    run: async ({ t }) => {
                        // Read the live settings rather than the form's bag: the
                        // bag holds only what this page declares, and the place
                        // may be the weather module's.
                        const settings = useZenithStore.getState().settings;
                        const ok = await refreshPrayerTimes(
                            prayerPlaceOf(settings),
                            new Date(),
                            settings
                        );
                        new Notice(
                            t(ok ? 'prayer.api.refreshed' : 'prayer.api.unreachable')
                        );
                    },
                },
                {
                    type: 'select',
                    key: 'prayerMethod',
                    labelKey: 'settings.prayerMethod',
                    descKey: 'settings.prayerMethod.desc',
                    default: 'russia',
                    options: PRAYER_METHODS.map((m) => ({
                        value: m.id,
                        labelKey: `prayer.method.${m.id}`,
                    })),
                },
                {
                    type: 'number',
                    key: 'prayerFajrAngle',
                    labelKey: 'settings.prayerFajrAngle',
                    descKey: 'settings.prayerFajrAngle.desc',
                    default: 16,
                    min: 8,
                    max: 24,
                    step: 0.5,
                    unitKey: 'settings.degreesUnit',
                    showIf: (v) => v.prayerMethod === 'custom',
                },
                {
                    type: 'number',
                    key: 'prayerIshaAngle',
                    labelKey: 'settings.prayerIshaAngle',
                    descKey: 'settings.prayerIshaAngle.desc',
                    default: 15,
                    min: 8,
                    max: 24,
                    step: 0.5,
                    unitKey: 'settings.degreesUnit',
                    showIf: (v) => v.prayerMethod === 'custom',
                },
                {
                    type: 'segmented',
                    key: 'prayerAsrMadhab',
                    labelKey: 'settings.prayerAsr',
                    descKey: 'settings.prayerAsr.desc',
                    default: 'hanafi',
                    options: [
                        { value: 'standard', labelKey: 'prayer.madhab.standard' },
                        { value: 'hanafi', labelKey: 'prayer.madhab.hanafi' },
                    ],
                },
                {
                    type: 'select',
                    key: 'prayerHighLatRule',
                    labelKey: 'settings.prayerHighLat',
                    descKey: 'settings.prayerHighLat.desc',
                    default: 'angleBased',
                    options: HIGH_LAT_RULES.map((rule) => ({
                        value: rule,
                        labelKey: `prayer.highLat.${rule}`,
                    })),
                },
                {
                    // The service prints its own minutes, so this only means
                    // something where the times are worked out here.
                    type: 'segmented',
                    key: 'prayerRounding',
                    labelKey: 'settings.prayerRounding',
                    descKey: 'settings.prayerRounding.desc',
                    default: 'nearest',
                    options: PRAYER_ROUNDINGS.map((id) => ({
                        value: id,
                        labelKey: `prayer.rounding.${id}`,
                    })),
                    showIf: (v) => v.prayerSource === 'local',
                },
                { type: 'custom', key: 'prayerAdjustments', row: true, render: PrayerAdjustField },
            ],
        },
        {
            id: 'display',
            titleKey: 'settings.prayerDisplayGroup',
            fields: [
                { type: 'feature', key: 'prayer.sunrise' },
                {
                    type: 'multiselect',
                    key: 'prayerExtras',
                    labelKey: 'settings.prayerExtras',
                    descKey: 'settings.prayerExtras.desc',
                    default: ['witr'],
                    showIf: whenFeature('prayer.extras'),
                    options: EXTRA_PRAYERS.map((id) => ({
                        value: id,
                        labelKey: `prayer.extra.${id}`,
                    })),
                },
                {
                    type: 'number',
                    key: 'prayerHijriOffset',
                    labelKey: 'settings.prayerHijri',
                    descKey: 'settings.prayerHijri.desc',
                    default: 0,
                    min: -2,
                    max: 2,
                    step: 1,
                    unitKey: 'settings.daysUnit',
                },
            ],
        },
        {
            id: 'reminders',
            titleKey: 'settings.prayerRemindGroup',
            fields: [
                // Here rather than in the list at the top, beside how early
                // the reminder comes.
                {
                    type: 'feature',
                    key: 'prayer.reminders',
                    noteKey: 'settings.prayerNotify.note',
                },
                {
                    type: 'number',
                    key: 'prayerNotifyBefore',
                    labelKey: 'settings.prayerNotifyBefore',
                    descKey: 'settings.prayerNotifyBefore.desc',
                    default: 10,
                    min: 0,
                    max: 60,
                    step: 5,
                    unitKey: 'settings.minutesUnit',
                    showIf: whenFeature('prayer.reminders'),
                },
            ],
        },
    ],
});
