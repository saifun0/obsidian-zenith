import { describe, it, expect } from 'vitest';
import { VAULT_STRUCTURE } from '../src/core/VaultScaffoldService';
import { DEFAULT_JOURNAL_FOLDER, LEGACY_JOURNAL_FOLDER } from '../src/core/constants';

describe('vault structure', () => {
    it('gives every folder an icon', () => {
        const missing = VAULT_STRUCTURE.filter((f) => !f.icon.trim()).map((f) => f.name);
        expect(missing).toEqual([]);
    });

    it('uses ids in the shape getIconIds() reports', () => {
        // Not validated against lucide-react: these are OBSIDIAN icon ids, where
        // lucide names arrive `lucide-` prefixed and Obsidian's own glyphs (such
        // as `box-glyph`) are not lucide at all. The real guard is the
        // `getIconIds()` check in `assignIcons`, which runs where that list
        // exists; this only catches a malformed id.
        const malformed = VAULT_STRUCTURE.filter((f) => !/^[a-z0-9][a-z0-9-]*$/.test(f.icon));
        expect(malformed.map((f) => f.icon)).toEqual([]);
    });

    it('has no duplicate folder names', () => {
        const names = VAULT_STRUCTURE.map((f) => f.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('keeps the archive folder the scaffold moves things into', () => {
        // `VaultScaffoldService` archives pre-existing content into "50 Archive";
        // renaming it here without renaming it there would archive into a folder
        // the structure never creates.
        expect(VAULT_STRUCTURE.map((f) => f.name)).toContain('50 Archive');
    });
});

describe('journal folder tracks the structure', () => {
    it('puts daily notes inside a folder the scaffold creates', () => {
        // The coupling that bites: a fresh vault takes its folders from
        // VAULT_STRUCTURE and its journal path from DEFAULT_JOURNAL_FOLDER. If
        // they disagree, the scaffold builds a journal folder the journal never
        // writes to, and the journal silently creates a second one beside it.
        const parent = DEFAULT_JOURNAL_FOLDER.split('/')[0];
        expect(VAULT_STRUCTURE.map((f) => f.name)).toContain(parent);
    });

    it('is 15 Journal everywhere the journal is declared', () => {
        expect(DEFAULT_JOURNAL_FOLDER.startsWith('15 Journal/')).toBe(true);
        // The one surviving "11 Journal" is read-only: it recognises a config
        // written before the renumbering so the migration can move it forward.
        // Nothing writes it.
        expect(LEGACY_JOURNAL_FOLDER).toBe('11 Journal');
        expect(VAULT_STRUCTURE.map((f) => f.name)).not.toContain(LEGACY_JOURNAL_FOLDER);
    });
});
