import { TAbstractFile, TFolder, Menu } from 'obsidian';
import { useZenithStore } from '../store';
import { IconPickerModal } from './IconPickerModal';
import { remapIconPaths, pruneIconPaths } from './iconPaths';
import { applyIcon } from './icons/applyIcon';
import type ZenithPlugin from '../main';

/**
 * FolderIconService — lets the user assign an icon to any file or folder, shown
 * in Obsidian's native file explorer (like the Iconize plugin, but built in).
 *
 * Assignments are stored in settings (`folderIcons`: path → icon id). We
 * decorate the explorer's DOM directly and re-apply on layout/DOM changes so
 * icons survive the explorer's virtualized re-renders. Icons come from
 * Obsidian's built-in (lucide) set or from an installed Zenith icon pack —
 * `applyIcon` resolves both, so a folder can wear a custom logo.
 */
export class FolderIconService {
    private observers: MutationObserver[] = [];
    private scheduled = false;

    constructor(private readonly plugin: ZenithPlugin) {}

    private get app() {
        return this.plugin.app;
    }

    private get icons(): Record<string, string> {
        return useZenithStore.getState().settings.folderIcons;
    }

    start(): void {
        this.app.workspace.onLayoutReady(() => {
            this.attachObservers();
            this.decorate();
        });

        // Re-decorate when the layout changes (explorer opened, panes moved…).
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.attachObservers();
                this.scheduleDecorate();
            })
        );

        // Keep assignments consistent as the vault changes.
        this.plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => this.onRename(file, oldPath))
        );
        this.plugin.registerEvent(this.app.vault.on('delete', (file) => this.onDelete(file)));

        // Context-menu entry to set / clear an icon.
        this.plugin.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => this.addMenuItems(menu, file))
        );

        // Re-decorate when the store's icon map changes.
        this.plugin.register(
            useZenithStore.subscribe(
                (s) => s.settings.folderIcons,
                () => this.scheduleDecorate()
            )
        );

        this.plugin.register(() => {
            this.detachObservers();
            this.removeAllInjected();
        });
    }

    /** Remove every icon we injected into the explorer (used on unload). */
    private removeAllInjected(): void {
        for (const container of this.explorerContainers()) {
            container.querySelectorAll('.zenith-nav-icon').forEach((el) => el.remove());
            container
                .querySelectorAll('.zenith-has-icon')
                .forEach((el) => el.removeClass('zenith-has-icon'));
        }
    }

    // ── Decoration ──────────────────────────────────────────────────────────

    private scheduleDecorate(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        window.setTimeout(() => {
            this.scheduled = false;
            this.decorate();
        }, 50);
    }

    private explorerContainers(): HTMLElement[] {
        return this.app.workspace
            .getLeavesOfType('file-explorer')
            .map((leaf) => (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl)
            .filter((el): el is HTMLElement => !!el);
    }

    private decorate(): void {
        const icons = this.icons;
        for (const container of this.explorerContainers()) {
            const titles = container.querySelectorAll<HTMLElement>(
                '.nav-folder-title, .nav-file-title'
            );
            titles.forEach((titleEl) => {
                // Clear any icon we previously injected.
                titleEl.querySelector('.zenith-nav-icon')?.remove();
                titleEl.removeClass('zenith-has-icon');

                const path = titleEl.getAttribute('data-path');
                const iconId = path ? icons[path] : undefined;
                if (!iconId) return;

                const iconEl = createSpan({ cls: 'zenith-nav-icon' });
                applyIcon(iconEl, iconId);
                const content = titleEl.querySelector(
                    '.nav-folder-title-content, .nav-file-title-content'
                );
                if (content) titleEl.insertBefore(iconEl, content);
                else titleEl.prepend(iconEl);
                titleEl.addClass('zenith-has-icon');
            });
        }
    }

    private attachObservers(): void {
        this.detachObservers();
        for (const container of this.explorerContainers()) {
            const observer = new MutationObserver(() => this.scheduleDecorate());
            observer.observe(container, { childList: true, subtree: true });
            this.observers.push(observer);
        }
    }

    private detachObservers(): void {
        this.observers.forEach((o) => o.disconnect());
        this.observers = [];
    }

    // ── Assignment API ──────────────────────────────────────────────────────

    setIcon(path: string, iconId: string): void {
        const next = { ...this.icons, [path]: iconId };
        useZenithStore.getState().updateSettings({ folderIcons: next });
    }

    removeIcon(path: string): void {
        if (!(path in this.icons)) return;
        const next = { ...this.icons };
        delete next[path];
        useZenithStore.getState().updateSettings({ folderIcons: next });
    }

    // ── Context menu ────────────────────────────────────────────────────────

    private addMenuItems(menu: Menu, file: TAbstractFile): void {
        const path = file.path;
        const hasIcon = !!this.icons[path];
        const label = file instanceof TFolder ? 'folder' : 'file';

        menu.addItem((item) =>
            item
                .setTitle(hasIcon ? `Change ${label} icon` : `Set ${label} icon`)
                .setIcon('image')
                .onClick(() => {
                    new IconPickerModal(this.app, this.icons[path], (iconId) =>
                        this.setIcon(path, iconId)
                    ).open();
                })
        );

        if (hasIcon) {
            menu.addItem((item) =>
                item
                    .setTitle('Remove icon')
                    .setIcon('trash-2')
                    .onClick(() => this.removeIcon(path))
            );
        }
    }

    // ── Vault change bookkeeping ────────────────────────────────────────────

    private onRename(file: TAbstractFile, oldPath: string): void {
        const { icons, changed } = remapIconPaths(this.icons, oldPath, file.path);
        if (changed) useZenithStore.getState().updateSettings({ folderIcons: icons });
    }

    private onDelete(file: TAbstractFile): void {
        const { icons, changed } = pruneIconPaths(this.icons, file.path);
        if (changed) useZenithStore.getState().updateSettings({ folderIcons: icons });
    }
}
