import type { Translator } from '../../core/i18n';
import {
    isValueField,
    type FieldContext,
    type Option,
    type Options,
    type SettingField,
    type SettingsBag,
    type SettingsGroup,
    type SettingsSchema,
    type ValueField,
} from './types';

/** Every field in a schema, groups flattened away. */
export function flattenFields(schema: SettingsSchema): SettingField[] {
    return schema.groups.flatMap((g) => g.fields);
}

/**
 * The schema's defaults as a plain bag.
 *
 * This is what a third-party module's settings start as, and what a reset goes
 * back to. For built-in modules `DEFAULT_SETTINGS` remains the source of truth
 * and `tests/settingsSchema.test.ts` asserts the two agree — two places
 * defining one default is the risk this design introduces, so it is tested
 * rather than hoped for.
 */
export function defaultsFromSchema(schema: SettingsSchema): SettingsBag {
    const out: SettingsBag = {};
    for (const field of flattenFields(schema)) {
        if (isValueField(field)) out[field.key] = field.default;
    }
    return out;
}

/** Groups whose `showIf` passes, each holding only its visible fields. */
export function visibleGroups(
    schema: SettingsSchema,
    values: Readonly<SettingsBag>
): SettingsGroup[] {
    return schema.groups
        .filter((g) => !g.showIf || g.showIf(values))
        .map((g) => ({ ...g, fields: g.fields.filter((f) => !f.showIf || f.showIf(values)) }))
        .filter((g) => g.fields.length > 0);
}

/** Resolve options, which may be a function of the vault. */
export function resolveOptions(options: Options, ctx: FieldContext): Option[] {
    return typeof options === 'function' ? options(ctx) : options;
}

/** An option's display text: a translated key, raw text, or the value itself. */
export function optionLabel(option: Option, t: Translator): string {
    if (option.labelKey) return t(option.labelKey);
    return option.label ?? option.value;
}

/** The field's validation message, already translated. Null when it's fine. */
export function fieldError(
    field: ValueField<string>,
    values: Readonly<SettingsBag>,
    t: Translator
): string | null {
    if (!field.validate) return null;
    const key = field.validate(values[field.key], values);
    return key ? t(key) : null;
}

/**
 * Read a value from the bag, falling back to the field's default.
 *
 * The fallback matters on the upgrade path: a `data.json` written before a
 * setting existed has no key for it, and a control bound to `undefined` would
 * flip React from an uncontrolled to a controlled input mid-session.
 */
export function fieldValue<T>(
    field: { key: string; default: unknown },
    values: Readonly<SettingsBag>
): T {
    const stored = values[field.key];
    return (stored === undefined ? field.default : stored) as T;
}
