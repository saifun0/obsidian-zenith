import { normalizeSettings, type ZenithSettings } from '../store/settingsSlice';
import { SHARED_KEYS } from '../modules/sync/statePolicy';
import { deepEqual } from '../modules/sync/stateMerge';

/**
 * What to take from a `data.json` another device wrote.
 *
 * Only the settings meant to travel — the `shared` half of `statePolicy` — and
 * only those that differ from ours. What a device keeps to itself (which
 * modules run here, its layout, its server credentials) is never taken from
 * someone else's file, and a file that is not a config is no change at all.
 * Read through `normalizeSettings`, so an older device's file is migrated
 * before it is compared rather than compared as it was written.
 */
export function externalSettingsPatch(
    ours: ZenithSettings,
    raw: unknown
): Partial<ZenithSettings> {
    const incoming = raw && typeof raw === 'object' ? (raw as { settings?: unknown }).settings : null;
    if (!incoming || typeof incoming !== 'object') return {};

    const theirs = normalizeSettings(incoming);
    const patch: Partial<ZenithSettings> = {};
    for (const key of SHARED_KEYS) {
        if (!deepEqual(theirs[key], ours[key])) Object.assign(patch, { [key]: theirs[key] });
    }
    return patch;
}
