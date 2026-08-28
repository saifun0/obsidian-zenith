import { describe, expect, it } from 'vitest';
import { maskSecrets, narrowEntries, SECRET_KEY } from '../src/settings/components/debug/inspect';

/**
 * The debug page prints the whole settings object and offers a Copy button, so
 * these tests are about one thing: nothing secret leaves the machine because
 * someone pasted a bug report.
 */

describe('maskSecrets', () => {
    const settings = {
        journalFolderPath: '15 Journal',
        syncEncryptionPassword: 'correct horse',
        syncDropboxTokens: { accessToken: 'abc', refreshToken: 'def', expiresAt: 123 },
        activeModuleIds: ['tasks', 'journal'],
    };

    it('masks a secret but keeps the field there', () => {
        const masked = maskSecrets(settings, '', false) as Record<string, unknown>;
        expect(masked.syncEncryptionPassword).toBe('•••');
        // The question someone usually has is whether it is SET at all, and a
        // deleted field answers that wrongly.
        expect('syncEncryptionPassword' in masked).toBe(true);
    });

    it('masks a token bag whole, not field by field', () => {
        // A bag is free to call its fields anything, so masking only the leaves
        // whose names we recognise would let `{ v: "..." }` straight through.
        const masked = maskSecrets(settings, '', false) as Record<string, unknown>;
        expect(masked.syncDropboxTokens).toBe('••• (object)');
    });

    it('checks the fields of objects inside a NON-secret array', () => {
        const masked = maskSecrets(
            { devices: [{ name: 'phone', accessToken: 'abc' }] },
            '',
            false
        ) as Record<string, unknown>;
        expect(masked.devices).toEqual([{ name: 'phone', accessToken: '•••' }]);
    });

    it('says how much a secret list held, so empty is not mistaken for set', () => {
        const masked = maskSecrets({ apiKeys: ['one', 'two'] }, '', false) as Record<
            string,
            unknown
        >;
        expect(masked.apiKeys).toBe('••• (2 items)');
    });

    it('leaves ordinary settings alone', () => {
        const masked = maskSecrets(settings, '', false) as Record<string, unknown>;
        expect(masked.journalFolderPath).toBe('15 Journal');
        expect(masked.activeModuleIds).toEqual(['tasks', 'journal']);
    });

    it('does not mask an empty or absent value', () => {
        // Masking these would claim a password is set when none is, which is
        // the exact thing someone opens this page to check.
        const masked = maskSecrets(
            { syncEncryptionPassword: '', syncDropboxTokens: null },
            '',
            false
        ) as Record<string, unknown>;
        expect(masked.syncEncryptionPassword).toBe('');
        expect(masked.syncDropboxTokens).toBeNull();
    });

    it('hands everything over when asked to reveal', () => {
        const shown = maskSecrets(settings, '', true);
        expect(shown).toEqual(settings);
    });

    it('recognises the names a secret actually goes by', () => {
        for (const key of [
            'password',
            'syncEncryptionPassword',
            'accessToken',
            'refreshToken',
            'clientSecret',
            'passphrase',
            'apiKey',
            'api_key',
            'credentials',
        ]) {
            expect(SECRET_KEY.test(key), key).toBe(true);
        }
        for (const key of ['journalFolderPath', 'accentColor', 'language', 'activeModuleIds']) {
            expect(SECRET_KEY.test(key), key).toBe(false);
        }
    });
});

describe('narrowEntries', () => {
    const source = { journalFolderPath: '15 Journal', accentColor: '#7c6cff', language: 'ru' };

    it('returns everything for an empty query', () => {
        expect(narrowEntries(source, '   ')).toEqual(source);
    });

    it('matches on the key', () => {
        expect(Object.keys(narrowEntries(source, 'folder'))).toEqual(['journalFolderPath']);
    });

    it('matches on the value, which is the question people arrive with', () => {
        expect(Object.keys(narrowEntries(source, '15 journal'))).toEqual(['journalFolderPath']);
    });

    it('is case-insensitive', () => {
        expect(Object.keys(narrowEntries(source, 'ACCENT'))).toEqual(['accentColor']);
    });

    it('returns nothing rather than everything when there is no match', () => {
        expect(narrowEntries(source, 'zzz')).toEqual({});
    });
});
