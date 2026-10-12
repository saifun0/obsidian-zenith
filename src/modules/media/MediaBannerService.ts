import { setIcon } from 'obsidian';
import { useZenithStore } from '../../store';
import { resolveMediaSrc } from './mediaService';
import { openMediaPicker } from './openMediaPicker';
import type ZenithPlugin from '../../main';
import { translateNow } from '../../core/i18n';

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
    /** The redraw that is waiting, if one is. */
    private timer: number | null = null;

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
        // A redraw still waiting would put the banner back a moment after the
        // module was switched off, with nothing left to take it away again.
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        this.detachObservers();
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.removeAll();
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private schedule(): void {
        if (this.timer !== null) return;
        this.timer = window.setTimeout(() => {
            this.timer = null;
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
        banner.onclick = () => openMediaPicker(this.plugin);

        if (src) {
            banner.removeClass('zenith-media-banner--empty');
            const img = banner.createEl('img', { cls: 'zenith-media-banner__img' });
            img.src = src;
            // A picture that cannot be shown — the file deleted, the link dead —
            // leaves the banner as it is when there is none: a way to choose one.
            img.addEventListener('error', () => this.fillBanner(banner, null));

            const edit = banner.createDiv('zenith-media-banner__edit');
            setIcon(edit, 'image');
        } else {
            banner.addClass('zenith-media-banner--empty');
            const icon = banner.createSpan('zenith-media-banner__empty-icon');
            setIcon(icon, 'image-plus');
            banner.createSpan({ cls: 'zenith-media-banner__empty-text', text: translateNow('media.banner.empty') });
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
