import { createElement, type FC } from 'react';
import { coreSchema, type CustomFieldProps } from '../../settings/schema/types';
import { whenFeature } from '../../settings/schema/featureGroup';
import { SettingRow } from '../../settings/controls';
import { getTodayString } from '../../core/dateUtils';
import { useZenithStore } from '../../store';
import { anchorFor, weekOfCycle } from './studyTime';
import { weekName } from './useStudy';
import { openStudyDialog } from './openStudyDialog';
import { ImportDialog } from './components/ImportDialog';
import { EditorDialog } from './components/EditorDialog';
import { Segmented } from './components/LessonForm';
import { copyPrompt } from './components/parts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) =>
    typeof v === 'string' && v.trim() !== '' && !ISO.test(v.trim())
        ? 'settings.studyTerm.invalid'
        : null;

/** "This week is the 1st / 2nd" — setting it moves the anchor, and the rest follows. */
const ThisWeekField: FC<CustomFieldProps> = ({ t }) => {
    const settings = useZenithStore((s) => s.settings);
    const update = useZenithStore((s) => s.updateSettings);
    const today = getTodayString();
    const current = weekOfCycle(today, { twoWeeks: true, anchor: settings.studyWeekAnchor });
    return (
        <SettingRow
            label={t('settings.studyThisWeek')}
            desc={t('settings.studyThisWeek.desc')}
            compact
        >
            <Segmented
                value={String(current)}
                label={t('settings.studyThisWeek')}
                options={[1, 2].map((w) => ({
                    value: String(w),
                    label: weekName(t, w as 1 | 2, settings.studyWeekNames),
                }))}
                onChange={(v) => update({ studyWeekAnchor: anchorFor(today, v === '2' ? 2 : 1) })}
            />
        </SettingRow>
    );
};

/**
 * Study settings. The timetable itself is not edited here — it has a paste
 * box and an editor of its own, opened from the first group — only how it
 * is read: the two-week cycle, the subgroup, the term, and reminders.
 */
export const studySettingsSchema = coreSchema({
    moduleId: 'study',
    groups: [
        {
            id: 'schedule',
            titleKey: 'settings.studyGroup.schedule',
            fields: [
                {
                    type: 'action',
                    key: 'studyImport',
                    labelKey: 'settings.studyImport',
                    descKey: 'settings.studyImport.desc',
                    buttonKey: 'settings.studyImport.button',
                    cta: true,
                    run: ({ plugin }) =>
                        openStudyDialog(plugin, (close) =>
                            createElement(ImportDialog, { onClose: close })
                        ),
                },
                {
                    type: 'action',
                    key: 'studyEdit',
                    labelKey: 'settings.studyEdit',
                    descKey: 'settings.studyEdit.desc',
                    buttonKey: 'settings.studyEdit.button',
                    run: ({ plugin }) =>
                        openStudyDialog(plugin, (close) =>
                            createElement(EditorDialog, { onClose: close })
                        ),
                },
                {
                    type: 'action',
                    key: 'studyPrompt',
                    labelKey: 'settings.studyPrompt',
                    descKey: 'settings.studyPrompt.desc',
                    buttonKey: 'settings.studyPrompt.button',
                    run: ({ t }) => copyPrompt(t),
                },
            ],
        },
        {
            id: 'weeks',
            titleKey: 'settings.studyGroup.weeks',
            fields: [
                {
                    type: 'toggle',
                    key: 'studyTwoWeeks',
                    labelKey: 'settings.studyTwoWeeks',
                    descKey: 'settings.studyTwoWeeks.desc',
                    default: false,
                },
                {
                    type: 'segmented',
                    key: 'studyWeekNames',
                    labelKey: 'settings.studyWeekNames',
                    default: 'number',
                    showIf: (v) => v.studyTwoWeeks === true,
                    options: [
                        { value: 'number', labelKey: 'settings.studyWeekNames.number' },
                        { value: 'numerator', labelKey: 'settings.studyWeekNames.numerator' },
                        { value: 'parity', labelKey: 'settings.studyWeekNames.parity' },
                    ],
                },
                {
                    type: 'custom',
                    key: 'studyWeekAnchor',
                    row: true,
                    showIf: (v) => v.studyTwoWeeks === true,
                    render: ThisWeekField,
                },
                {
                    type: 'number',
                    key: 'studySubgroup',
                    labelKey: 'settings.studySubgroup',
                    descKey: 'settings.studySubgroup.desc',
                    default: 0,
                    min: 0,
                    max: 4,
                    step: 1,
                },
            ],
        },
        {
            id: 'term',
            titleKey: 'settings.studyGroup.term',
            fields: [
                {
                    type: 'text',
                    key: 'studyTermStart',
                    labelKey: 'settings.studyTermStart',
                    descKey: 'settings.studyTerm.desc',
                    default: '',
                    placeholder: 'YYYY-MM-DD',
                    validate: date,
                },
                {
                    type: 'text',
                    key: 'studyTermEnd',
                    labelKey: 'settings.studyTermEnd',
                    default: '',
                    placeholder: 'YYYY-MM-DD',
                    validate: date,
                },
            ],
        },
        {
            id: 'reminders',
            titleKey: 'settings.studyGroup.reminders',
            fields: [
                { type: 'feature', key: 'study.reminders' },
                {
                    type: 'number',
                    key: 'studyRemindBefore',
                    labelKey: 'settings.studyRemindBefore',
                    default: 10,
                    min: 0,
                    max: 60,
                    step: 5,
                    unitKey: 'settings.minutesUnit',
                    showIf: whenFeature('study.reminders'),
                },
            ],
        },
    ],
});
