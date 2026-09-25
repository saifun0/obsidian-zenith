import { FuzzySuggestModal, type Command } from 'obsidian';
import { translatorNow } from '../../core/i18n';
import {
    commandLabel,
    commandOwners,
    isZenithCommandLive,
    listCommands,
    zenithCommandId,
} from '../../core/commands';
import type ZenithPlugin from '../../main';

/**
 * Every command Obsidian has, to make a side-panel button of: Zenith's,
 * Obsidian's own and other plugins'. Zenith's are named in Zenith's language
 * and keep the "Zenith: " in front, as the palette shows it.
 *
 * Left out: what is already a button, and Zenith commands whose module is off,
 * which would make a button that does nothing.
 */
export class CommandPickerModal extends FuzzySuggestModal<Command> {
    private readonly owners: Map<string, string>;
    private readonly names = new Map<string, string>();

    constructor(
        private readonly plugin: ZenithPlugin,
        private readonly exclude: ReadonlySet<string>,
        private readonly onChoose: (command: Command) => void
    ) {
        super(plugin.app);
        this.owners = commandOwners(plugin);
        this.setPlaceholder(translatorNow()('navigator.panel.pick'));
    }

    getItems(): Command[] {
        const t = translatorNow();
        const items: Command[] = [];
        for (const command of listCommands(this.plugin)) {
            if (this.exclude.has(command.id)) continue;
            const id = zenithCommandId(this.plugin, command.id);
            if (id && !isZenithCommandLive(this.plugin, id, this.owners)) continue;
            this.names.set(
                command.id,
                id
                    ? `${this.plugin.manifest.name}: ${commandLabel(this.plugin, command, t, this.owners)}`
                    : command.name
            );
            items.push(command);
        }
        return items;
    }

    getItemText(command: Command): string {
        return this.names.get(command.id) ?? command.name;
    }

    onChooseItem(command: Command): void {
        this.onChoose(command);
    }
}
