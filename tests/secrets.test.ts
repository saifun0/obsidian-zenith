import { describe, it, expect } from 'vitest';
import { SECRET_KEYS, SecretVault, type SecretBackend } from '../src/core/secrets';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import { isPlainHttpToInternet } from '../src/modules/sync/services/remotes/plainHttp';

/** Obsidian's secret storage, as a map. */
function memoryBackend() {
    const map = new Map<string, string>();
    const backend: SecretBackend = {
        getSecret: (id) => map.get(id) ?? null,
        setSecret: (id, secret) => void map.set(id, secret),
    };
    return { map, backend };
}

const TOKENS = { accessToken: 'a', refreshToken: 'r', expiresAt: 1 };

describe('credentials kept out of data.json', () => {
    it('leaves them out of what is written to disk, and keeps them in the store', () => {
        const { map, backend } = memoryBackend();
        const vault = new SecretVault(backend, 'scope1');

        const onDisk = vault.toDisk({
            ...DEFAULT_SETTINGS,
            syncRemotePassword: 'hunter2',
            syncDropboxTokens: TOKENS,
            tasksFolderPath: 'Tasks',
        });

        expect(onDisk.syncRemotePassword).toBe('');
        expect(onDisk.syncDropboxTokens).toBeNull();
        expect(onDisk.tasksFolderPath).toBe('Tasks');
        expect([...map.values()]).toContain('hunter2');
        expect(JSON.stringify(onDisk)).not.toContain('hunter2');
    });

    it('puts them back when the settings are read', () => {
        const { backend } = memoryBackend();
        new SecretVault(backend, 'scope1').toDisk({
            ...DEFAULT_SETTINGS,
            syncS3Secret: 's3cr3t',
            syncOnedriveTokens: TOKENS,
        });

        const { settings, migrated } = new SecretVault(backend, 'scope1').fromDisk({
            syncS3Secret: '',
            syncOnedriveTokens: null,
        });

        expect(settings.syncS3Secret).toBe('s3cr3t');
        expect(settings.syncOnedriveTokens).toEqual(TOKENS);
        expect(migrated).toBe(false);
    });

    it('moves a plain-text value it finds in the file, and says so', () => {
        const { map, backend } = memoryBackend();
        const { settings, migrated } = new SecretVault(backend, 'scope1').fromDisk({
            syncEncryptionPassword: 'from an older version',
        });

        expect(migrated).toBe(true);
        expect(settings.syncEncryptionPassword).toBe('from an older version');
        expect([...map.values()]).toContain('from an older version');
    });

    it('keeps two vaults on one device apart', () => {
        const { backend } = memoryBackend();
        new SecretVault(backend, 'vaulta').toDisk({ ...DEFAULT_SETTINGS, syncRemotePassword: 'a' });
        new SecretVault(backend, 'vaultb').toDisk({ ...DEFAULT_SETTINGS, syncRemotePassword: 'b' });

        expect(new SecretVault(backend, 'vaulta').fromDisk({}).settings.syncRemotePassword).toBe('a');
        expect(new SecretVault(backend, 'vaultb').fromDisk({}).settings.syncRemotePassword).toBe('b');
    });

    it('forgets a credential that was cleared', () => {
        const { backend } = memoryBackend();
        const vault = new SecretVault(backend, 'scope1');
        vault.toDisk({ ...DEFAULT_SETTINGS, syncRemotePassword: 'old' });
        vault.toDisk({ ...DEFAULT_SETTINGS, syncRemotePassword: '' });

        expect(new SecretVault(backend, 'scope1').fromDisk({}).settings.syncRemotePassword).toBeUndefined();
    });

    it('changes nothing on an Obsidian without secret storage', () => {
        const vault = new SecretVault(null, '');
        const settings = { ...DEFAULT_SETTINGS, syncRemotePassword: 'hunter2' };

        expect(vault.active).toBe(false);
        expect(vault.toDisk(settings)).toBe(settings);
        expect(vault.withoutSecrets({ syncRemotePassword: 'x' })).toEqual({ syncRemotePassword: 'x' });
    });

    it('takes every credential out of the per-device snapshot', () => {
        const vault = new SecretVault(memoryBackend().backend, 'scope1');
        const values = Object.fromEntries(SECRET_KEYS.map((k) => [k, 'x']));
        expect(vault.withoutSecrets({ ...values, uiDensity: 'compact' })).toEqual({ uiDensity: 'compact' });
    });
});

describe('plain http', () => {
    it('is flagged on the open internet', () => {
        expect(isPlainHttpToInternet('http://dav.example.com/remote.php')).toBe(true);
        expect(isPlainHttpToInternet('http://8.8.8.8:8080')).toBe(true);
    });

    it('is left alone at home and on this machine', () => {
        for (const url of [
            'http://localhost:8080',
            'http://127.0.0.1',
            'http://192.168.1.10/dav',
            'http://10.0.0.5',
            'http://172.20.0.2',
            'http://100.101.102.103',
            'http://nas.local',
            'http://nas',
            'http://[::1]:9000',
            'http://[fd00::1]',
        ]) {
            expect(isPlainHttpToInternet(url), url).toBe(false);
        }
    });

    it('is not https, and not a malformed address', () => {
        expect(isPlainHttpToInternet('https://dav.example.com')).toBe(false);
        expect(isPlainHttpToInternet('')).toBe(false);
        expect(isPlainHttpToInternet('not a url')).toBe(false);
    });
});
