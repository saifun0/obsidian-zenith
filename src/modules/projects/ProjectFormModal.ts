import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { translateNow } from '../../core/i18n';
import { ProjectForm } from './components/ProjectForm';
import type { Project } from './projectsTypes';
import type ZenithPlugin from '../../main';

/**
 * Making a project, or changing one.
 *
 * Creating used to be a single click with no dialog at all: a note appeared
 * called "New project", with a deadline of today and a priority of medium
 * because those were the words in the template, and the author found out what
 * they had agreed to by reading the YAML afterwards. Everything the form now
 * asks for was always in the file — it was just only ever answerable by hand.
 *
 * React inside an Obsidian `Modal`, the way `SyncQuickModal` and `PrayerModal`
 * do it, because three callers open this and only one of them is inside React:
 * the view's button, the command palette, and the dashboard widget.
 *
 * `contentEl` gets both `zenith-root` and `zenith-settings`: a modal lives at
 * the end of `<body>`, outside the subtree where the `--zenith-*` tokens are
 * declared, and the form is built from the settings controls, which resolve
 * their spacing and radii from `--zs-*` on `.zenith-settings`.
 */
export class ProjectFormModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly plugin: ZenithPlugin,
        private readonly project?: Project,
        /** A new project's name, when it was typed before the form opened. */
        private readonly initialTitle?: string
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('zenith-project-modal');

        const { contentEl, titleEl } = this;
        contentEl.empty();
        contentEl.addClass('zenith-root');
        contentEl.addClass('zenith-settings');
        titleEl.setText(translateNow(this.project ? 'projects.form.edit' : 'projects.form.create'));

        const mountPoint = contentEl.createDiv();
        this.root = createRoot(mountPoint);

        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(ProjectForm, {
                    project: this.project,
                    initialTitle: this.initialTitle,
                    onClose: () => this.close(),
                })
            )
        );
    }

    onClose(): void {
        // Unmounted on a task of its own: React refuses to unmount while it is
        // rendering, and `close()` is called from a button inside the tree.
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
