import type React from 'react';
import type { App } from 'obsidian';
import type { Translator } from '../../core/i18n';
import type { ZenithSettings } from '../../store/settingsSlice';
import type ZenithPlugin from '../../main';

/**
 * Declarative settings.
 *
 * `SettingsApp.renderModuleSettings` used to be a hardcoded `switch` naming
 * every module, with each page hand-assembling raw `<input>`s. That meant two
 * things: adding a setting was a UI edit rather than a data edit, and a
 * third-party module could not have a settings page at all — there was nowhere
 * for it to appear in the switch.
 *
 * So a module describes its settings as data and one renderer draws them. The
 * escape hatch (`custom`) exists because a few pages — the tracker editor, the
 * content-type editor, the location picker — are genuinely bespoke and would be
 * worse as a generic form.
 */

/** Any bag a form can drive: `ZenithSettings`, or a module's own bucket. */
export type SettingsBag = Record<string, unknown>;

/** Predicate over the current values, for dependencies between settings. */
export type Predicate = (values: Readonly<SettingsBag>) => boolean;

export interface FieldContext {
    app: App;
    plugin: ZenithPlugin;
    t: Translator;
    values: Readonly<SettingsBag>;
}

export interface FieldBase<K extends string> {
    /** Where the value lives in the bag. */
    key: K;
    labelKey: string;
    descKey?: string;
    /** Always-visible note under the row (a privacy caveat, a caveat about cost). */
    noteKey?: string;
    /**
     * Hide the row entirely. A hidden field KEEPS its stored value — resetting
     * it would silently discard configuration the moment a dependency flips.
     */
    showIf?: Predicate;
    /** Show the row greyed out, for "needs module X". */
    disabledIf?: Predicate;
    default: unknown;
    /** Returns an i18n key for the problem, or null when the value is fine. */
    validate?: (value: unknown, values: Readonly<SettingsBag>) => string | null;
    /** `stack` puts the control on its own line — for wide inputs. */
    layout?: 'row' | 'stack';
}

export interface Option {
    value: string;
    /** Translated label. Use `label` instead for user-generated text. */
    labelKey?: string;
    label?: string;
    /** Lucide icon id, for segmented controls. */
    icon?: string;
}

/** Options can depend on the vault (folder lists, installed modules). */
export type Options = Option[] | ((ctx: FieldContext) => Option[]);

export interface ToggleField<K extends string> extends FieldBase<K> {
    type: 'toggle';
    default: boolean;
}
/**
 * `numeric` marks a choice list whose stored value is a number.
 *
 * Option values are always strings — that is what a `<select>` and a set of
 * buttons deal in — so without this the form would write `"10"` into a setting
 * typed `number`, which typechecks nowhere and breaks arithmetic everywhere.
 */
export interface SelectField<K extends string> extends FieldBase<K> {
    type: 'select';
    default: string | number;
    options: Options;
    numeric?: boolean;
}
export interface SegmentedField<K extends string> extends FieldBase<K> {
    type: 'segmented';
    default: string | number;
    options: Options;
    numeric?: boolean;
}
export interface NumberField<K extends string> extends FieldBase<K> {
    type: 'number';
    default: number;
    min?: number;
    max?: number;
    step?: number;
    unitKey?: string;
}
export interface SliderField<K extends string> extends FieldBase<K> {
    type: 'slider';
    default: number;
    min: number;
    max: number;
    step?: number;
    unitKey?: string;
}
export interface TextField<K extends string> extends FieldBase<K> {
    type: 'text';
    default: string;
    placeholder?: string;
    /**
     * A translated placeholder, for when the empty value means something.
     *
     * "Leave this empty and you get the whole vault" is a real fact about a
     * setting and it used to be written underneath as a description — a line
     * of grey text, permanently on screen, to explain a box that is already
     * standing there empty. Said inside the box it costs no height at all and
     * appears exactly when it applies, which is when the box is empty.
     *
     * Separate from `placeholder` because that one is for literals a
     * translator must not touch: `my-vault`, `us-east-1`, `YYYY-MM-DD`.
     */
    placeholderKey?: string;
    monospace?: boolean;
    /**
     * Mask the value, with a control to reveal it.
     *
     * For credentials. Not a security measure — the value is in `data.json`
     * either way — but a settings page left open on a shared screen should not
     * be showing a password, and a masked field is also what tells the user
     * this one IS a password.
     */
    secret?: boolean;
}
export interface TextareaField<K extends string> extends FieldBase<K> {
    type: 'textarea';
    default: string;
    rows?: number;
    placeholder?: string;
    monospace?: boolean;
}
export interface FolderField<K extends string> extends FieldBase<K> {
    type: 'folder';
    default: string;
    placeholder?: string;
    /** See `TextField.placeholderKey`. */
    placeholderKey?: string;
}
export interface ColorField<K extends string> extends FieldBase<K> {
    type: 'color';
    default: string;
    /** Empty means "follow the theme" rather than "black". */
    allowEmpty?: boolean;
    fallback?: string;
}
export interface MultiselectField<K extends string> extends FieldBase<K> {
    type: 'multiselect';
    default: string[];
    options: Options;
}

