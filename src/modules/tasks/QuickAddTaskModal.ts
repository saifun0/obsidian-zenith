import { App, Modal, Notice } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import type { ZenithSettings } from '../../store/settingsSlice';
import { TaskWriter } from './services/taskWriter';
import { resolveTaskTarget } from './services/taskTarget';
import { translateNow } from '../../core/i18n';
import { QuickAddForm, type QuickAddDraft } from './components/QuickAddForm';

/**
 * QuickAddTaskModal — a native Obsidian modal for quickly capturing a task
 * from anywhere (command palette), without opening the Tasks view.
 *
 * Writes through {@link TaskWriter} to today's daily note (when journal capture
 * is on) or the configured tasks folder; the DataService picks up the file
 * change and refreshes the store automatically.
 *
 * The form is React, mounted into the modal the way `ProjectFormModal` does
 * it, so its fields are the plugin's own rather than Obsidian's `Setting`
 * controls — see {@link QuickAddForm}.
 */
export class QuickAddTaskModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly settings: ZenithSettings,
        private readonly onSubmitted?: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(translateNow('tasks.quickAdd.title'));
        contentEl.addClass('zenith-quick-add');

        this.root = createRoot(contentEl.createDiv());
        this.root.render(createElement(QuickAddForm, { onSubmit: (draft) => this.submit(draft) }));
    }

    private async submit(draft: QuickAddDraft): Promise<void> {
        if (!draft.title) {
            new Notice(translateNow('notice.taskTitleRequired'));
            return;
        }

        try {
            const target = await resolveTaskTarget(this.app, this.settings);
            await new TaskWriter(this.app).addTask(
                this.settings.tasksFolderPath,
                {
                    title: draft.title,
                    priority: draft.priority,
                    dueDate: draft.dueDate || undefined,
                    tags: draft.tags,
                },
                target
            );
            new Notice(translateNow('notice.taskAdded'));
            this.onSubmitted?.();
            this.close();
        } catch (err) {
            console.error('Zenith: Failed to quick-add task:', err);
            new Notice(translateNow('notice.taskAddFailed'));
        }
    }

    onClose(): void {
        // Unmounted on a task of its own: React refuses to unmount while it is
        // rendering, and `close()` is called from the form's submit handler.
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
