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

/**
 * A tiny YAML subset is enough for our tests; delegate to a naive parser.
 *
 * It does refuse a couple of things outright, which the naive version did not.
 * The real `parseYaml` throws on malformed input, and code with a `catch` around
 * it cannot be tested against a stand-in that never throws — the branch is not
 * reachable at all, which is how such a branch comes to be wrong unnoticed.
 */
export function parseYaml(input: string): unknown {
    const out: Record<string, unknown> = {};

    for (const line of input.split('\n')) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (!m) continue;

        const value = m[2];
        // A flow sequence or mapping that is opened and never closed, and a
        // quote with no partner. Both are errors in real YAML.
        if (/^[[{]/.test(value) && !/[\]}]\s*$/.test(value)) {
            throw new Error('unexpected end of the stream within a flow collection');
        }
        if (/^["']/.test(value) && !value.slice(1).includes(value[0])) {
            throw new Error('unexpected end of the stream within a quoted scalar');
        }

        out[m[1]] = value;
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

/** Obsidian's interface language. English unless a test sets `mockLanguage.value`. */
export const mockLanguage = { value: 'en' };
export function getLanguage(): string {
    return mockLanguage.value;
}

export function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}

/** Network is disabled in tests; modules that reach the network inject a fetcher. */
export async function requestUrl(): Promise<{ json: unknown }> {
    throw new Error('requestUrl is not available in tests');
}
