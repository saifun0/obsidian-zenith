import { App, Modal, Setting, Notice } from 'obsidian';
import { PRIORITIES } from '../../core/constants';
import type { Priority } from '../../core/constants';
import type { ZenithSettings } from '../../store/settingsSlice';
import { TaskWriter } from './services/taskWriter';
import { resolveTaskTarget } from './services/taskTarget';
import { translateNow } from '../../core/i18n';

/**
 * QuickAddTaskModal — a native Obsidian modal for quickly capturing a task
 * from anywhere (command palette), without opening the Tasks view.
 *
 * Writes through {@link TaskWriter} to today's daily note (when journal capture
 * is on) or the configured tasks folder; the DataService picks up the file
 * change and refreshes the store automatically.
 */
export class QuickAddTaskModal extends Modal {
    private titleValue = '';
    private priority: Priority = 'medium';
    private dueDate = '';
    private tagsValue = '';
    private submitting = false;

    constructor(
        app: App,
        private readonly settings: ZenithSettings,
        private readonly onSubmitted?: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Quick add task');
        contentEl.addClass('zenith-quick-add');

        new Setting(contentEl)
            .setName('Title')
            .addText((text) => {
                text.setPlaceholder('What needs to be done?')
                    .onChange((v) => (this.titleValue = v));
                // Focus + submit on Enter for a fast capture flow.
                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        void this.submit();
                    }
                });
                window.setTimeout(() => text.inputEl.focus(), 0);
            });

        new Setting(contentEl)
            .setName('Priority')
            .addDropdown((dd) => {
                for (const p of PRIORITIES) {
                    dd.addOption(p, p.charAt(0).toUpperCase() + p.slice(1));
                }
                dd.setValue(this.priority).onChange((v) => (this.priority = v as Priority));
            });

        new Setting(contentEl)
            .setName('Due date')
            .addText((text) => {
                text.inputEl.type = 'date';
                text.onChange((v) => (this.dueDate = v));
            });

        new Setting(contentEl)
            .setName('Tags')
            .setDesc('Comma-separated')
            .addText((text) => {
                text.setPlaceholder('work, urgent').onChange((v) => (this.tagsValue = v));
            });

        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText('Add task')
                .setCta()
                .onClick(() => void this.submit())
        );
    }

    private async submit(): Promise<void> {
        if (this.submitting) return;
        const title = this.titleValue.trim();
        if (!title) {
            new Notice(translateNow('notice.taskTitleRequired'));
            return;
        }

        const tags = this.tagsValue
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

        this.submitting = true;
        try {
            const target = await resolveTaskTarget(this.app, this.settings);
            await new TaskWriter(this.app).addTask(
                this.settings.tasksFolderPath,
                {
                    title,
                    priority: this.priority,
                    dueDate: this.dueDate || undefined,
                    tags,
                },
                target
            );
            new Notice(translateNow('notice.taskAdded'));
            this.onSubmitted?.();
            this.close();
        } catch (err) {
            console.error('Zenith: Failed to quick-add task:', err);
            new Notice(translateNow('notice.taskAddFailed'));
        } finally {
            this.submitting = false;
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
