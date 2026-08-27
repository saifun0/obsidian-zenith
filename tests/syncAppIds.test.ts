import { describe, it, expect } from 'vitest';
import { DICTS } from '../src/core/i18n';
import {
    effectiveClientId,
    HAS_SHIPPED_DROPBOX,
    HAS_SHIPPED_ONEDRIVE,
    SHIPPED_DROPBOX_CLIENT_ID,
    SHIPPED_ONEDRIVE_CLIENT_ID,
} from '../src/modules/sync/services/remotes/appIds';

/**
 * Which app registration a device authorizes against.
 *
 * The rule is one line, and getting it backwards is the difference between "the
 * user's own app key is quietly ignored" and "nobody can connect at all". Both
 * failures look like a provider problem from the outside.
 */

describe('choosing an app registration', () => {
    it("prefers the user's own", () => {
        expect(effectiveClientId('mine', 'ours')).toBe('mine');
    });

    it('falls back to the one in the build when the field is empty', () => {
        expect(effectiveClientId('', 'ours')).toBe('ours');
    });

    it('treats a field of whitespace as empty', () => {
        // Selecting the contents and hitting space is how a field gets cleared.
        // Authorizing against a client id made of spaces fails with the
        // provider's own wording, which explains nothing.
        expect(effectiveClientId('   ', 'ours')).toBe('ours');
        expect(effectiveClientId('\t\n', 'ours')).toBe('ours');
    });

    it('trims what it does use', () => {
        expect(effectiveClientId('  mine  ', 'ours')).toBe('mine');
    });

    it('is empty when neither exists, so the panel can say so', () => {
        expect(effectiveClientId('', '')).toBe('');
    });
});

describe('the settings copy matches what the build actually carries', () => {
    it('agrees with itself about whether a registration ships', () => {
        expect(HAS_SHIPPED_DROPBOX).toBe(SHIPPED_DROPBOX_CLIENT_ID !== '');
        expect(HAS_SHIPPED_ONEDRIVE).toBe(SHIPPED_ONEDRIVE_CLIENT_ID !== '');
    });

    it('has both readings of every field translated, whichever ships', () => {
        // Only one wording is referenced by the schema at a time, so the usual
        // "every key the schema names is translated" check can never see the
        // other one — and it is the one that appears the day an app key is
        // filled in.
        for (const key of [
            'sync.settings.dropboxClientId.desc',
            'sync.settings.dropboxClientId.optional',
            'sync.settings.onedriveClientId.desc',
            'sync.settings.onedriveClientId.optional',
            'sync.settings.ownApp.note',
            'sync.settings.ownApp.optional',
        ]) {
            expect(DICTS.en[key], `missing English: ${key}`).toBeTruthy();
            expect(DICTS.ru[key], `missing Russian: ${key}`).toBeTruthy();
        }
    });

    it('never tells someone to leave a required field empty', () => {
        // The optional wording offers a fallback. Showing it with nothing to
        // fall back to is an instruction that does not work.
        expect(DICTS.en['sync.settings.dropboxClientId.optional']).toMatch(/Leave empty/);
        expect(DICTS.en['sync.settings.dropboxClientId.desc']).not.toMatch(/Leave empty/);
    });
});
