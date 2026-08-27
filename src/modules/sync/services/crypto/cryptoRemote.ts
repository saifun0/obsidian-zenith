import { fnv1a } from '../../../../core/hash';
import type { FileEntity } from '../../fileSyncTypes';
import type { ConnectionResult, RemoteKind, SyncRemote } from '../remotes/types';
import {
    decryptContent,
    decryptPath,
    encryptContent,
    encryptPath,
    keysForMarker,
    markerAccepts,
    MARKER_KEY,
    type CryptoMarker,
    newMarker,
    parseMarker,
    plainSize,
    serializeMarker,
    type VaultKeys,
} from './vaultCrypto';

/**
 * Any remote, with everything encrypted on the way out.
 *
 * A decorator rather than a flag threaded through each backend. The engine asks
 * for a path and gets a file; the backend is handed a different path and a
 * different file, and neither of them has to know. That is what keeps four
 * storage implementations free of crypto, and keeps the crypto in one place
 * where it can be read in full.
 *
 * ── Plaintext sizes, and why they matter here ──
 *
 * `list` reports what each file's size *will be* once decrypted, worked out
 * from the encrypted size. This is not cosmetic: `syncPlan` decides two copies
 * are the same file by comparing sizes, so reporting encrypted sizes would make
 * every file that turned up on both sides look like a conflict. The format is
 * shaped — fixed header, single tag — specifically so this subtraction is
 * exact.
 *
 * ── What the remote still learns ──
 *
 * Not the contents, and not the names. It does see how many files there are,
 * roughly how large each one is, when each was written, and the shape of the
 * folder tree. Hiding those needs padding and decoy traffic, which cost real
 * bandwidth and would make the plan's size comparison impossible; this stops
 * where Remotely Save and rclone stop, for the same reasons.
 */

/**
 * Derived keys, kept for the life of the session.
 *
 * Stretching the password costs the better part of a second by design, and
 * `FileSyncService` builds a fresh remote for every action — test, preview,
 * apply. Without this, each of them would pay it again.
 *
 * Keyed on the password and the salt together, so changing either derives
 * afresh rather than quietly reusing the old key.
 */
const KEY_CACHE = new Map<string, Promise<VaultKeys>>();

export class CryptoRemote implements SyncRemote {
    readonly kind: RemoteKind;
    readonly id: string;

    private keys: Promise<VaultKeys> | null = null;

    /**
     * A marker for a folder nobody has claimed yet, held back until there is
     * something to put in it.
     *
     * `plan()` promises to write nothing, and it calls `list`. Claiming the
     * folder there would leave a marker behind for someone who previewed a
     * first sync and decided against it — and then met "that is not the
     * password this folder was encrypted with" the day they corrected a typo in
     * a password they had never actually used. So the claim waits for the first
     * upload, which is the first moment it means anything.
     */
    private pendingMarker: CryptoMarker | null = null;
    private claiming: Promise<void> | null = null;

    constructor(
        private readonly inner: SyncRemote,
        private readonly password: string
    ) {
        this.kind = inner.kind;
        // The previous-sync record has to be invalidated by turning encryption
        // on, and by changing the password — after either, every file on the
        // remote sits at a path this device has never seen, and a record saying
        // otherwise would read as "the remote deleted everything". Folding the
        // password in makes the next run a reviewed first run instead.
        //
        // A weak hash of the password ends up in that record's filename. It is
        // acceptable only because the password itself already sits in the same
        // vault in `data.json` — so this tells nobody anything they could not
        // already read — and because the engine excludes both from sync, so
        // neither leaves the device.
        this.id = `${inner.id}-enc-${fnv1a(`${password}|${inner.id}`)}`;
    }

