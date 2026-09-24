/**
 * Keeping one module's failures from becoming Zenith's.
 *
 * Every extension runs inside a boundary: a renderer that throws is dropped
 * from that spot (a replacement falls back to Zenith's own), a callback that
 * throws is caught. Each failure is counted against its module, and a module
 * that keeps failing is switched off — once is a bug in a corner, three times
 * in a session is a module that should not be running until someone looks.
 */

export const FAILURE_LIMIT = 3;

const failures = new Map<string, number>();
let disable: ((moduleId: string, lastError: string) => void) | null = null;

/** Who switches a module off. Set by the plugin; without it, failures are only counted. */
export function setDisableHandler(
    handler: ((moduleId: string, lastError: string) => void) | null
): void {
    disable = handler;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Record a failure. Returns true when this one reached the limit and the
 * module was switched off.
 */
export function reportExtensionFailure(moduleId: string, where: string, error: unknown): boolean {
    console.error(`Zenith: module "${moduleId}" failed in ${where}:`, error);
    const count = (failures.get(moduleId) ?? 0) + 1;
    failures.set(moduleId, count);
    if (count < FAILURE_LIMIT) return false;
    failures.delete(moduleId);
    disable?.(moduleId, describe(error));
    return true;
}

export function failureCount(moduleId: string): number {
    return failures.get(moduleId) ?? 0;
}

/** Start counting again — when the user switches a module back on. */
export function resetFailures(moduleId?: string): void {
    if (moduleId) failures.delete(moduleId);
    else failures.clear();
}

/** Run a module's callback; a throw is reported and turned into `fallback`. */
export function guarded<T>(moduleId: string, where: string, run: () => T, fallback: T): T {
    try {
        return run();
    } catch (error) {
        reportExtensionFailure(moduleId, where, error);
        return fallback;
    }
}

/** The same for a callback that answers later. */
export async function guardedAsync<T>(
    moduleId: string,
    where: string,
    run: () => Promise<T> | T,
    fallback: T
): Promise<T> {
    try {
        return await run();
    } catch (error) {
        reportExtensionFailure(moduleId, where, error);
        return fallback;
    }
}
