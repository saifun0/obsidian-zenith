/**
 * Which modules earn a row in the settings front door.
 *
 * Pure, and separate from the component, because the rule is the substance of
 * the feature and both ways of getting it wrong are invisible: too generous and
 * the list offers rows that open "nothing to configure here", too strict and a
 * module the user is actively using has no way in.
 */

export interface ModuleMenuEntry {
    id: string;
    name: string;
    description: string;
    icon?: string;
    isBuiltIn: boolean;
}

export function configurableModules<T extends ModuleMenuEntry>(
    available: readonly T[],
    activeIds: readonly string[],
    hasSettings: (id: string) => boolean
): T[] {
    const active = new Set(activeIds);

    return available
        // Switched off means its settings change nothing, so a row leading to
        // them leads nowhere.
        .filter((module) => active.has(module.id))
        .filter((module) => hasSettings(module.id))
        // Built-ins first — they are what a new user is looking for — then by
        // name, so the order does not shift with whatever the registry happens
        // to hand back.
        .sort(
            (a, b) => Number(b.isBuiltIn) - Number(a.isBuiltIn) || a.name.localeCompare(b.name)
        );
}
