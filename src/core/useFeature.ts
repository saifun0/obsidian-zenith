import { useZenithStore } from '../store';
import type { ZenithSettings } from '../store/settingsSlice';
import { featureEnabled, featurePatch, getFeature, type FeatureId } from './features';

/**
 * The feature registry, bound to the live settings.
 *
 * Kept apart from `features.ts` so that file stays free of the store: the
 * settings migration reads the registry, and the store reads the migration.
 */

/** Whether a feature runs right now — for code outside React. */
export function isFeatureOn(id: FeatureId): boolean {
    return featureEnabled(useZenithStore.getState().settings, id);
}

/**
 * Whether a feature runs, re-rendering when that changes.
 *
 * The selector returns a boolean, so a component only re-renders when this
 * feature flips — not on every settings write, of which there are many.
 */
export function useFeature(id: FeatureId): boolean {
    return useZenithStore((s) => featureEnabled(s.settings, id));
}

/** Switch a feature on or off, wherever its state is stored. */
export function setFeature(id: FeatureId, on: boolean): void {
    const { settings, updateSettings } = useZenithStore.getState();
    updateSettings(featurePatch(settings, id, on));
}

/**
 * Follow a feature's switch from a module's own long-running work — a
 * ticker, a watcher — calling `listener` whenever it flips, and once now.
 *
 * The module being switched off is left out on purpose: that already unloads
 * the module, which disposes of this subscription with everything else, and
 * treating it as the feature going off as well would run a feature's
 * "switched off" cleanup — which may write to a note — as a side effect of
 * closing a module.
 */
export function watchFeature(id: FeatureId, listener: (on: boolean) => void): () => void {
    const own = getFeature(id)?.moduleId;
    const running = (settings: ZenithSettings) =>
        featureEnabled(
            own ? { ...settings, activeModuleIds: [...settings.activeModuleIds, own] } : settings,
            id
        );
    listener(running(useZenithStore.getState().settings));
    return useZenithStore.subscribe((s) => running(s.settings), listener);
}
