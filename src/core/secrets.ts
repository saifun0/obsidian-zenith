import { requireApiVersion, type App } from 'obsidian';
import type { ZenithSettings } from '../store/settingsSlice';

/**
 * Credentials out of `data.json`, where Obsidian can keep them.
 *
 * Until Obsidian 1.11.4 a plugin had nowhere to put a password but its own
 * `data.json`, which sits in the vault: it rides along with every backup, every
 * git commit of the vault and every sync of the plugin folder, in plain text.
 * Since then the app has `secretStorage`, held on the device and outside the
 * vault, and these settings go there whenever it exists. On an older Obsidian
 * nothing changes.
 *
 * The rest of the plugin does not know. The store holds the real values as
 * before; only what is written to disk is stripped (`toDisk`), and only what is
 * read from it is filled back in (`fromDisk`). A file that still has a value in
 * it — written before this, or by a device on an older Obsidian — wins, and the
 * value moves into the secret store on the way in, so `data.json` loses its
 * plain-text copy at the next save.
 */

/** Settings that are credentials. Everything else stays in `data.json`. */
export const SECRET_KEYS = [
    'syncRemotePassword',
    'syncS3Secret',
    'syncEncryptionPassword',
    'syncDropboxTokens',
    'syncOnedriveTokens',
] as const satisfies ReadonlyArray<keyof ZenithSettings>;

export type SecretKey = (typeof SECRET_KEYS)[number];

/** What a secret store needs to offer — Obsidian's `SecretStorage`, or a test's. */
export interface SecretBackend {
    getSecret(id: string): string | null;
    setSecret(id: string, secret: string): void;
}

/** Obsidian's secret storage, or null on a version that has none. */
export function secretBackend(app: App): SecretBackend | null {
    if (requireApiVersion('1.11.4')) {
        const storage = app.secretStorage;
        return {
            getSecret: (id) => storage.getSecret(id),
            setSecret: (id, secret) => storage.setSecret(id, secret),
        };
    }
    return null;
}

/** Where this vault's secrets are kept apart from another vault's on the same device. */
const SCOPE_KEY = 'zenith-secret-scope';

/**
 * A short random name for this vault, made once and kept in the vault's own
 * local storage. The secret store belongs to the app, not to a vault, and two
 * vaults are not to share a password — not even two both called "Notes".
 */
export function vaultSecretScope(app: App): string {
    const saved: unknown = app.loadLocalStorage(SCOPE_KEY);
    if (typeof saved === 'string' && /^[a-z0-9]{8,32}$/.test(saved)) return saved;
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const scope = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    app.saveLocalStorage(SCOPE_KEY, scope);
    return scope;
}

/** A value that means "not set": nothing to keep, and nothing to look up. */
function isBlank(value: unknown): boolean {
    return value === null || value === undefined || value === '';
}

const BLANK: Pick<ZenithSettings, SecretKey> = {
    syncRemotePassword: '',
    syncS3Secret: '',
    syncEncryptionPassword: '',
    syncDropboxTokens: null,
    syncOnedriveTokens: null,
};

/** Store id for one setting: lower-case letters, digits and dashes, as Obsidian asks. */
function idFor(scope: string, key: SecretKey): string {
    return `zenith-${scope}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function encode(value: unknown): string {
    if (isBlank(value)) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function decode(key: SecretKey, text: string | null): unknown {
    if (!text) return BLANK[key];
    if (key === 'syncDropboxTokens' || key === 'syncOnedriveTokens') {
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return null;
        }
    }
    return text;
}

export class SecretVault {
    /** What the store holds now, encoded, so an unchanged value is not written again. */
    private readonly known = new Map<SecretKey, string>();

    constructor(
        private readonly backend: SecretBackend | null,
        private readonly scope: string
    ) {}

    /** Whether credentials are being kept out of `data.json` on this device. */
    get active(): boolean {
        return this.backend !== null;
    }

    /**
     * Settings as read from disk, with the credentials put back.
     *
     * Also returns whether any were found in the file: those have just moved
     * into the secret store, and the file should be written again without them.
     */
    fromDisk(saved: Partial<ZenithSettings> | undefined): {
        settings: Partial<ZenithSettings>;
        migrated: boolean;
    } {
        const settings: Record<string, unknown> = { ...(saved ?? {}) };
        if (!this.backend) return { settings, migrated: false };

        let migrated = false;
        for (const key of SECRET_KEYS) {
            const inFile = settings[key];
            if (!isBlank(inFile)) {
                this.write(key, inFile);
                migrated = true;
                continue;
            }
            const stored = this.read(key);
            if (stored !== null) settings[key] = decode(key, stored);
        }
        return { settings, migrated };
    }

    /** Settings as they should be written to disk: credentials kept, then left out. */
    toDisk(settings: ZenithSettings): ZenithSettings {
        if (!this.backend) return settings;
        const out = { ...settings };
        for (const key of SECRET_KEYS) {
            this.write(key, settings[key]);
            Object.assign(out, { [key]: BLANK[key] });
        }
        return out;
    }

    /** Leave the credentials out of a set of values bound for a file in the vault. */
    withoutSecrets<T extends Record<string, unknown>>(values: T): T {
        if (!this.backend) return values;
        const out: Record<string, unknown> = { ...values };
        for (const key of SECRET_KEYS) delete out[key];
        return out as T;
    }

    private read(key: SecretKey): string | null {
        try {
            const text = this.backend?.getSecret(idFor(this.scope, key)) ?? null;
            this.known.set(key, text ?? '');
            return text ? text : null;
        } catch {
            return null;
        }
    }

    private write(key: SecretKey, value: unknown): void {
        const text = encode(value);
        if (this.known.get(key) === text) return;
        try {
            // An empty value is how a secret is forgotten: the store has no delete.
            this.backend?.setSecret(idFor(this.scope, key), text);
            this.known.set(key, text);
        } catch (err) {
            console.error(`Zenith: could not keep ${key} in Obsidian's secret storage`, err);
        }
    }
}
