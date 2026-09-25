import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Zenith ESLint — the type-aware pass.
 *
 * Separate from `eslint.config.mjs` on purpose. The everyday run has to be
 * fast and needs no `tsconfig` wiring; this one builds a full type graph, so
 * it takes an order of magnitude longer and is worth running deliberately —
 * before a release, or when hunting the class of bug it is good at.
 *
 * ── What it is good at ──
 *
 * `no-floating-promises` and `no-misused-promises` are the reason this file
 * exists: a promise nobody awaits fails silently, and an async function handed
 * to something expecting `void` turns a caught error into an unhandled
 * rejection. Neither is visible to the fast lint run, to `tsc`, or to a test.
 * `no-base-to-string` is the third: it catches `${value}` on something that
 * renders as "[object Object]", which in this plugin means YAML somebody wrote
 * by hand reaching the screen.
 *
 * ── What it is noisy at ──
 *
 * The `no-unsafe-*` family fires wherever an `any` enters, and in a plugin
 * most `any`s come from Obsidian's own untyped surfaces rather than from
 * choices made here. `require-await` flags async functions that satisfy an
 * interface without awaiting anything, which is fair and almost never a bug.
 * Those are left ON rather than switched off: this config is a magnifying
 * glass, not a gate, and a finding that needs a human to dismiss is better
 * than one that was never shown.
 *
 * Run it with `npm run lint:types`. It is not wired into `npm run build`,
 * because a rule nobody has triaged should not be able to stop a release.
 */
export default tseslint.config(
    {
        ignores: [
            'node_modules',
            'dist',
            'tests/**',
            '*.mjs',
            'vitest.config.ts',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                HTMLElement: 'readonly',
                Element: 'readonly',
                Event: 'readonly',
                KeyboardEvent: 'readonly',
                MouseEvent: 'readonly',
                Node: 'readonly',
                ResizeObserver: 'readonly',
                IntersectionObserver: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                FileReader: 'readonly',
                AbortController: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                crypto: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                performance: 'readonly',
            },
        },
    }
);
