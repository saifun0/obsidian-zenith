import { useZenithStore } from '../store';

/**
 * A third-party module's own settings.
 *
 * Built-in modules declare top-level `ZenithSettings` keys; a third-party
 * module cannot, so it gets a bucket keyed by its id and this accessor over it.
 * Writes go through the store's `settings` object, which means they persist on
 * the existing debounced `data.json` write and sync between devices with no
 * extra machinery.
 *
 * `defaults` normally comes from `defaultsFromSchema(module.getSettingsSchema())`,
 * so a setting the user has never touched reads as its declared default rather
 * than `undefined`.
 */
export interface ModuleSettingsAccessor<T extends object = Record<string, unknown>> {
    /** Current values, with defaults filled in for anything unset. */
    get(): T;
    value<K extends keyof T>(key: K): T[K];
    /** Merge a patch. Persisted automatically. */
    set(patch: Partial<T>): void;
    /** Back to the defaults. */
    reset(): void;
    /** Fires when this module's bucket changes. Returns a disposer. */
    subscribe(listener: (values: T) => void): () => void;
}

function readBucket<T extends object>(moduleId: string, defaults: T): T {
    const bucket = useZenithStore.getState().settings.moduleSettings[moduleId] ?? {};
    return { ...defaults, ...bucket } as T;
}

export function createModuleSettings<T extends object = Record<string, unknown>>(
    moduleId: string,
    defaults: T
): ModuleSettingsAccessor<T> {
    return {
        get: () => readBucket(moduleId, defaults),
        value: (key) => readBucket(moduleId, defaults)[key],
        set: (patch) =>
            useZenithStore
                .getState()
                .updateModuleSettings(moduleId, patch as Record<string, unknown>),
        reset: () => useZenithStore.getState().resetModuleSettings(moduleId),
        subscribe: (listener) =>
            useZenithStore.subscribe(
                // Selecting the bucket rather than the whole settings object
                // means a module isn't woken by every unrelated settings change.
                (state) => state.settings.moduleSettings[moduleId],
                () => listener(readBucket(moduleId, defaults))
            ),
    };
}
