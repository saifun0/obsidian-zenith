import React from 'react';
import { useZenithStore } from '../../store';
import { useTranslation, type Translator } from '../../core/i18n';
import {
    featureBlock,
    featurePatch,
    getFeature,
    ownFeatureValue,
    type FeatureBlock,
} from '../../core/features';
import { SettingRow, Toggle } from '../controls';

/** The block, in words: which module or which feature is missing. */
function blockReason(block: FeatureBlock, t: Translator): string {
    if (block.kind === 'module') {
        const key = `module.${block.moduleId}.name`;
        return t('settings.features.needsModule', {
            name: t.has(key) ? t(key) : block.moduleId,
        });
    }
    const needed = getFeature(block.featureId);
    return t('settings.features.needsFeature', {
        name: needed ? t(needed.labelKey) : block.featureId,
    });
}

/**
 * One feature's switch.
 *
 * Bound to the store rather than to the form's values: a feature may live in
 * `features` or in a setting of its own, and the form only ever sees the bag
 * it was handed. A feature that cannot run shows as off and says what it is
 * waiting for, in place of its description — the reason is the one thing
 * worth reading on that row.
 */
export const FeatureRow: React.FC<{ id: string; noteKey?: string }> = ({ id, noteKey }) => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const def = getFeature(id);
    if (!def) return null;

    const block = featureBlock(settings, id);
    const own = ownFeatureValue(settings, def);
    const desc = block ? blockReason(block, t) : t.has(def.descKey) ? t(def.descKey) : undefined;

    return (
        <SettingRow
            label={t(def.labelKey)}
            desc={desc}
            note={noteKey ? t(noteKey) : undefined}
            noteLabel={t('settings.hint.aria')}
            compact
            disabled={!!block}
        >
            <Toggle
                checked={own && !block}
                disabled={!!block}
                onChange={(on) => updateSettings(featurePatch(settings, id, on))}
            />
        </SettingRow>
    );
};
