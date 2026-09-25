import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Zenith ESLint (flat config).
 *
 * Uses the (non type-aware) typescript-eslint recommended rules so the lint run
 * is fast and needs no tsconfig project wiring. `eslint-plugin-obsidianmd`
 * (which flags deprecated Obsidian APIs) is installed but not enabled by
 * default: its recommended set pulls in type-aware rules, which this fast run
 * avoids. See docs/en/development.md for how to run it.
 */
export default tseslint.config(
    {
        ignores: [
            'node_modules',
            'dist',
            'tests/mocks/**',
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
        // ── The two rules that are about bugs ──
        //
        // `rules-of-hooks` is an error because breaking it is not a style
        // question: a hook called conditionally reads another hook's state on
        // the next render, and React has no way to tell you except by
        // misbehaving. `exhaustive-deps` is a warning because it is right
        // about the risk and occasionally wrong about the fix — a dependency
        // left out on purpose is a thing that happens, and it should be
        // argued with in a comment rather than silenced by turning the rule
        // off for everyone.
        //
        // Deliberately NOT the plugin's `recommended` set, which in v7 pulls
        // in the React Compiler rules. Those describe a stricter language than
        // this codebase was written in, and switching them on wholesale turns
        // a bug hunt into a migration.
        files: ['src/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: { process: 'readonly' },
        },
    }
);
