import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Zenith ESLint — Obsidian's own rules, from `eslint-plugin-obsidianmd`.
 *
 * The set the community directory's review is built on: deprecated and
 * unsupported APIs, command naming, settings headings, the manifest and the
 * license, and the typescript-eslint type-checked set it bundles. Kept apart
 * from `eslint.config.mjs` for the same reason `eslint.typeaware.mjs` is: it
 * builds a full type graph and takes a while, so it is run deliberately —
 * before a release, and before submitting to the directory.
 *
 * Run it with `npm run lint:obsidian`.
 */
export default tseslint.config(
    {
        ignores: [
            'node_modules',
            'dist',
            'tests/**',
            'scripts/**',
            '*.mjs',
            'vitest.config.ts',
        ],
    },
    ...obsidianmd.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        // The same hooks rules as the everyday config, so its disable comments
        // name a rule this run knows.
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    }
);
