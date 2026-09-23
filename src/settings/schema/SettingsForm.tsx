import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation, type Translator } from '../../core/i18n';
import {
    ActionButton,
    ColorInput,
    MultiSelect,
    NumberInput,
    Segmented,
    Select,
    SettingRow,
    Slider,
    TextArea,
    TextInput,
    Toggle,
    type ChoiceOption,
} from '../controls';
import { FolderInput } from '../controls/FolderInput';
import { FeatureRow } from './FeatureRow';
import {
    fieldError,
    fieldValue,
    groupNeedsAttention,
    optionLabel,
    resolveOptions,
    visibleGroups,
} from './helpers';
import {
    isValueField,
    type FieldContext,
    type HeadingField,
    type SettingField,
    type SettingsBag,
    type SettingsSchema,
} from './types';

export interface SettingsFormProps {
    schema: SettingsSchema;
    values: Readonly<SettingsBag>;
    onChange: (patch: SettingsBag) => void;
}

/** Controls that are a set of elements rather than one labelable field. */
const GROUPED: ReadonlySet<SettingField['type']> = new Set(['segmented', 'multiselect', 'action']);

/**
 * Controls narrow enough to stay beside their label at any width.
 *
 * A switch is 38px, a number field 130 with its unit, a button the width of
 * its word. What is NOT here is everything that asks for 260px or more — a
 * text field, a select, a four-option strip — because at the width of a phone
 * those leave the label a column of single words.
 */
const COMPACT: ReadonlySet<SettingField['type']> = new Set(['toggle', 'number', 'action']);

/**
 * Renders a settings schema.
 *
 * Driven by `values`/`onChange` rather than reaching into the store. That one
 * decision is what lets the same component serve core settings (bound to
 * `settings`) and a third-party module's settings (bound to its own bucket),
 * and lets it be tested without a zustand mock.
 *
 * Every group a schema declares is drawn, open, in one column. This page has
 * now tried both alternatives and neither survived contact with the sync
 * form. Subpages replaced the screen, so configuring a server meant repeatedly
 * leaving the panel that reports whether the server answers. Folds kept the
 * page but kept the settings shut, which for a group of three rows buys a
 * click and costs the ability to see the form you are filling in. What is left
 * is the plain thing: a heading, the rows under it, and nothing to press
 * before you can read them.
 */
