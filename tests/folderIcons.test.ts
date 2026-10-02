// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FolderIconService } from '../src/core/FolderIconService';
import { iconRegistry } from '../src/core/icons';
import { resetZenithStore, useZenithStore } from '../src/store';
import type ZenithPlugin from '../src/main';

/**
 * The explorer decorator, against a real DOM with a real MutationObserver.
 *
 * The bug this pins down only exists between the two: the decorator watches
 * the explorer for changes, and its own edits are changes. A decorator that
 * redraws on every pass wakes its own observer, which schedules the next pass
 * — for as long as a single icon is assigned.
 */

// ── Obsidian's DOM helpers, which the app installs and happy-dom does not ──

type Helpers = {
    addClass(cls: string): void;
    removeClass(cls: string): void;
};
const proto = HTMLElement.prototype as unknown as Helpers;
proto.addClass = function (this: HTMLElement, cls: string) {
    this.classList.add(cls);
};
proto.removeClass = function (this: HTMLElement, cls: string) {
    this.classList.remove(cls);
};
(globalThis as unknown as { createSpan: (o: { cls: string }) => HTMLSpanElement }).createSpan = (
    o
) => {
    const span = document.createElement('span');
    span.className = o.cls;
    return span;
};

// ── A file explorer, and just enough plugin to hold the service ──

function title(path: string, kind: 'folder' | 'file'): HTMLElement {
    const el = document.createElement('div');
    el.className = `nav-${kind}-title`;
    el.setAttribute('data-path', path);
    const content = document.createElement('div');
    content.className = `nav-${kind}-title-content`;
    content.textContent = path;
    el.appendChild(content);
    return el;
}

function explorer(): HTMLElement {
    const container = document.createElement('div');
    container.appendChild(title('Projects', 'folder'));
    container.appendChild(title('Projects/plan.md', 'file'));
    document.body.appendChild(container);
    return container;
}

function fakePlugin(container: HTMLElement) {
    const disposers: Array<() => void> = [];
    const plugin = {
        app: {
            workspace: {
                onLayoutReady: (cb: () => void) => cb(),
                on: () => ({}),
                getLeavesOfType: (type: string) =>
                    type === 'file-explorer' ? [{ view: { containerEl: container } }] : [],
            },
            vault: { on: () => ({}) },
        },
        registerEvent: () => undefined,
        register: (fn: () => void) => disposers.push(fn),
    } as unknown as ZenithPlugin;
    return { plugin, unload: () => disposers.splice(0).forEach((d) => d()) };
}

/** Mutations the explorer goes through from here on. */
function countMutations(container: HTMLElement) {
    let count = 0;
    const observer = new MutationObserver((records) => {
        count += records.length;
    });
    observer.observe(container, { childList: true, subtree: true });
    return {
        get count() {
            return count;
        },
        stop: () => observer.disconnect(),
    };
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const icon = (container: HTMLElement, path: string) =>
    container.querySelector<HTMLElement>(`[data-path="${path}"] .zenith-nav-icon`);

describe('folder icons in the file explorer', () => {
    let container: HTMLElement;
    let unload: () => void;

    beforeEach(() => {
        resetZenithStore();
        useZenithStore.getState().updateSettings({ folderIcons: { Projects: 'folder-kanban' } });
        container = explorer();
        const made = fakePlugin(container);
        unload = made.unload;
        new FolderIconService(made.plugin).start();
    });

    afterEach(() => {
        unload();
        container.remove();
    });

    it('draws the icon a path was given, and nothing on the others', () => {
        expect(icon(container, 'Projects')).not.toBeNull();
        expect(icon(container, 'Projects/plan.md')).toBeNull();
        expect(container.querySelector('[data-path="Projects"]')?.classList).toContain(
            'zenith-has-icon'
        );
    });

    it('leaves a quiet explorer alone once the icons are drawn', async () => {
        await settle(100);
        const seen = countMutations(container);
        await settle();
        seen.stop();
        // It used to redraw every icon twenty times a second, for ever.
        expect(seen.count).toBe(0);
    });

    it('redraws a title when its icon changes, and clears it when unassigned', async () => {
        useZenithStore.getState().updateSettings({ folderIcons: { Projects: 'star' } });
        await settle(100);
        expect(icon(container, 'Projects')?.dataset.zenithIcon).toMatch(/^star\|/);

        useZenithStore.getState().updateSettings({ folderIcons: {} });
        await settle(100);
        expect(icon(container, 'Projects')).toBeNull();
        expect(container.querySelector('[data-path="Projects"]')?.classList).not.toContain(
            'zenith-has-icon'
        );
    });

    it('decorates a title the explorer draws afresh', async () => {
        // What a collapse and re-expand, or a re-sort, does to the explorer.
        container.querySelector('[data-path="Projects"]')?.remove();
        container.appendChild(title('Projects', 'folder'));
        await settle(100);
        expect(icon(container, 'Projects')).not.toBeNull();
    });

    it('redraws when an icon pack changes what an id looks like', async () => {
        const before = icon(container, 'Projects')?.dataset.zenithIcon;
        iconRegistry.emit();
        await settle(100);
        const after = icon(container, 'Projects')?.dataset.zenithIcon;
        expect(after).not.toBe(before);
    });

    it('calls off a pending redraw when unloaded, and leaves nothing behind', async () => {
        useZenithStore.getState().updateSettings({ folderIcons: { Projects: 'star' } });
        unload();
        await settle(100);
        expect(container.querySelector('.zenith-nav-icon')).toBeNull();
    });
});
