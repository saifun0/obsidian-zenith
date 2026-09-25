import type { Command } from 'obsidian';
import type { Translator } from './i18n';
import type ZenithPlugin from '../main';

/**
 * Obsidian's commands, read and run from outside its palette.
 *
 * Search lists Zenith's commands and the side panel turns any command into a
 * button. Both need what the public typings leave out — the list, the runner,
 * the hotkey — and the same answer to "what is this command called here", so
 * the two can't drift into naming one command two ways.
 */

/** Obsidian's command registry and hotkeys: not in its public typings. */
interface ObsidianInternals {
    commands?: {
        listCommands?: () => Command[];
        commands?: Record<string, Command>;
        findCommand?: (id: string) => Command | undefined;
        executeCommandById?: (id: string) => boolean;
    };
    hotkeyManager?: { printHotkeyForCommand?: (id: string) => string };
}

function internals(plugin: ZenithPlugin): ObsidianInternals {
    return plugin.app as unknown as ObsidianInternals;
}

export function listCommands(plugin: ZenithPlugin): Command[] {
    const { commands } = internals(plugin);
    return commands?.listCommands?.() ?? Object.values(commands?.commands ?? {});
}

export function findCommand(plugin: ZenithPlugin, id: string): Command | undefined {
    const { commands } = internals(plugin);
    return commands?.findCommand?.(id) ?? commands?.commands?.[id];
}

/** Runs a command by its full id. False when Obsidian has no such command, or it declined. */
export function runCommand(plugin: ZenithPlugin, id: string): boolean {
    return internals(plugin).commands?.executeCommandById?.(id) ?? false;
}

export function commandHotkey(plugin: ZenithPlugin, id: string): string | undefined {
    return internals(plugin).hotkeyManager?.printHotkeyForCommand?.(id) || undefined;
}

/** Zenith's own id for one of its commands ("quick-add-task"), or null for anyone else's. */
export function zenithCommandId(plugin: ZenithPlugin, fullId: string): string | null {
    const prefix = `${plugin.manifest.id}:`;
    return fullId.startsWith(prefix) ? fullId.slice(prefix.length) : null;
}

/** Which module added each Zenith command, by its unprefixed id. */
export function commandOwners(plugin: ZenithPlugin): Map<string, string> {
    const ledger = plugin.moduleManager.getLedger();
    const owners = new Map<string, string>();
    for (const { id } of plugin.moduleManager.getAvailableManifests()) {
        ledger.commandsOf(id).forEach((command) => owners.set(command, id));
    }
    return owners;
}

/**
 * Whether a Zenith command is there to be run. A module's commands stay
 * registered after it is switched off — Obsidian only lets them go with the
 * whole plugin — so it is the module's state that says. Commands no module
 * owns are the plugin's own and always there.
 */
export function isZenithCommandLive(
    plugin: ZenithPlugin,
    id: string,
    owners: Map<string, string> = commandOwners(plugin)
): boolean {
    const owner = owners.get(id);
    return !owner || plugin.moduleManager.getLoadedModuleIds().includes(owner);
}

/** The dictionary key that names a Zenith command in Zenith's language, if any does. */
export function commandLabelKey(t: Translator, id: string, owner?: string): string | undefined {
    const keys = [`command.${id}`, ...(owner ? [`module.${owner}.command.${id}`] : [])];
    return keys.find((k) => t.has(k));
}

/** Obsidian's name for a command without the "Plugin: " in front of it. */
export function shortCommandName(name: string): string {
    const colon = name.indexOf(': ');
    return colon > 0 ? name.slice(colon + 2) : name;
}

/**
 * What to call a command where there is no room for whose it is: one of
 * Zenith's in Zenith's language, anyone else's as Obsidian names it, minus
 * the plugin's name.
 */
export function commandLabel(
    plugin: ZenithPlugin,
    command: Command,
    t: Translator,
    owners: Map<string, string> = commandOwners(plugin)
): string {
    const id = zenithCommandId(plugin, command.id);
    const key = id ? commandLabelKey(t, id, owners.get(id)) : undefined;
    return key ? t(key) : shortCommandName(command.name);
}
