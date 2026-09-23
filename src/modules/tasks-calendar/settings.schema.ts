import { coreSchema } from '../../settings/schema/types';
import { whenFeature } from '../../settings/schema/featureGroup';

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
            // The hour grid is the week and day views'; without them there is
            // no block for a default length to size.
            showIf: whenFeature('calendar.timeViews'),
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
            showIf: whenFeature('calendar.widget'),
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
                // With the card it belongs to, not in the list at the top.
                { type: 'feature', key: 'calendar.overdue' },
                {
                    type: 'toggle',
                    key: 'calendarSpanColors',
                    labelKey: 'settings.calendarSpanColors',
                    descKey: 'settings.calendarSpanColors.desc',
                    default: true,
                    showIf: whenFeature('calendar.spans'),
                },
            ],
        },
    ],
});
