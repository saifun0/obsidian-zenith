import { translate, translatorNow, LOCALES } from '../../core/i18n';
import {
    commandHotkey,
    commandLabelKey,
    commandOwners,
    isZenithCommandLive,
    listCommands,
    runCommand,
    zenithCommandId,
} from '../../core/commands';
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

export function actionsSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'actions',
        labelKey: 'search.group.actions',
        icon: 'terminal-square',
        order: 20,
        items: () => {
            const ledger = plugin.moduleManager.getLedger();
            const owners = commandOwners(plugin);
            const t = translatorNow();
            const namePrefix = `${plugin.manifest.name}: `;

            const items: SearchItem[] = [];
            for (const command of listCommands(plugin)) {
                const id = zenithCommandId(plugin, command.id);
                if (!id || id === SEARCH_COMMAND_ID) continue;
                if (!isZenithCommandLive(plugin, id, owners)) continue;
                const owner = owners.get(id);
                if (owner && ledger.isViewCommand(owner, id)) continue;

                const english = command.name.startsWith(namePrefix)
                    ? command.name.slice(namePrefix.length)
                    : command.name;
                const key = commandLabelKey(t, id, owner);
                items.push({
                    id: `actions:${id}`,
                    title: key ? t(key) : english,
                    aliases: [english, ...(key ? everyLanguage(key) : [])],
                    icon: command.icon,
                    hotkey: commandHotkey(plugin, command.id),
                    run: () => void runCommand(plugin, command.id),
                });
            }
            return items;
        },
    };
}
