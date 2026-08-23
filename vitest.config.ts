import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    resolve: {
        alias: {
            // `obsidian` is provided by the app at runtime and marked external
            // in the bundle; point it at a stub so pure modules can be tested.
            obsidian: resolve(__dirname, 'tests/mocks/obsidian.ts'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
