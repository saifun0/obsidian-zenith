import * as obsidianNS from 'obsidian';
import * as reactNS from 'react';
import * as reactDomNS from 'react-dom';
import * as reactDomClientNS from 'react-dom/client';
import type { ZenithModuleApi } from './moduleApi';

/**
 * Running a third-party module's JavaScript.
 *
 * The old loader used Node's `require`, which does not exist on mobile. This
 * evaluates the source text instead — the same way Obsidian loads its own
 * community plugins — which was verified to work under the iOS WebView's CSP
 * before this was written.
 *
 * SECURITY: `new Function` compiles in global scope, so module code cannot see
 * Zenith's internals and the only Zenith surface it gets is what the shim hands
 * it. That is *encapsulation*, not a sandbox: the code still has `window`,
 * `app`, `fetch` and the whole vault, exactly like any Obsidian plugin. Nothing
 * in the UI may imply otherwise — see `ThirdPartyConsentModal`.
 */

/**
 * esbuild's `__toESM` wrapper parks the original `module.exports` on `default`.
 * A third-party module written as CommonJS expects that original object, not
 * the ESM namespace around it.
 */
function cjs(namespace: unknown): unknown {
    const withDefault = namespace as { default?: unknown };
    return withDefault?.default ?? namespace;
}

export type ModuleRequireShim = (id: string) => unknown;

/**
 * The `require` a module gets.
 *
 * It MUST close over these static imports. React is bundled into the plugin, so
 * handing back anything else — `window.React`, a fresh import — would give the
 * module a second React instance, and every hook in a third-party React widget
 * would fail with an opaque "invalid hook call". `obsidian` is externalised and
 * resolved by the app, so the same wrapper unwrapping applies.
 */
export function createRequireShim(zenith: ZenithModuleApi): ModuleRequireShim {
    return (id: string) => {
        switch (id) {
            case 'obsidian':
                return cjs(obsidianNS);
            case 'react':
                return cjs(reactNS);
            case 'react-dom':
                return cjs(reactDomNS);
            case 'react-dom/client':
                return cjs(reactDomClientNS);
            case 'zenith':
                return zenith;
            default:
                throw new Error(
                    `Zenith: module "${zenith.moduleId}" requested "${id}", which Zenith does ` +
                        `not provide. Available: obsidian, react, react-dom, react-dom/client, zenith.`
                );
        }
    };
}

/**
 * Many third-party bundlers emit `process.env.NODE_ENV` guards. Without a stub
 * those are a `ReferenceError` on the module's first line, in an environment
 * where there is no Node to provide the real thing.
 */
const PROCESS_SHIM = Object.freeze({
    env: Object.freeze({ NODE_ENV: 'production' }),
    platform: 'browser',
});

export interface EvalResult {
    exports: Record<string, unknown>;
}

/**
 * Evaluate CommonJS source text. Throws whatever the module throws at its top
 * level, so callers can attribute the failure to the module rather than to the
 * plugin.
 */
export function evaluateModule(
    code: string,
    options: { sourceName: string; require: ModuleRequireShim }
): EvalResult {
    // `sourceURL` on its own trailing line — a file ending in a `//` comment
    // would otherwise swallow it. Gives DevTools a named script, so a stack
    // trace reads `zenith-module://my-module/main.js:14` instead of `VM1234`.
    const wrapped = `${code}\n//# sourceURL=zenith-module://${options.sourceName}/main.js`;

    const factory = new Function(
        'module',
        'exports',
        'require',
        'process',
        '__filename',
        '__dirname',
        wrapped
    );

    const mod: EvalResult = { exports: {} };
    factory(
        mod,
        mod.exports,
        options.require,
        PROCESS_SHIM,
        // Strings only. Nothing here can be handed to an `fs` that isn't there.
        `${options.sourceName}/main.js`,
        options.sourceName
    );
    return mod;
}

/**
 * Pull the module class out of whatever shape the author exported:
 * `module.exports = class`, `exports.default = class`, or `export default`.
 */
export function extractModuleClass(exports: Record<string, unknown>): unknown {
    return exports.default ?? exports;
}
