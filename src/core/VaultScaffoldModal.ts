import { App, Modal, Notice } from 'obsidian';
import { VaultScaffoldService, VAULT_STRUCTURE } from './VaultScaffoldService';
import { applyIcon } from './icons/applyIcon';
import { translateNow as t, translateNowPlural as tp } from './i18n';

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
        titleEl.setText(t('scaffold.title'));
        contentEl.addClass('zenith-scaffold');

        const items = this.service.itemsToArchive();

        contentEl.createEl('p', {
            text: t('scaffold.intro'),
        });
        const list = contentEl.createDiv({ cls: 'zenith-scaffold__folders' });
        for (const { name, icon } of VAULT_STRUCTURE) {
            const row = list.createSpan({ cls: 'zenith-scaffold__folder' });
            // Shows what you're about to get, rather than describing it.
            applyIcon(row.createSpan({ cls: 'zenith-scaffold__folder-icon' }), icon, 14);
            row.createSpan({ text: name });
        }

        if (items.length > 0) {
            const warn = contentEl.createDiv({ cls: 'zenith-scaffold__warn' });
            warn.createEl('strong', {
                text: tp('scaffold.willArchive', items.length),
            });
            warn.createDiv({
                cls: 'zenith-scaffold__warn-desc',
                text: t('scaffold.willArchive.desc'),
            });
            const preview = items.slice(0, 12).join(', ') + (items.length > 12 ? '…' : '');
            warn.createDiv({ cls: 'zenith-scaffold__preview', text: preview });
        } else {
            contentEl.createEl('p', {
                cls: 'zenith-scaffold__note',
                text: t('scaffold.empty'),
            });
        }

        const actions = contentEl.createDiv({ cls: 'zenith-scaffold__actions' });
        const cancel = actions.createEl('button', { text: t('scaffold.cancel') });
        cancel.addEventListener('click', () => this.close());

        const confirm = actions.createEl('button', {
            text: items.length > 0 ? t('scaffold.createAndArchive') : t('scaffold.create'),
            cls: 'mod-cta',
        });
        confirm.addEventListener('click', () => void this.run(confirm));
    }

    private async run(btn: HTMLButtonElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        btn.disabled = true;
        btn.setText(t('scaffold.working'));
        try {
            const result = await this.service.scaffold();
            const parts = [tp('scaffold.done.created', result.created.length)];
            if (result.iconed > 0) parts.push(tp('scaffold.done.iconed', result.iconed));
            if (result.archived > 0) parts.push(tp('scaffold.done.archived', result.archived));
            new Notice(t('scaffold.done', { parts: parts.join(', ') }));
            this.onDone?.();
            this.close();
        } catch (err) {
            console.error('Zenith: vault scaffold failed', err);
            new Notice(t('scaffold.failed'));
            btn.disabled = false;
            btn.setText(t('scaffold.createAndArchive'));
        } finally {
            this.busy = false;
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