export const SettingsForm: React.FC<SettingsFormProps> = ({ schema, values, onChange }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const ctx: FieldContext = { app, plugin, t, values };

    const options = (raw: Parameters<typeof resolveOptions>[0]): ChoiceOption[] =>
        resolveOptions(raw, ctx).map((o) => ({
            value: o.value,
            label: optionLabel(o, t),
            icon: o.icon,
        }));

    const renderField = (field: SettingField): React.ReactNode => {
        // Drawn by `Segment`, which needs to see a heading in order to know
        // where one card ends and the next begins. Guarded here rather than
        // merely unreachable, because it is also what narrows `field` for
        // everything below.
        if (field.type === 'heading') return null;

        if (field.type === 'custom') {
            const Render = field.render;
            return <Render key={field.key} {...ctx} set={onChange} />;
        }

        if (field.type === 'feature') {
            return <FeatureRow key={field.key} id={field.key} noteKey={field.noteKey} />;
        }

        if (field.type === 'action') {
            return (
                <SettingRow
                    key={field.key}
                    label={t(field.labelKey)}
                    desc={field.descKey ? t(field.descKey) : undefined}
                    group
                    compact
                >
                    <ActionButton
                        label={t(field.buttonKey)}
                        cta={field.cta}
                        danger={field.danger}
                        onClick={() => void field.run({ ...ctx, set: onChange })}
                    />
                </SettingRow>
            );
        }

        const disabled = field.disabledIf?.(values) ?? false;
        const set = (value: unknown) => onChange({ [field.key]: value });

        const control = (() => {
            switch (field.type) {
                case 'toggle':
                    return (
                        <Toggle
                            checked={fieldValue<boolean>(field, values)}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                // Option values are strings on the wire either way; `numeric`
                // says the setting behind them is a number, so convert on the
                // way back in rather than storing "10" in a numeric field.
                case 'select':
                    return (
                        <Select
                            value={String(fieldValue<string | number>(field, values))}
                            options={options(field.options)}
                            disabled={disabled}
                            onChange={(v) => set(field.numeric ? Number(v) : v)}
                        />
                    );
                case 'segmented':
                    return (
                        <Segmented
                            value={String(fieldValue<string | number>(field, values))}
                            options={options(field.options)}
                            disabled={disabled}
                            onChange={(v) => set(field.numeric ? Number(v) : v)}
                        />
                    );
                case 'number':
                    return (
                        <NumberInput
                            value={fieldValue<number>(field, values)}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            unit={field.unitKey ? t(field.unitKey) : undefined}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'slider':
                    return (
                        <Slider
                            value={fieldValue<number>(field, values)}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            unit={field.unitKey ? t(field.unitKey) : undefined}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'text':
                    return (
                        <TextInput
                            value={fieldValue<string>(field, values)}
                            placeholder={
                                field.placeholderKey ? t(field.placeholderKey) : field.placeholder
                            }
                            monospace={field.monospace}
                            secret={field.secret}
                            revealLabel={t('settings.secret.reveal')}
                            hideLabel={t('settings.secret.hide')}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'textarea':
                    return (
                        <TextArea
                            value={fieldValue<string>(field, values)}
                            rows={field.rows}
                            placeholder={field.placeholder}
                            monospace={field.monospace}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'folder':
                    return (
                        <FolderInput
                            value={fieldValue<string>(field, values)}
                            placeholder={
                                field.placeholderKey ? t(field.placeholderKey) : field.placeholder
                            }
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'color':
                    return (
                        <ColorInput
                            value={fieldValue<string>(field, values)}
                            fallback={field.fallback}
                            allowEmpty={field.allowEmpty}
                            resetLabel={t('settings.reset')}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
                case 'multiselect':
                    return (
                        <MultiSelect
                            value={fieldValue<string[]>(field, values)}
                            options={options(field.options)}
                            disabled={disabled}
                            onChange={set}
                        />
                    );
            }
        })();

        return (
            <SettingRow
                key={field.key}
                label={t(field.labelKey)}
                desc={field.descKey ? t(field.descKey) : undefined}
                note={field.noteKey ? t(field.noteKey) : undefined}
                noteLabel={t('settings.hint.aria')}
                error={
                    isValueField(field) ? (fieldError(field, values, t) ?? undefined) : undefined
                }
                // Wide inputs need the full row width; a folder path in a
                // right-hand column is unreadable at any vault depth.
                layout={
                    field.layout ??
                    (field.type === 'folder' || field.type === 'textarea' ? 'stack' : 'row')
                }
                group={GROUPED.has(field.type)}
                compact={COMPACT.has(field.type)}
                disabled={disabled}
            >
                {control}
            </SettingRow>
        );
    };

    return (
        <>
            {visibleGroups(schema, values).map((group) => (
                <React.Fragment key={group.id}>
                    {group.titleKey && (
                        <h3 className="zenith-settings__section-label">
                            {t(group.titleKey)}
                            {/* A group holding the reason sync is refusing to
                                run says so on its own heading. It used to be a
                                mark on a chevron row, which was the only thing
                                visible of a section that had been folded away;
                                the section is on the page now, and the mark is
                                what points at it. */}
                            {groupNeedsAttention(group, values) && (
                                <>
                                    <AlertTriangle
                                        size={14}
                                        className="zenith-settings__labelAlert"
                                        aria-hidden="true"
                                    />
                                    <span className="zenith-settings__srOnly">
                                        {t('settings.section.attention')}
                                    </span>
                                </>
                            )}
                        </h3>
                    )}
                    {group.descKey && (
                        <p className="zenith-settings__item-desc zenith-settings__item-desc--block">
                            {t(group.descKey)}
                        </p>
                    )}
                    {segment(group.fields).map((seg, j) => (
                        <Segment key={j} seg={seg} t={t} render={renderField} level={4} />
                    ))}
                </React.Fragment>
            ))}
        </>
    );
};

/**
 * A run of fields that belong in one card.
 *
 * `kind` is what the run is made of rather than what it looks like: `rows` are
 * the ordinary label-and-control lines that a card exists to hold, `heading` is
 * a label that opens a new one, and `custom` is a field that draws its own
 * surface and must not be put inside somebody else's.
 */
export interface FieldSegment {
    kind: 'rows' | 'heading' | 'custom';
    fields: SettingField[];
}

/**
 * Cut a group's fields into cards.
 *
 * The card is what finally makes `:last-child` mean what the stylesheet always
 * assumed it meant. Rows used to be siblings of section labels and custom
 * fields inside one flat Fragment, so "the last row of a group" and "the last
 * child of the container" were different elements whenever a group was
 * followed by anything at all — which is why a row that was visually last
 * still drew its separator and carried 41px of space into the next heading.
 *
 * Two kinds of field break a run. A `heading` is a new subject and therefore a
 * new card, which is the same thing the root settings menu does with its
 * dividers. A `custom` field owns its own rendering — the sync page, the
 * tracker editor, the content-type table all draw their own boxes — and
 * nesting one inside a card would frame it twice.
 */
export function segment(fields: SettingField[]): FieldSegment[] {
    const out: FieldSegment[] = [];

    for (const field of fields) {
        const kind: FieldSegment['kind'] =
            field.type === 'heading'
                ? 'heading'
                : field.type === 'custom' && !field.row
                  ? 'custom'
                  : 'rows';

        const last = out[out.length - 1];
        // Only rows accumulate; a heading and a custom field are each one
        // segment of their own, so two in a row never share a card.
        if (last && last.kind === 'rows' && kind === 'rows') last.fields.push(field);
        else out.push({ kind, fields: [field] });
    }

    return out;
}

/** One run, drawn as the surface its contents call for. */
const Segment: React.FC<{
    seg: FieldSegment;
    t: Translator;
    render: (field: SettingField) => React.ReactNode;
    /** Depth of the heading a `heading` field draws, beneath the group's own. */
    level: 4 | 5;
}> = ({ seg, t, render, level }) => {
    if (seg.kind === 'rows') {
        return <div className="zenith-settings__card">{seg.fields.map(render)}</div>;
    }

    if (seg.kind === 'custom') return <>{seg.fields.map(render)}</>;

    const heading = seg.fields[0] as HeadingField;
    const Tag = level === 4 ? 'h4' : 'h5';
    return (
        <>
            <Tag className="zenith-settings__section-label">{t(heading.labelKey)}</Tag>
            {heading.descKey && (
                <p className="zenith-settings__item-desc zenith-settings__item-desc--block">
                    {t(heading.descKey)}
                </p>
            )}
        </>
    );
};
