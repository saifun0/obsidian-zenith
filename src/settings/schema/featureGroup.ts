import {
    featureEnabled,
    featuresOf,
    type FeatureId,
    type FeatureSettings,
} from '../../core/features';
import type { FeatureField, Predicate, SettingsSchema } from './types';

/** The generated group's id, fixed so tests and styles can find it. */
export const FEATURES_GROUP_ID = 'features';

/**
 * A module's schema with its "Features" group in front.
 *
 * Generated from the registry rather than written into each schema, so a
 * feature added to the registry has a switch on its module's page without
 * anybody remembering to put one there. A feature the schema already places
 * itself is left out — one switch per feature, wherever it is drawn.
 *
 * First, because it answers the question the rest of the page depends on:
 * what this module is doing at all.
 */
export function withFeatureGroup<S extends SettingsSchema>(schema: S): S {
    const placed = new Set(
        schema.groups.flatMap((g) =>
            g.fields.flatMap((f) =>
                f.type === 'feature'
                    ? [f.key]
                    : f.type === 'custom' && f.featureId
                      ? [f.featureId]
                      : []
            )
        )
    );
    const fields: FeatureField[] = featuresOf(schema.moduleId)
        .filter((def) => !placed.has(def.id))
        .map((def) => ({ type: 'feature', key: def.id }));
    if (!fields.length) return schema;
    return {
        ...schema,
        groups: [
            { id: FEATURES_GROUP_ID, titleKey: 'settings.features', fields },
            ...schema.groups,
        ],
    };
}

/** Only the "Features" group — for a page that is not drawn from a schema. */
export function featureOnlySchema(moduleId: string): SettingsSchema {
    return withFeatureGroup({ moduleId, groups: [] });
}

/**
 * Show a group or field only while a feature runs.
 *
 * For the settings that belong to a feature: a wallpaper's dimming is noise on
 * a page whose wallpaper is switched off. Hidden, not cleared — the same rule
 * as every `showIf`.
 */
export const whenFeature =
    (id: FeatureId): Predicate =>
    (values) =>
        featureEnabled(values as unknown as FeatureSettings, id);
