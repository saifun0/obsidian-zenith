import type ZenithPlugin from '../main';
import { useZenithStore } from '../store';
import type { ZenithSettings } from '../store/settingsSlice';

/**
 * Keeping Zenith's views out from under a phone's own chrome.
 *
 * On a phone the top of the screen belongs to the camera and the status bar,
 * and the bottom to Obsidian's buttons and the gesture bar. Where a view
 * reaches under either — a theme that hides the view header, a navbar that
 * floats over the pane, a phone whose cut-out Obsidian does not step around —
 * its first card sits under the camera and its last under the buttons, and the
 * last one cannot even be scrolled clear.
 *
 * A fixed padding would be wrong on every phone but one, and doubled wherever
 * Obsidian already keeps the view clear. So the covered bands are measured —
 * the safe-area insets Obsidian and the WebView report, the bottom of a view
 * header that overlaps its own content, the top of the navbar — and each view
 * is given exactly the part of them it lies under: nothing, usually, on a
 * layout that already fits. Where the measurement is wrong for a phone, the
 * bands can be set by hand (Appearance → Phone), for portrait.
 *
 * Views get `--zenith-inset-top` / `--zenith-inset-bottom` and, when either is
 * above zero, the class `has-zenith-insets`, which pads them (`base.css`).
 * The settings page gets `--zenith-inset-top` too: Obsidian floats its back
 * button, title and close button over the settings' scroll area, below the
 * status bar, so what covers its top is measured from those
 * (`SettingsApp.css`).
 * Overlays drawn over everything — dialogs, sheets, the lightbox — only need
 * the system's bands, and read `--zenith-safe-top` / `--zenith-safe-bottom`
 * from `body`.
 */

/** Heights, in px, covered at the top and at the bottom of the screen. */
export interface Bands {
    top: number;
    bottom: number;
}

/** How much of a box lying at `box.top`…`box.bottom` the covered bands hide. */
export function overlap(
    box: { top: number; bottom: number },
    screenHeight: number,
    covered: Bands
): Bands {
    return {
        top: Math.max(0, Math.round(covered.top - box.top)),
        bottom: Math.max(0, Math.round(box.bottom - (screenHeight - covered.bottom))),
    };
}

/** What was measured, for the settings readout and the device check. */
export interface InsetReading {
    /** The system's bands: the cut-out and status bar, the gesture bar. */
    system: Bands;
    /** Height of Obsidian's navbar from the screen's bottom edge; 0 when absent. */
    navbar: number;
    /** Whether the bands in force were set by hand. */
    manual: boolean;
    /** The largest inset any open Zenith view, or the settings page, was given. */
    applied: Bands;
}

const VIEW_SELECTOR = '.workspace-leaf-content > .view-content.zenith-root';
const SETTINGS_SELECTOR = '.zenith-custom-settings-container.is-mobile-settings';

/** Portrait: the only orientation the hand-set bands are meant for. */
const portrait = () => window.innerHeight >= window.innerWidth;

const visible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/**
 * The lowest edge of anything Obsidian floats over the top of `el` — in the
 * settings modal on a phone, its back button, title and close button.
 *
 * Found by position rather than by class name, since those names are
 * Obsidian's to change: small things in the same modal, outside `el`, lying
 * across its top in the upper part of the screen. Anything tall is a panel,
 * not a button, and is left out.
 */
function floatingChromeBottom(el: HTMLElement, screenHeight: number): number {
    const root = el.closest('.modal-container') ?? el.closest('.modal');
    if (!root) return 0;
    const box = el.getBoundingClientRect();
    let bottom = 0;
    root.querySelectorAll<HTMLElement>('*').forEach((node) => {
        if (el.contains(node) || node.contains(el)) return;
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height || r.height > 160) return;
        if (r.top > screenHeight * 0.3 || r.bottom <= box.top || r.bottom <= bottom) return;
        if (r.right <= box.left || r.left >= box.right) return;
        if (getComputedStyle(node).visibility === 'hidden') return;
        bottom = r.bottom;
    });
    return bottom;
}

export class MobileInsets {
    private probe: HTMLElement | null = null;
    private frame = 0;
    private observer: ResizeObserver | null = null;
    private observed = new Set<Element>();
    private disposers: Array<() => void> = [];
    private listeners = new Set<() => void>();
    reading: InsetReading = {
        system: { top: 0, bottom: 0 },
        navbar: 0,
        manual: false,
        applied: { top: 0, bottom: 0 },
    };

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        // The system's bands, read through an element rather than parsed:
        // Obsidian sets `--safe-area-inset-*` itself where the WebView's own
        // `env()` reports nothing (Android), and the larger of the two is the
        // one that is true.
        const probe = document.body.createDiv({ cls: 'zenith-inset-probe' });
        probe.setAttribute('aria-hidden', 'true');
        this.probe = probe;

