import React, { useMemo } from 'react';
import { useZenithStore } from '../../store';
import { SettingsForm } from './SettingsForm';
import { defaultsFromSchema } from './helpers';
import type { ModuleSettingsSchema } from './types';

/**
 * Binds a third-party module's schema to its own `moduleSettings` bucket.
 *
 * Same renderer as the built-in modules use — the only difference is where the
 * values live, which is exactly why `SettingsForm` takes `values`/`onChange`
 * instead of reaching into the store itself.
 */
export const ModuleSettingsForm: React.FC<{ schema: ModuleSettingsSchema }> = ({ schema }) => {
    const bucket = useZenithStore((s) => s.settings.moduleSettings[schema.moduleId]);
    const updateModuleSettings = useZenithStore((s) => s.updateModuleSettings);

    // Defaults are layered under the stored values so a setting the user has
    // never touched renders as its declared default rather than as an empty
    // control.
    const defaults = useMemo(() => defaultsFromSchema(schema), [schema]);
    const values = useMemo(() => ({ ...defaults, ...bucket }), [defaults, bucket]);

    return (
        <SettingsForm
            schema={schema}
            values={values}
            onChange={(patch) => updateModuleSettings(schema.moduleId, patch)}
        />
    );
};
