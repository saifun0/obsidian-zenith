import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import { syncSettingsSchema } from '../src/modules/sync/settings.schema';
import { flattenFields } from '../src/settings/schema/helpers';
import { isValueField, type SettingsBag } from '../src/settings/schema/types';

/**
 * Which sync fields a given backend actually shows.
 *
 * Worth its own file because the rule is easy to write backwards. The WebDAV
 * fields were once shown for "anything that is not S3", so choosing Dropbox
 * drew a server address, a username and a password on top of the Dropbox app
 * key — four inputs that do nothing, two of which look like the credentials the
 * user is supposed to fill in.
 */

const WEBDAV = ['syncRemoteUrl', 'syncRemoteUser', 'syncRemotePassword', 'syncRemoteDir'];
const S3 = [
    'syncS3Endpoint',
    'syncS3Bucket',
    'syncS3Region',
    'syncS3AccessKey',
    'syncS3Secret',
    'syncS3Prefix',
    'syncS3PathStyle',
];

function visible(values: Partial<SettingsBag>): string[] {
    const bag = { ...DEFAULT_SETTINGS, syncFilesEnabled: true, ...values } as SettingsBag;
    return flattenFields(syncSettingsSchema)
        .filter((field) => !field.showIf || field.showIf(bag))
        .map((field) => field.key);
}

describe('sync settings show only what the chosen backend needs', () => {
    it('WebDAV asks for an address, an account and a folder', () => {
        const keys = visible({ syncRemoteKind: 'webdav' });
        expect(keys).toEqual(expect.arrayContaining(WEBDAV));
        for (const key of [...S3, 'syncDropboxClientId', 'syncOnedriveClientId', 'syncOauthFolder']) {
            expect(keys).not.toContain(key);
        }
    });

    it('S3 asks for a bucket and keys', () => {
        const keys = visible({ syncRemoteKind: 's3' });
        expect(keys).toEqual(expect.arrayContaining(S3));
        for (const key of [...WEBDAV, 'syncDropboxClientId', 'syncOauthFolder']) {
            expect(keys).not.toContain(key);
        }
    });

    it('Dropbox asks for an app key and a folder, and nothing WebDAV wanted', () => {
        const keys = visible({ syncRemoteKind: 'dropbox' });
        expect(keys).toEqual(expect.arrayContaining(['syncDropboxClientId', 'syncOauthFolder']));
        for (const key of [...WEBDAV, ...S3, 'syncOnedriveClientId']) {
            expect(keys).not.toContain(key);
        }
    });

    it('OneDrive likewise', () => {
        const keys = visible({ syncRemoteKind: 'onedrive' });
        expect(keys).toEqual(expect.arrayContaining(['syncOnedriveClientId', 'syncOauthFolder']));
        for (const key of [...WEBDAV, ...S3, 'syncDropboxClientId']) {
            expect(keys).not.toContain(key);
        }
    });

    it('shows nothing but the switch until file sync is turned on', () => {
        const bag = { ...DEFAULT_SETTINGS, syncFilesEnabled: false } as SettingsBag;
        const keys = flattenFields(syncSettingsSchema)
            .filter((field) => !field.showIf || field.showIf(bag))
            .map((field) => field.key);

        expect(keys).toContain('syncFilesEnabled');
        for (const key of [...WEBDAV, ...S3, 'syncRemoteKind', 'syncEncryptionEnabled']) {
            expect(keys).not.toContain(key);
        }
    });

    it('asks for the encryption password only once encryption is on', () => {
        expect(visible({ syncEncryptionEnabled: false })).not.toContain('syncEncryptionPassword');
        expect(visible({ syncEncryptionEnabled: true })).toContain('syncEncryptionPassword');
    });
});

describe('sync settings treat credentials as credentials', () => {
    const field = (key: string) =>
        flattenFields(syncSettingsSchema).find((f) => f.key === key) ?? null;

    it('masks every password, and only the passwords', () => {
        const masked = flattenFields(syncSettingsSchema)
            .filter((f) => isValueField(f) && f.type === 'text' && f.secret === true)
            .map((f) => f.key)
            .sort();

        expect(masked).toEqual(['syncEncryptionPassword', 'syncRemotePassword', 'syncS3Secret']);
    });

    it('says so when encryption is on with no password', () => {
        const password = field('syncEncryptionPassword');
        if (!password || !isValueField(password) || !password.validate) {
            throw new Error('the encryption password should be a validated value field');
        }
        const validate = password.validate;

        expect(validate('', { syncEncryptionEnabled: true })).toBe(
            'sync.settings.encryptPassword.required'
        );
        // Whitespace is not a password either.
        expect(validate('   ', { syncEncryptionEnabled: true })).toBeTruthy();
        expect(validate('hunter2', { syncEncryptionEnabled: true })).toBeNull();
        // Nothing to complain about while encryption is off.
        expect(validate('', { syncEncryptionEnabled: false })).toBeNull();
    });
});