        const refresh = () => this.schedule();
        window.addEventListener('resize', refresh);
        window.addEventListener('orientationchange', refresh);
        this.disposers.push(() => {
            window.removeEventListener('resize', refresh);
            window.removeEventListener('orientationchange', refresh);
        });
        const { workspace } = this.plugin.app;
        const refs = [
            workspace.on('layout-change', refresh),
            workspace.on('resize', refresh),
            workspace.on('active-leaf-change', refresh),
        ];
        this.disposers.push(() => refs.forEach((ref) => workspace.offref(ref)));
        this.disposers.push(
            useZenithStore.subscribe(
                (s) =>
                    `${s.settings.mobileInsets}|${s.settings.mobileInsetTop}|${s.settings.mobileInsetBottom}`,
                refresh
            )
        );
        if (typeof ResizeObserver !== 'undefined') this.observer = new ResizeObserver(refresh);
        // Obsidian's chrome settles after the plugin loads.
        workspace.onLayoutReady(refresh);
        this.schedule();
    }

    stop(): void {
        cancelAnimationFrame(this.frame);
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.observer?.disconnect();
        this.observer = null;
        this.observed.clear();
        this.probe?.remove();
        this.probe = null;
        document.body.style.removeProperty('--zenith-safe-top');
        document.body.style.removeProperty('--zenith-safe-bottom');
        document.querySelectorAll<HTMLElement>(VIEW_SELECTOR).forEach((el) => {
            el.style.removeProperty('--zenith-inset-top');
            el.style.removeProperty('--zenith-inset-bottom');
            el.removeClass('has-zenith-insets');
        });
        document.querySelectorAll<HTMLElement>(SETTINGS_SELECTOR).forEach((el) => {
            el.style.removeProperty('--zenith-inset-top');
        });
    }

    /** Re-read on every change, once a frame at most. */
    schedule(): void {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.measure());
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private watch(el: Element): void {
        if (!this.observer || this.observed.has(el)) return;
        this.observed.add(el);
        this.observer.observe(el);
    }

    private measure(): void {
        const probe = this.probe;
        if (!probe) return;
        const settings: ZenithSettings = useZenithStore.getState().settings;
        const height = window.innerHeight;

        const style = getComputedStyle(probe);
        const system = {
            top: parseFloat(style.paddingTop) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
        };

        const navbarEl = document.querySelector('.mobile-navbar');
        const navbar = visible(navbarEl)
            ? Math.max(0, Math.round(height - navbarEl.getBoundingClientRect().top))
            : 0;
        if (navbarEl) this.watch(navbarEl);

        const manual = settings.mobileInsets === 'manual' && portrait();
        const screen: Bands = manual
            ? { top: settings.mobileInsetTop, bottom: settings.mobileInsetBottom }
            : { top: system.top, bottom: Math.max(system.bottom, navbar) };

        // Overlays sit over Obsidian's navbar, so only the system's bottom band
        // is theirs to avoid; hand-set bands stand for the whole of it.
        document.body.style.setProperty('--zenith-safe-top', `${Math.round(screen.top)}px`);
        document.body.style.setProperty(
            '--zenith-safe-bottom',
            `${Math.round(manual ? screen.bottom : system.bottom)}px`
        );

        const applied: Bands = { top: 0, bottom: 0 };
        document.querySelectorAll<HTMLElement>(VIEW_SELECTOR).forEach((el) => {
            this.watch(el);
            if (!visible(el)) return;
            const box = el.getBoundingClientRect();
            // A header drawn over its own view's content covers it too.
            const header = el.parentElement?.querySelector(':scope > .view-header') ?? null;
            let top = screen.top;
            if (!manual && visible(header)) {
                const bottom = header.getBoundingClientRect().bottom;
                if (bottom > box.top + 1) top = Math.max(top, bottom);
            }
            const inset = overlap(box, height, { top, bottom: screen.bottom });
            el.style.setProperty('--zenith-inset-top', `${inset.top}px`);
            el.style.setProperty('--zenith-inset-bottom', `${inset.bottom}px`);
            el.toggleClass('has-zenith-insets', inset.top > 0 || inset.bottom > 0);
            applied.top = Math.max(applied.top, inset.top);
            applied.bottom = Math.max(applied.bottom, inset.bottom);
        });

        // The settings page: the status bar, and Obsidian's buttons over it.
        document.querySelectorAll<HTMLElement>(SETTINGS_SELECTOR).forEach((el) => {
            this.watch(el);
            if (!visible(el)) return;
            const top = Math.max(screen.top, floatingChromeBottom(el, height));
            const inset = Math.max(0, Math.round(top - el.getBoundingClientRect().top));
            el.style.setProperty('--zenith-inset-top', `${inset}px`);
            applied.top = Math.max(applied.top, inset);
        });

        this.reading = { system, navbar, manual, applied };
        this.listeners.forEach((l) => l());
    }
}
