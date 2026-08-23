import { Modal, type App } from 'obsidian';

/**
 * Ask for one line of text.
 *
 * Obsidian gives plugins no prompt of its own, and the browser's `prompt()` is
 * blocked inside the app — so anything that needs a name has to bring its own
 * dialog. Kept general (title, placeholder, initial value, button label) rather
 * than written into the one caller that needed it first.
 *
 * Resolves with the typed text, or `null` if the user cancelled — including by
 * pressing Escape or clicking away, which is why the promise is settled from
 * `onClose` rather than from the buttons.
 */
export class PromptModal extends Modal {
    private value: string;
    private accepted = false;
    private settle: ((value: string | null) => void) | null = null;

    constructor(
        app: App,
        private readonly opts: {
            title: string;
            initial?: string;
            placeholder?: string;
            confirmText: string;
            cancelText: string;
            /** Longest accepted input; the field enforces it too. */
            maxLength?: number;
        }
    ) {
        super(app);
        this.value = opts.initial ?? '';
    }

    /** Open the dialog and wait for an answer. */
    ask(): Promise<string | null> {
        return new Promise((resolve) => {
            this.settle = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(this.opts.title);
        contentEl.addClass('zenith-prompt');

        const input = contentEl.createEl('input', {
            type: 'text',
            cls: 'zenith-prompt__input',
            value: this.value,
        });
        if (this.opts.placeholder) input.placeholder = this.opts.placeholder;
        if (this.opts.maxLength) input.maxLength = this.opts.maxLength;

        const actions = contentEl.createEl('div', { cls: 'zenith-prompt__actions' });
        const cancel = actions.createEl('button', { text: this.opts.cancelText });
        const confirm = actions.createEl('button', {
            text: this.opts.confirmText,
            cls: 'mod-cta',
        });

        const accept = () => {
            this.value = input.value;
            // An empty name is a cancel in disguise: there is nothing to save
            // under, and closing with "" would create a nameless entry.
            if (!this.value.trim()) return;
            this.accepted = true;
            this.close();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                accept();
            }
        });
        confirm.addEventListener('click', accept);
        cancel.addEventListener('click', () => this.close());

        // Selected, not just focused: the common case is replacing the name
        // that's already there, not appending to it.
        window.setTimeout(() => input.select(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
        this.settle?.(this.accepted ? this.value : null);
        this.settle = null;
    }
}
