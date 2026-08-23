import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import { weatherSettingsSchema } from '../src/modules/weather/settings.schema';
import { tasksSettingsSchema } from '../src/modules/tasks/settings.schema';
import { tasksCalendarSettingsSchema } from '../src/modules/tasks-calendar/settings.schema';
import { dashboardSettingsSchema } from '../src/modules/dashboard/settings.schema';
import { navigatorSettingsSchema } from '../src/modules/navigator/settings.schema';
import { prayerSettingsSchema } from '../src/modules/prayer/settings.schema';
import { contentSettingsSchema } from '../src/modules/content/settings.schema';
import { mediaSettingsSchema } from '../src/modules/media/settings.schema';
import { syncSettingsSchema } from '../src/modules/sync/settings.schema';
import { appearanceSchema, generalSchema } from '../src/settings/schema/coreSchemas';
import { flattenFields, defaultsFromSchema } from '../src/settings/schema/helpers';
import { isValueField, type CoreSettingsSchema } from '../src/settings/schema/types';
import { DICTS } from '../src/core/i18n';

/**
 * Every built-in schema. Add new ones here — that is the whole point of the
 * list: a schema nobody registered is a schema nobody checks.
 */
const CORE_SCHEMAS: CoreSettingsSchema[] = [
    generalSchema,
    appearanceSchema,
    dashboardSettingsSchema,
    navigatorSettingsSchema,
    prayerSettingsSchema,
    weatherSettingsSchema,
    tasksSettingsSchema,
    tasksCalendarSettingsSchema,
    contentSettingsSchema,
    mediaSettingsSchema,
    syncSettingsSchema,
];

/**
 * The design has two sources of truth for a built-in default: the schema's
 * `default` and `DEFAULT_SETTINGS`. That is the one real risk the declarative
 * approach introduces, so it is tested rather than hoped for.
 */
describe('core settings schemas agree with DEFAULT_SETTINGS', () => {
    for (const schema of CORE_SCHEMAS) {
        // One test per schema rather than per field: a schema made entirely of
        // `custom` fields (media) has no value fields at all, and an empty
        // `describe` is an error in vitest.
        it(`${schema.moduleId} declares only real settings, with matching types`, () => {
            const mismatches: string[] = [];
            for (const field of flattenFields(schema)) {
                if (!isValueField(field)) continue;

                const stored = (DEFAULT_SETTINGS as Record<string, unknown>)[field.key];
                if (!(field.key in DEFAULT_SETTINGS)) {
                    mismatches.push(`${field.key}: not in DEFAULT_SETTINGS`);
                    continue;
                }
                if (typeof field.default !== typeof stored) {
                    mismatches.push(
                        `${field.key}: schema ${typeof field.default} vs stored ${typeof stored}`
                    );
                }
                // Arrays and objects both report "object"; separate them so a
                // multiselect cannot be declared against a scalar setting.
                if (Array.isArray(field.default) !== Array.isArray(stored)) {
                    mismatches.push(`${field.key}: array-ness differs`);
                }
            }
            expect(mismatches).toEqual([]);
        });
    }

    it('never declares the same key in two schemas', () => {
        const seen = new Map<string, string>();
        for (const schema of CORE_SCHEMAS) {
            for (const field of flattenFields(schema)) {
                if (!isValueField(field)) continue;
                const owner = seen.get(field.key);
                expect(owner, `${field.key} is claimed by both ${owner} and ${schema.moduleId}`).toBe(
                    undefined
                );
                seen.set(field.key, schema.moduleId);
            }
        }
    });

    it('produces a defaults bag that round-trips through the helper', () => {
        const defaults = defaultsFromSchema(weatherSettingsSchema);
        expect(defaults.weatherUnit).toBe('c');
        expect(defaults.weatherForecastDays).toBe(10);
        // `custom` and `action` fields hold no value, so they contribute nothing.
        expect(defaults).not.toHaveProperty('weatherPlace');
    });
});

describe('core settings schemas are fully translated', () => {
    const keysOf = (schema: CoreSettingsSchema): string[] => {
        const out: string[] = [];
        for (const group of schema.groups) {
            if (group.titleKey) out.push(group.titleKey);
            if (group.descKey) out.push(group.descKey);
            for (const field of group.fields) {
                if (field.type === 'custom') continue;
                out.push(field.labelKey);
                if (field.descKey) out.push(field.descKey);
                if ('noteKey' in field && field.noteKey) out.push(field.noteKey);
                if (field.type === 'action') out.push(field.buttonKey);
                if (
                    (field.type === 'select' ||
                        field.type === 'segmented' ||
                        field.type === 'multiselect') &&
                    Array.isArray(field.options)
                ) {
                    for (const o of field.options) if (o.labelKey) out.push(o.labelKey);
                }
            }
        }
        return out;
    };

    for (const schema of CORE_SCHEMAS) {
        it(`${schema.moduleId} resolves every key in English`, () => {
            // A missing key renders as the key itself, which looks like a bug
            // rather than reading like one — so catch it here.
            const missing = keysOf(schema).filter((k) => DICTS.en[k] === undefined);
            expect(missing).toEqual([]);
        });

        it(`${schema.moduleId} resolves every key in Russian`, () => {
            const missing = keysOf(schema).filter((k) => DICTS.ru[k] === undefined);
            expect(missing).toEqual([]);
        });
    }
});
