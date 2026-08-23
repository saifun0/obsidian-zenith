import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Zenith ESLint (flat config).
 *
 * Uses the (non type-aware) typescript-eslint recommended rules so the lint run
 * is fast and needs no tsconfig project wiring. `eslint-plugin-obsidianmd`
 * (which flags deprecated Obsidian APIs) is installed but not enabled by
 * default: it reads a root `manifest.json` at import time — this repo keeps its
 * manifest as `manifest.source.json` — and its recommended set pulls in
 * type-aware rules. See README for how to opt in.
 */
export default tseslint.config(
    {
        ignores: [
            'node_modules',
            'dist',
            'tests/mocks/**',
            'modules_def/**',
            'esbuild.config.mjs',
            'eslint.config.mjs',
            'vitest.config.ts',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                requestAnimationFrame: 'readonly',
                HTMLElement: 'readonly',
                HTMLInputElement: 'readonly',
                HTMLDivElement: 'readonly',
                HTMLSelectElement: 'readonly',
                MouseEvent: 'readonly',
                Node: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-empty': ['warn', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: { process: 'readonly' },
        },
    }
);
