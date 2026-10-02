import { TAbstractFile, TFolder, Menu } from 'obsidian';
import { useZenithStore } from '../store';
import { IconPickerModal } from './IconPickerModal';
import { remapIconPaths, pruneIconPaths } from './iconPaths';
import { applyIcon } from './icons/applyIcon';
import { iconRegistry } from './icons';
import type ZenithPlugin from '../main';
import { featureEnabled } from './features';

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
    /** The pending `decorate`, so unloading can call it off. */
    private timer: number | null = null;

    constructor(private readonly plugin: ZenithPlugin) {}

    private get app() {
        return this.plugin.app;
    }

    private get icons(): Record<string, string> {
        return useZenithStore.getState().settings.folderIcons;
    }

    private get enabled(): boolean {
        return featureEnabled(useZenithStore.getState().settings, 'core.folderIcons');
    }

    start(): void {
        this.app.workspace.onLayoutReady(() => this.sync());

        // Re-decorate when the layout changes (explorer opened, panes moved…).
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                if (!this.enabled) return;
                this.attachObservers();
                this.scheduleDecorate();
            })
        );

        // Switched off, the icons come out of the explorer and nothing keeps
        // watching it; switched on, both come back.
        this.plugin.register(
            useZenithStore.subscribe(
                (s) => featureEnabled(s.settings, 'core.folderIcons'),
                () => this.sync()
            )
        );

        // Keep assignments consistent as the vault changes — even while the
        // feature is off, so that switching it back on does not bring back
        // icons pinned to paths that were renamed in the meantime.
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

        // And when a pack arrives or changes: the same id can start to mean a
        // different picture, and nothing in the explorer would say so.
        this.plugin.register(iconRegistry.subscribe(() => this.scheduleDecorate()));

        this.plugin.register(() => {
            if (this.timer !== null) window.clearTimeout(this.timer);
            this.timer = null;
            this.detachObservers();
            this.removeAllInjected();
        });
    }

    /** Remove every icon we injected into the explorer (used on unload). */
    /** Bring the explorer in line with the feature switch. */
    private sync(): void {
        if (this.enabled) {
            this.attachObservers();
            this.decorate();
        } else {
            this.detachObservers();
            this.removeAllInjected();
        }
    }

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
        if (this.timer !== null) return;
        this.timer = window.setTimeout(() => {
            this.timer = null;
            this.decorate();
        }, 50);
    }

    private explorerContainers(): HTMLElement[] {
        return this.app.workspace
            .getLeavesOfType('file-explorer')
            .map((leaf) => (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl)
            .filter((el): el is HTMLElement => !!el);
    }

    /**
     * Bring every title in the explorer in line with the icon map.
     *
     * Only the titles that are wrong are touched, and that is the whole point.
     * The explorer is watched for changes so icons survive its re-renders, and
     * this method's own edits are changes too: when it redrew every icon on
     * every pass, each pass woke the observer, which scheduled the next one —
     * twenty redraws a second for as long as one icon was assigned. Each icon
     * carries what it was drawn from, so a title already showing the right one
     * is left exactly as it is, and a quiet explorer stays quiet.
     */
    private decorate(): void {
        if (!this.enabled) return;
        const icons = this.icons;
        // Part of what was drawn: a pack loaded later changes what an id looks
        // like without changing the id.
        const revision = iconRegistry.getRevision();
        for (const container of this.explorerContainers()) {
            const titles = container.querySelectorAll<HTMLElement>(
                '.nav-folder-title, .nav-file-title'
            );
            titles.forEach((titleEl) => {
                const path = titleEl.getAttribute('data-path');
                const iconId = path ? icons[path] : undefined;
                const wanted = iconId ? `${iconId}|${revision}` : null;
                const drawn = titleEl.querySelector<HTMLElement>('.zenith-nav-icon');

                if (drawn ? drawn.dataset.zenithIcon === wanted : wanted === null) return;

                drawn?.remove();
                titleEl.removeClass('zenith-has-icon');
                if (!iconId || !wanted) return;

                const iconEl = createSpan({ cls: 'zenith-nav-icon' });
                iconEl.dataset.zenithIcon = wanted;
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
        if (!this.enabled) return;
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
