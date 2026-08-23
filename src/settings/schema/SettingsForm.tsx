import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';
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
import {
    fieldError,
    fieldValue,
    optionLabel,
    resolveOptions,
    visibleGroups,
} from './helpers';
import { isValueField, type FieldContext, type SettingField, type SettingsBag, type SettingsSchema } from './types';

export interface SettingsFormProps {
    schema: SettingsSchema;
    values: Readonly<SettingsBag>;
    onChange: (patch: SettingsBag) => void;
}

/**
 * Renders a settings schema.
 *
 * Driven by `values`/`onChange` rather than reaching into the store. That one
 * decision is what lets the same component serve core settings (bound to
 * `settings`) and a third-party module's settings (bound to its own bucket),
 * and lets it be tested without a zustand mock.
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
        if (field.type === 'heading') {
            return (
                <React.Fragment key={field.key}>
                    <div className="zenith-settings__section-label">{t(field.labelKey)}</div>
                    {field.descKey && (
                        <div className="zenith-settings__item-desc zenith-settings__item-desc--block">
                            {t(field.descKey)}
                        </div>
                    )}
                </React.Fragment>
            );
        }

        if (field.type === 'custom') {
            const Render = field.render;
            return <Render key={field.key} {...ctx} set={onChange} />;
        }

        if (field.type === 'action') {
            return (
                <SettingRow
                    key={field.key}
                    label={t(field.labelKey)}
                    desc={field.descKey ? t(field.descKey) : undefined}
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
                            placeholder={field.placeholder}
                            monospace={field.monospace}
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
                            placeholder={field.placeholder}
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
                error={isValueField(field) ? (fieldError(field, values, t) ?? undefined) : undefined}
                // Wide inputs need the full row width; a folder path in a
                // right-hand column is unreadable at any vault depth.
                layout={
                    field.layout ??
                    (field.type === 'folder' || field.type === 'textarea' ? 'stack' : 'row')
                }
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
                        <div className="zenith-settings__section-label">{t(group.titleKey)}</div>
                    )}
                    {group.descKey && (
                        <div className="zenith-settings__item-desc zenith-settings__item-desc--block">
                            {t(group.descKey)}
                        </div>
                    )}
                    {group.fields.map(renderField)}
                </React.Fragment>
            ))}
        </>
    );
};
