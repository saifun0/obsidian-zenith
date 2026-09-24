import { useZenithStore } from '../store';

/**
 * What third-party modules wrote, and where — shown under each module in
 * settings.
 *
 * Only writes that go through Zenith's API are here (a module can reach the
 * vault directly, like any plugin, and nothing can log that). It is the
 * record for the question "what did this module change?", kept on this
 * device and capped, newest last.
 */

export interface ModuleActivity {
    moduleId: string;
    at: number;
    /** `tasks.setStatus`, `journal.record`… */
    action: string;
    /** The note written to, when there is one. */
    path?: string;
}

export const ACTIVITY_LIMIT = 200;

export function withActivity(
    log: readonly ModuleActivity[],
    entry: ModuleActivity,
    limit = ACTIVITY_LIMIT
): ModuleActivity[] {
    const next = [...log, entry];
    return next.length > limit ? next.slice(next.length - limit) : next;
}

export function logModuleActivity(moduleId: string, action: string, path?: string): void {
    const { settings, updateSettings } = useZenithStore.getState();
    updateSettings({
        moduleActivity: withActivity(settings.moduleActivity, {
            moduleId,
            at: Date.now(),
            action,
            path,
        }),
    });
}

/** One module's entries, newest first. */
export function activityOf(log: readonly ModuleActivity[], moduleId: string): ModuleActivity[] {
    return log.filter((e) => e.moduleId === moduleId).reverse();
}
