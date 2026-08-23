import { App, Modal, Notice } from 'obsidian';
import { VaultScaffoldService, VAULT_STRUCTURE } from './VaultScaffoldService';
import { applyIcon } from './icons/applyIcon';

/**
 * VaultScaffoldModal — confirmation for the (destructive) "set up vault
 * structure" action. Clearly states that all current top-level content will be
 * moved into the archive before proceeding.
 */
export class VaultScaffoldModal extends Modal {
    private readonly service: VaultScaffoldService;
    private busy = false;

    constructor(app: App, private readonly onDone?: () => void) {
        super(app);
        this.service = new VaultScaffoldService(app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Set up vault structure');
        contentEl.addClass('zenith-scaffold');

        const items = this.service.itemsToArchive();

        contentEl.createEl('p', {
            text: 'This creates the following folders at the vault root, each with its icon:',
        });
        const list = contentEl.createEl('div', { cls: 'zenith-scaffold__folders' });
        for (const { name, icon } of VAULT_STRUCTURE) {
            const row = list.createEl('span', { cls: 'zenith-scaffold__folder' });
            // Shows what you're about to get, rather than describing it.
            applyIcon(row.createSpan({ cls: 'zenith-scaffold__folder-icon' }), icon, 14);
            row.createSpan({ text: name });
        }

        if (items.length > 0) {
            const warn = contentEl.createEl('div', { cls: 'zenith-scaffold__warn' });
            warn.createEl('strong', {
                text: `${items.length} existing top-level item${items.length === 1 ? '' : 's'} will be moved into “50 Archive”.`,
            });
            warn.createEl('div', {
                cls: 'zenith-scaffold__warn-desc',
                text: 'Nothing is deleted — items are moved into a dated subfolder, and internal links are updated.',
            });
            const preview = items.slice(0, 12).join(', ') + (items.length > 12 ? '…' : '');
            warn.createEl('div', { cls: 'zenith-scaffold__preview', text: preview });
        } else {
            contentEl.createEl('p', {
                cls: 'zenith-scaffold__note',
                text: 'Your vault is empty — no existing files will be moved.',
            });
        }

        const actions = contentEl.createEl('div', { cls: 'zenith-scaffold__actions' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        cancel.addEventListener('click', () => this.close());

        const confirm = actions.createEl('button', {
            text: items.length > 0 ? 'Create & archive' : 'Create structure',
            cls: 'mod-cta',
        });
        confirm.addEventListener('click', () => void this.run(confirm));
    }

    private async run(btn: HTMLButtonElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        btn.disabled = true;
        btn.setText('Working…');
        try {
            const result = await this.service.scaffold();
            const parts = [`created ${result.created.length} folder(s)`];
            if (result.iconed > 0) parts.push(`set ${result.iconed} icon(s)`);
            if (result.archived > 0) parts.push(`archived ${result.archived} item(s)`);
            new Notice(`Zenith: ${parts.join(', ')}.`);
            this.onDone?.();
            this.close();
        } catch (err) {
            console.error('Zenith: vault scaffold failed', err);
            new Notice('Zenith: failed to set up the vault structure.');
            btn.disabled = false;
            btn.setText('Create & archive');
        } finally {
            this.busy = false;
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
