import { describe, it, expect } from 'vitest';
import * as reactNS from 'react';
import {
    createRequireShim,
    evaluateModule,
    extractModuleClass,
} from '../src/core/moduleEval';
import type { ZenithModuleApi } from '../src/core/moduleApi';

/** Just enough of the API for the shim to hand back. */
const api = { moduleId: 'sample' } as ZenithModuleApi;
const shim = createRequireShim(api);

const run = (code: string) => evaluateModule(code, { sourceName: 'sample', require: shim });

describe('evaluateModule', () => {
    it('accepts the CommonJS shape', () => {
        const { exports } = run('module.exports = class { constructor() { this.id = "a"; } };');
        expect(typeof extractModuleClass(exports)).toBe('function');
    });

    it('accepts a transpiled default export', () => {
        const { exports } = run('exports.default = class { constructor() { this.id = "a"; } };');
        expect(typeof extractModuleClass(exports)).toBe('function');
    });

    it('lets a top-level throw reach the caller, so it can be attributed', () => {
        expect(() => run('throw new Error("boom");')).toThrow('boom');
    });

    it('reports a syntax error rather than failing silently', () => {
        expect(() => run('this is not javascript')).toThrow();
    });

    it('provides a process shim, since bundlers emit NODE_ENV guards', () => {
        const { exports } = run('module.exports = { env: process.env.NODE_ENV };');
        expect((exports as { env: string }).env).toBe('production');
    });

    it('provides __filename and __dirname as plain strings', () => {
        const { exports } = run('module.exports = { f: __filename, d: __dirname };');
        expect(exports).toEqual({ f: 'sample/main.js', d: 'sample' });
    });

    it('appends sourceURL on its own line, surviving a trailing comment', () => {
        // A file ending in `// something` would otherwise swallow the marker
        // and the module would show up as VM1234 in a stack trace.
        expect(() => run('module.exports = {}; // trailing comment')).not.toThrow();
    });

    it('cannot see the loader\'s own scope', () => {
        // `new Function` compiles in global scope; a module reaching for a
        // local of this file must fail rather than find it.
        expect(() => run('module.exports = { stolen: shim };')).toThrow(/shim is not defined/);
    });
});

describe('createRequireShim', () => {
    it('hands back the bundle\'s own React, not a second copy', () => {
        // Two React instances is the failure mode that produces an opaque
        // "invalid hook call" in every third-party React widget, so identity
        // here is the thing worth asserting.
        const first = shim('react');
        const second = shim('react');
        expect(first).toBe(second);
        expect(first).toBe((reactNS as { default?: unknown }).default ?? reactNS);
    });

    it('resolves the documented module ids', () => {
        for (const id of ['obsidian', 'react', 'react-dom', 'react-dom/client']) {
            expect(shim(id)).toBeDefined();
        }
        expect(shim('zenith')).toBe(api);
    });

    it('names what was asked for when it cannot provide it', () => {
        expect(() => shim('lodash')).toThrow(/lodash/);
        // And names the module doing the asking, so the user knows who to blame.
        expect(() => shim('lodash')).toThrow(/sample/);
    });
});

describe('extractModuleClass', () => {
    it('prefers a default export but falls back to the exports object', () => {
        const cls = class {};
        expect(extractModuleClass({ default: cls })).toBe(cls);
        const bare = { a: 1 };
        expect(extractModuleClass(bare)).toBe(bare);
    });
});
