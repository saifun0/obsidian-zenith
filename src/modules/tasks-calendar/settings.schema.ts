import { coreSchema } from '../../settings/schema/types';

/**
 * The tasks calendar had no settings page at all — it fell through to "this
 * module has no configurable settings", while the Week Ahead widget quietly
 * hardcoded a seven-day horizon and a fixed row label.
 */
export const tasksCalendarSettingsSchema = coreSchema({
    moduleId: 'tasks-calendar',
    groups: [
        {
            id: 'grid',
            titleKey: 'settings.calendarGridGroup',
            fields: [
                {
                    type: 'segmented',
                    key: 'calendarSlotMinutes',
                    labelKey: 'settings.calendarSlot',
                    descKey: 'settings.calendarSlot.desc',
                    default: 60,
                    numeric: true,
                    options: [
                        { value: '15', label: '15' },
                        { value: '30', label: '30' },
                        { value: '60', label: '60' },
                        { value: '90', label: '90' },
                    ],
                },
            ],
        },
        {
            id: 'widget',
            titleKey: 'settings.calendarWidgetGroup',
            fields: [
                {
                    type: 'select',
                    key: 'calendarWidgetRowLabel',
                    labelKey: 'settings.calendarRowLabel',
                    default: 'countdown',
                    options: [
                        { value: 'countdown', labelKey: 'settings.calendarRowLabel.countdown' },
                        { value: 'note', labelKey: 'settings.calendarRowLabel.note' },
                        { value: 'both', labelKey: 'settings.calendarRowLabel.both' },
                        { value: 'none', labelKey: 'settings.calendarRowLabel.none' },
                    ],
                },
                {
                    type: 'segmented',
                    key: 'calendarHorizonDays',
                    labelKey: 'settings.calendarHorizon',
                    default: 7,
                    numeric: true,
                    options: [
                        { value: '7', label: '7' },
                        { value: '14', label: '14' },
                    ],
                },
                {
                    type: 'toggle',
                    key: 'calendarShowOverdue',
                    labelKey: 'settings.calendarOverdue',
                    default: true,
                },
                {
                    type: 'toggle',
                    key: 'calendarSpanColors',
                    labelKey: 'settings.calendarSpanColors',
                    descKey: 'settings.calendarSpanColors.desc',
                    default: true,
                },
            ],
        },
    ],
});