    async checkConnection(): Promise<ConnectionResult> {
        const reachable = await this.inner.checkConnection();
        if (!reachable.ok) return reachable;

        try {
            await this.ready();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: describe(err) };
        }
    }

    // ── Listing ──────────────────────────────────────

    async list(): Promise<FileEntity[]> {
        const keys = await this.ready();
        const out: FileEntity[] = [];

        for (const entity of await this.inner.list()) {
            if (entity.key === MARKER_KEY) continue;

            // Anything that does not decrypt is not ours: something another
            // tool left in the folder, or a stray file from a different
            // password. Skipping is right — the engine can only act on files it
            // can read, and one foreign file is not a reason to abandon a run.
            const key = await decryptPath(keys, entity.key);
            if (key === null) continue;

            const size = plainSize(entity.size);
            if (size === null) continue;

            out.push({ ...entity, key, size });
        }

        return out;
    }

    async stat(key: string): Promise<FileEntity | null> {
        const keys = await this.ready();
        const stored = await this.inner.stat(await encryptPath(keys, key));
        if (!stored) return null;

        const size = plainSize(stored.size);
        return size === null ? null : { ...stored, key, size };
    }

    // ── Transfer ─────────────────────────────────────

    async readBinary(key: string): Promise<ArrayBuffer> {
        const keys = await this.ready();
        const data = await this.inner.readBinary(await encryptPath(keys, key));
        return decryptContent(keys, key, data);
    }

    async write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity> {
        const keys = await this.ready();
        await this.claim();

        const stored = await this.inner.write(
            await encryptPath(keys, key),
            await encryptContent(keys, key, data),
            mtimeCli
        );

        // The caller is owed back the file it handed over, described in its own
        // terms: its path, and its size before encryption. What the server
        // stored is the server's business.
        return { ...stored, key, size: data.byteLength };
    }

    async remove(key: string): Promise<void> {
        const keys = await this.ready();
        await this.inner.remove(await encryptPath(keys, key));
    }

    // ── Setting up ───────────────────────────────────

    private async ready(): Promise<VaultKeys> {
        this.keys ??= this.establish();
        return this.keys;
    }

    /**
     * Agree with the remote on which password this folder uses.
     *
     * Three cases, and the third is the one worth the code: a folder that
     * already holds files but no marker was synced unencrypted, and turning
     * encryption on would upload a second, encrypted copy of the whole vault
     * beside the first while treating the originals as foreign. Refusing is the
     * only outcome that does not quietly double someone's storage and leave two
     * divergent vaults behind.
     */
    private async establish(): Promise<VaultKeys> {
        const existing = await this.readMarker();

        if (existing) {
            const keys = await derive(this.password, existing.salt, existing.iterations, () =>
                keysForMarker(this.password, existing)
            );
            if (!markerAccepts(existing, keys)) {
                throw new Error(
                    'That is not the password this remote folder was encrypted with. Correct the password, or point encrypted sync at an empty folder.'
                );
            }
            return keys;
        }

        const contents = await this.inner.list();
        if (contents.length > 0) {
            throw new Error(
                'This remote folder already holds unencrypted files. Encrypted sync needs a folder of its own — use an empty one, or move what is there aside first.'
            );
        }

        const { marker, keys } = await newMarker(this.password);
        this.pendingMarker = marker;
        return keys;
    }

    /**
     * Write the marker for a folder this device is claiming, once.
     *
     * Every upload waits on the same attempt, and they fail together if it
     * fails. Files landing in a folder whose salt never got stored would be
     * unreadable by anyone, this device included.
     */
    private claim(): Promise<void> {
        if (!this.pendingMarker) return Promise.resolve();

        this.claiming ??= (async () => {
            const marker = this.pendingMarker as CryptoMarker;
            await this.inner.write(MARKER_KEY, serializeMarker(marker), Date.now());
            this.pendingMarker = null;
        })();
        return this.claiming;
    }

    private async readMarker(): Promise<CryptoMarker | null> {
        // `stat` first: a marker that is absent and a marker we failed to fetch
        // must not look alike. Treating a network failure as "no marker yet"
        // leads straight to writing a second one with a fresh salt, which
        // orphans everything already in the folder.
        if (!(await this.inner.stat(MARKER_KEY))) return null;

        const marker = parseMarker(await this.inner.readBinary(MARKER_KEY));
        if (!marker) {
            // Present but unreadable. Saying so beats the alternative, which is
            // to treat the folder as unclaimed and then refuse it for holding
            // files — an error that names the wrong problem entirely.
            throw new Error(
                `"${MARKER_KEY}" on this remote is damaged, so the folder cannot be decrypted. Restore it from a backup, or start again in an empty folder.`
            );
        }
        return marker;
    }
}

/** Stretch the password once per salt per session. See `KEY_CACHE`. */
function derive(
    password: string,
    salt: string,
    iterations: number,
    build: () => Promise<VaultKeys>
): Promise<VaultKeys> {
    const cacheKey = `${salt}|${iterations}|${password}`;
    let pending = KEY_CACHE.get(cacheKey);
    if (!pending) {
        pending = build().catch((err) => {
            // A failed derivation must not be remembered as the answer, or
            // every later attempt this session returns the same failure.
            KEY_CACHE.delete(cacheKey);
            throw err;
        });
        KEY_CACHE.set(cacheKey, pending);
    }
    return pending;
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
