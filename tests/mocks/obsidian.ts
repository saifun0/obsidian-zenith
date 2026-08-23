/**
 * Minimal stub of the `obsidian` module for unit tests.
 *
 * The real module is provided by the Obsidian runtime and marked `external` in
 * the bundle, so it can't be imported in a plain Node/vitest process. We alias
 * `obsidian` to this file in vitest.config.ts and provide just the runtime
 * values the tested modules reference at import time.
 */

export class TFile {
    path = '';
    extension = 'md';
    basename = '';
    stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder {
    path = '';
    children: unknown[] = [];
}

export class TAbstractFile {
    path = '';
}

/** A tiny YAML subset is enough for our tests; delegate to a naive parser. */
export function parseYaml(input: string): unknown {
    const out: Record<string, unknown> = {};
    for (const line of input.split('\n')) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

export function normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export const moment = () => ({ format: () => '' });

/**
 * Enough of `Modal` to be extended at import time.
 *
 * Settings schemas pull in the components they render, and some of those import
 * modal subclasses — `class X extends Modal` is evaluated when the module is
 * loaded, so the base has to exist even though no test opens one.
 */
export class Modal {
    contentEl = {} as HTMLElement;
    constructor(public app?: unknown) {}
    open(): void {}
    close(): void {}
    onOpen(): void {}
    onClose(): void {}
}

export class SuggestModal<T> extends Modal {
    getSuggestions(_query: string): T[] {
        return [];
    }
}

export class FuzzySuggestModal<T> extends SuggestModal<T> {}

export class Notice {
    constructor(public message?: string) {}
    hide(): void {}
}

export const Platform = { isMobile: false, isMobileApp: false, isIosApp: false, isAndroidApp: false };

export function setIcon(): void {}

export function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}

/** Network is disabled in tests; modules that reach the network inject a fetcher. */
export async function requestUrl(): Promise<{ json: unknown }> {
    throw new Error('requestUrl is not available in tests');
}