/** A labelled button. Not a value — covers "Reset layout", "Set up structure". */
export interface ActionField {
    type: 'action';
    key: string;
    labelKey: string;
    descKey?: string;
    buttonKey: string;
    cta?: boolean;
    danger?: boolean;
    showIf?: Predicate;
    run: (ctx: FieldContext & { set: (patch: SettingsBag) => void }) => void | Promise<void>;
}

/** Visual break inside a group. */
export interface HeadingField {
    type: 'heading';
    key: string;
    labelKey: string;
    descKey?: string;
    showIf?: Predicate;
}

/**
 * A feature's switch, drawn from the registry — see `core/features.ts`.
 *
 * Every feature of a module is listed in its generated "Features" group; a
 * schema names one itself only to put it beside the settings that depend on
 * it (capture beside the heading it files under, reminders beside how early
 * they come). Named here, it is left out of that group, so it is never drawn
 * twice. Label, description and the reason it is unavailable all come from
 * the registry either way.
 */
export interface FeatureField {
    type: 'feature';
    /** The feature id. */
    key: string;
    /** A note beside the name, as on any other row — a privacy caveat, say. */
    noteKey?: string;
    showIf?: Predicate;
}

export interface CustomFieldProps extends FieldContext {
    set: (patch: SettingsBag) => void;
}

/** Escape hatch: owns its own rendering and its own persistence. */
export interface CustomField {
    type: 'custom';
    key: string;
    showIf?: Predicate;
    /**
     * The feature whose switch this field draws, when it draws one in its own
     * way — so the generated "Features" group does not draw it a second time.
     */
    featureId?: string;
    /**
     * This one draws a single settings row, not a surface of its own.
     *
     * The escape hatch covers two unlike things. Some custom fields are whole
     * panels — the sync record, the content-type table — which bring their own
     * boxes and must not be nested inside the form's card. Others are one
     * ordinary row that merely needed bespoke innards: a place picker, an
     * image chooser, a set of per-prayer offsets.
     *
     * Without the distinction the renderer has to guess, and it guessed wrong
     * in the visible direction: every custom field was left outside the card,
     * so four single rows floated between carded groups looking like mistakes.
     */
    row?: boolean;
    render: React.ComponentType<CustomFieldProps>;
}

export type ValueField<K extends string> =
    | ToggleField<K>
    | SelectField<K>
    | SegmentedField<K>
    | NumberField<K>
    | SliderField<K>
    | TextField<K>
    | TextareaField<K>
    | FolderField<K>
    | ColorField<K>
    | MultiselectField<K>;

export type SettingField<K extends string = string> =
    ValueField<K> | ActionField | HeadingField | CustomField | FeatureField;

export interface SettingsGroup<K extends string = string> {
    id: string;
    titleKey?: string;
    descKey?: string;
    showIf?: Predicate;
    /**
     * Mark the group's heading as wanting attention — e.g. it holds an invalid
     * field.
     *
     * For a state the group's own fields cannot see: encryption is switched on
     * and the password is empty, so sync is refusing to run, and no single
     * field is wrong on its own terms. A mark rather than anything louder,
     * because the group is on the page — the reader only has to be pointed at
     * it, not taken there.
     */
    alertIf?: Predicate;
    fields: SettingField<K>[];
}

export interface SettingsSchema<K extends string = string> {
    /** Owning module id — also the `moduleSettings` bucket key for third parties. */
    moduleId: string;
    groups: SettingsGroup<K>[];
}

/**
 * A schema for a built-in module: `key` must name a real `ZenithSettings`
 * field, so a typo is a build error rather than a setting that silently never
 * persists.
 */
export type CoreSettingsSchema = SettingsSchema<Extract<keyof ZenithSettings, string>>;

/** A third-party schema: free-form keys, stored in that module's bucket. */
export type ModuleSettingsSchema = SettingsSchema<string>;

/** Identity helper that forces the key check at the definition site. */
export const coreSchema = (schema: CoreSettingsSchema): CoreSettingsSchema => schema;

/** Fields that actually hold a value (everything but actions and decoration). */
export function isValueField(field: SettingField): field is ValueField<string> {
    return (
        field.type !== 'action' &&
        field.type !== 'heading' &&
        field.type !== 'custom' &&
        field.type !== 'feature'
    );
}
