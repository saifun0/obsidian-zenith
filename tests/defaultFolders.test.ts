import { describe, it, expect } from 'vitest';
import {
    DEFAULT_CONTENT_FOLDER,
    DEFAULT_JOURNAL_FOLDER,
    DEFAULT_TASKS_FOLDER,
} from '../src/core/constants';
import { VAULT_STRUCTURE } from '../src/core/VaultScaffoldService';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';

/**
 * The folders Zenith looks in, against the folders Zenith makes.
 *
 * Two lists written in two files, and nothing was holding them together. A
 * vault scaffolded by Zenith's own Vault Setup button came up pointing at
 * `tasks` and `content`, neither of which the button creates — so a brand new,
 * untouched vault warned about two missing folders on every reload, and had
 * done for as long as nobody read the console.
 *
 * The rule was already written down, on `DEFAULT_JOURNAL_FOLDER`: a default has
 * to track `VAULT_STRUCTURE`. This is that rule, enforced.
 */

const roots = VAULT_STRUCTURE.map((folder) => folder.name);

/** The top-level folder a path starts in. */
const rootOf = (path: string) => path.split('/')[0];

describe('every default folder is one the scaffold creates', () => {
    for (const [name, path] of [
        ['tasks', DEFAULT_TASKS_FOLDER],
        ['content', DEFAULT_CONTENT_FOLDER],
        ['journal', DEFAULT_JOURNAL_FOLDER],
    ] as const) {
        it(`${name} sits inside the scaffolded structure`, () => {
            expect(roots).toContain(rootOf(path));
        });
    }

    it('and the stored defaults are those same paths', () => {
        // The other half of the same drift: a constant nobody uses is no better
        // than a constant that is wrong.
        expect(DEFAULT_SETTINGS.tasksFolderPath).toBe(DEFAULT_TASKS_FOLDER);
        expect(DEFAULT_SETTINGS.contentFolderPath).toBe(DEFAULT_CONTENT_FOLDER);
        expect(DEFAULT_SETTINGS.journalFolderPath).toBe(DEFAULT_JOURNAL_FOLDER);
    });
});
