import { setIcon } from 'obsidian';
import { useZenithStore } from '../../store';
import { resolveMediaSrc } from './mediaService';
import { MediaPickerModal } from './MediaPickerModal';
import type ZenithPlugin from '../../main';

/**
 * MediaBannerService — renders the selected image/GIF as a banner at the top of
 * Obsidian's file explorer, above the folder tree. Clicking it opens the picker.
 *
 * The banner is injected directly into the explorer DOM (before
 * `.nav-files-container`) and re-applied on layout / DOM changes so it survives
 * the explorer's re-renders. Module-scoped: `start()` on module load,
 * `stop()` on unload cleanly removes everything.
 */
export class MediaBannerService {
    private observers: MutationObserver[] = [];
    private disposers: Array<() => void> = [];
    private scheduled = false;

    constructor(private readonly plugin: ZenithPlugin) {}

    private get app() {
        return this.plugin.app;
    }

    start(): void {
        this.app.workspace.onLayoutReady(() => {
            this.attachObservers();
            this.render();
        });

        const onLayout = this.app.workspace.on('layout-change', () => {
            this.attachObservers();
            this.schedule();
        });
        this.disposers.push(() => this.app.workspace.offref(onLayout));

        // Re-render when the selected image changes.
        this.disposers.push(
            useZenithStore.subscribe(
                (s) => s.settings.mediaSelected,
                () => this.schedule()
            )
        );
    }

    stop(): void {
        this.detachObservers();
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.removeAll();
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        window.setTimeout(() => {
            this.scheduled = false;
            this.render();
        }, 50);
    }

    private explorerContainers(): HTMLElement[] {
        return this.app.workspace
            .getLeavesOfType('file-explorer')
            .map((leaf) => (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl)
            .filter((el): el is HTMLElement => !!el);
    }

    private render(): void {
        const ref = useZenithStore.getState().settings.mediaSelected;
        const src = ref ? resolveMediaSrc(this.app, ref) : null;

        for (const container of this.explorerContainers()) {
            const tree = container.querySelector<HTMLElement>('.nav-files-container');
            if (!tree || !tree.parentElement) continue;

            // Reuse our banner anywhere in the explorer subtree (its parent may be
            // a nested wrapper), otherwise create one just above the tree.
            let banner = container.querySelector<HTMLElement>('.zenith-media-banner');
            if (!banner) {
                banner = createDiv('zenith-media-banner');
                tree.parentElement.insertBefore(banner, tree);
            }
            this.fillBanner(banner, src);
        }
    }

    private fillBanner(banner: HTMLElement, src: string | null): void {
        banner.empty();
        banner.onclick = () => new MediaPickerModal(this.app).open();

        if (src) {
            banner.removeClass('zenith-media-banner--empty');
            const img = banner.createEl('img', { cls: 'zenith-media-banner__img' });
            img.src = src;
            img.addEventListener('error', () => banner.addClass('zenith-media-banner--broken'));

            const edit = banner.createDiv('zenith-media-banner__edit');
            setIcon(edit, 'image');
        } else {
            banner.addClass('zenith-media-banner--empty');
            const icon = banner.createSpan('zenith-media-banner__empty-icon');
            setIcon(icon, 'image-plus');
            banner.createSpan({ cls: 'zenith-media-banner__empty-text', text: 'Add banner image' });
        }
    }

    private removeAll(): void {
        for (const container of this.explorerContainers()) {
            container.querySelectorAll('.zenith-media-banner').forEach((el) => el.remove());
        }
    }

    // ── Observers ───────────────────────────────────────────────────────────

    private attachObservers(): void {
        this.detachObservers();
        for (const container of this.explorerContainers()) {
            const observer = new MutationObserver(() => {
                // Re-inject only if our banner went missing (avoids feedback loops).
                if (!container.querySelector('.zenith-media-banner')) this.schedule();
            });
            observer.observe(container, { childList: true, subtree: true });
            this.observers.push(observer);
        }
    }

    private detachObservers(): void {
        this.observers.forEach((o) => o.disconnect());
        this.observers = [];
    }
}
