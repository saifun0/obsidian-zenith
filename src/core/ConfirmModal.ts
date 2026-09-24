import { Modal, type App } from 'obsidian';

/**
 * Ask a yes-or-no question.
 *
 * The browser's `confirm()` is a blocking native box that looks like nothing
 * else in Obsidian and is not reliable on every platform the app runs on; this
 * is the same question in the app's own dialog. The sibling of
 * {@link PromptModal}, and settled the same way — from `onClose`, so Escape and
 * a click outside are a "no".
 */
export class ConfirmModal extends Modal {
    private accepted = false;
    private settle: ((ok: boolean) => void) | null = null;

    constructor(
        app: App,
        private readonly opts: {
            title: string;
            body?: string;
            confirmText: string;
            cancelText: string;
        }
    ) {
        super(app);
    }

    /** Open the dialog and wait for an answer. */
    ask(): Promise<boolean> {
        return new Promise((resolve) => {
            this.settle = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(this.opts.title);
        contentEl.addClass('zenith-prompt');
        if (this.opts.body) contentEl.createEl('p', { text: this.opts.body });

        const actions = contentEl.createEl('div', { cls: 'zenith-prompt__actions' });
        const cancel = actions.createEl('button', { text: this.opts.cancelText });
        const confirm = actions.createEl('button', { text: this.opts.confirmText, cls: 'mod-cta' });
        confirm.addEventListener('click', () => {
            this.accepted = true;
            this.close();
        });
        cancel.addEventListener('click', () => this.close());
        window.setTimeout(() => confirm.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
        this.settle?.(this.accepted);
        this.settle = null;
    }
}
