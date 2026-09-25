import React, { useMemo } from 'react';
import { useZenithStore } from '../../store';
import { SettingsForm } from './SettingsForm';
import type { SettingsBag, SettingsSchema } from './types';
import { withFeatureGroup } from './featureGroup';

/** Binds a module's schema to the flat `ZenithSettings` object. */
export const CoreSettingsForm: React.FC<{ schema: SettingsSchema }> = ({ schema }) => {
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    // Every built-in page gets its module's switches in front, generated from
    // the feature registry rather than written into each schema.
    const withFeatures = useMemo(() => withFeatureGroup(schema), [schema]);

    return (
        <SettingsForm
            schema={withFeatures}
            values={settings as unknown as SettingsBag}
            onChange={(patch) => updateSettings(patch)}
        />
    );
};
