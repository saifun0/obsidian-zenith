import type { Command } from 'obsidian';
import { translate, translatorNow, LOCALES } from '../../core/i18n';
import { navActionLabel, navActions, runNavAction } from '../navigator/navigation';
import type { SearchItem, SearchSource } from './searchSources';
import type ZenithPlugin from '../../main';

/**
 * The two groups Search owns rather than borrows: the views, read from the
 * navigation registry every module already fills, and the actions — Zenith's
 * own commands.
 */

/** This panel's own command, which it would be silly to offer inside it. */
export const SEARCH_COMMAND_ID = 'search';

/** Obsidian's command registry and hotkeys: not in its public typings. */
interface ObsidianInternals {
    commands?: {
        listCommands?: () => Command[];
        commands?: Record<string, Command>;
        executeCommandById?: (id: string) => boolean;
    };
    hotkeyManager?: { printHotkeyForCommand?: (id: string) => string };
}

function internals(plugin: ZenithPlugin): ObsidianInternals {
    return plugin.app as unknown as ObsidianInternals;
}

/** A label in every language, for finding by either. */
function everyLanguage(key: string): string[] {
    return LOCALES.map((locale) => translate(locale, key)).filter((text) => text !== key);
}

export function viewsSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'views',
        labelKey: 'search.group.views',
        icon: 'layout-grid',
        order: 10,
        items: () => {
            const t = translatorNow();
            return navActions.getSnapshot().map((def): SearchItem => ({
                id: `views:${def.id}`,
                title: navActionLabel(def, t),
                aliases: [
                    ...(def.labelKey ? everyLanguage(def.labelKey) : []),
                    ...(def.label ? [def.label] : []),
                ],
                icon: def.icon,
                run: () => runNavAction(def, { app: plugin.app, plugin }),
            }));
        },
    };
}

/** Which module added each command, by its unprefixed id. */
function commandOwners(plugin: ZenithPlugin): Map<string, string> {
    const ledger = plugin.moduleManager.getLedger();
    const owners = new Map<string, string>();
    for (const { id } of plugin.moduleManager.getAvailableManifests()) {
        ledger.commandsOf(id).forEach((command) => owners.set(command, id));
    }
    return owners;
}

export function actionsSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'actions',
        labelKey: 'search.group.actions',
        icon: 'terminal-square',
        order: 20,
        items: () => {
            const { commands, hotkeyManager } = internals(plugin);
            const all = commands?.listCommands?.() ?? Object.values(commands?.commands ?? {});
            const prefix = `${plugin.manifest.id}:`;
            const namePrefix = `${plugin.manifest.name}: `;
            const ledger = plugin.moduleManager.getLedger();
            const loaded = new Set(plugin.moduleManager.getLoadedModuleIds());
            const owners = commandOwners(plugin);
            const t = translatorNow();

            const items: SearchItem[] = [];
            for (const command of all) {
                if (!command.id.startsWith(prefix)) continue;
                const id = command.id.slice(prefix.length);
                if (id === SEARCH_COMMAND_ID) continue;
                const owner = owners.get(id);
                // A module's commands stay registered after it is switched off
                // (Obsidian only lets them go with the whole plugin), so it is
                // the module's state that says whether they are there.
                if (owner && !loaded.has(owner)) continue;
                if (owner && ledger.isViewCommand(owner, id)) continue;

                const english = command.name.startsWith(namePrefix)
                    ? command.name.slice(namePrefix.length)
                    : command.name;
                const keys = [`command.${id}`, ...(owner ? [`module.${owner}.command.${id}`] : [])];
                const key = keys.find((k) => t.has(k));
                items.push({
                    id: `actions:${id}`,
                    title: key ? t(key) : english,
                    aliases: [english, ...(key ? everyLanguage(key) : [])],
                    icon: command.icon,
                    hotkey: hotkeyManager?.printHotkeyForCommand?.(command.id) || undefined,
                    run: () => void commands?.executeCommandById?.(command.id),
                });
            }
            return items;
        },
    };
}
