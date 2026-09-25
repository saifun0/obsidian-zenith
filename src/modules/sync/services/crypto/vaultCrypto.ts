import { base32Decode, base32Encode } from './base32';

/**
 * End-to-end encryption for everything that leaves the device.
 *
 * The remote holds ciphertext and encrypted filenames; the password never does.
 * Nobody who can read the storage account — the provider, anyone with the
 * tokens, anyone who finds a shared link — learns a note's contents or even
 * what the notes are called.
 *
 * ── The shape, and why each part is the way it is ──
 *
 * **One derivation per remote, not one per file.** The password is stretched
 * once with PBKDF2 against a salt kept in a marker file on the remote, and the
 * result is split into purpose-specific subkeys with HKDF. Deriving per file —
 * which is what an `openssl enc`-compatible format forces, since the salt rides
 * in each file — means paying the stretching cost thousands of times in both
 * directions, and it is the reason encrypted sync in other plugins is slow. The
 * cost belongs on the password, once.
 *
 * **Authenticated, not just encrypted.** AES-GCM refuses to return plaintext
 * for bytes that were altered. The alternative — CBC, unauthenticated — turns a
 * truncated download or a flipped bit into a note full of rubbish that syncs
 * back out and overwrites the good copy. A note that fails to decrypt loudly is
 * a bad day; one that decrypts into garbage is a lost note.
 *
 * **Filenames are encrypted deterministically.** The same path has to produce
 * the same remote name on every device, forever, or the second device uploads a
 * duplicate of everything. So the nonce for a name is not random: it is a MAC
 * of the path, which makes the encryption a function of its input while still
 * differing for every distinct path. Contents get a random nonce, because
 * nothing requires two uploads of the same file to look alike, and randomness
 * is strictly better when you can afford it.
 *
 * **Every ciphertext is bound to where it lives.** The file's own path is
 * passed as additional authenticated data, and a name's parent folder is passed
 * with it. Moving a blob to another path on the server does not silently
 * produce a valid file somewhere else; it produces a decryption failure.
 */

// ── Format constants ─────────────────────────────────

/** `ZNC1`. Present so a file that is not ours is recognised before it is tried. */
const MAGIC = [0x5a, 0x4e, 0x43, 0x31];

const VERSION = 1;
/** The only algorithm this version defines. The byte exists so a later one can. */
const ALG_AES_256_GCM = 1;

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** magic(4) + version(1) + algorithm(1) + nonce(12) */
export const CONTENT_HEADER_BYTES = 4 + 1 + 1 + NONCE_BYTES;
/** What a file gains by being encrypted. Fixed, which is the point — see `plainSize`. */
export const CONTENT_OVERHEAD = CONTENT_HEADER_BYTES + TAG_BYTES;

export const SALT_BYTES = 16;

/**
 * PBKDF2 rounds for a new remote.
 *
 * OWASP's current floor for PBKDF2-HMAC-SHA256. It costs something under a
 * second on a phone, and it is paid once per session rather than once per file,
 * which is what makes a number this size affordable at all. Stored in the
 * marker rather than assumed, so raising it later does not lock anyone out of a
 * vault encrypted today.
 */
export const DEFAULT_ITERATIONS = 600_000;

/**
 * Where the salt lives on the remote.
 *
 * Deliberately readable, deliberately not secret: a salt is not a secret, and
 * a user looking at the folder should be able to tell that it is encrypted
 * rather than corrupt. The leading dot keeps it out of the way.
 */
export const MARKER_KEY = '.zenith-crypt.json';

// ── Keys ─────────────────────────────────────────────

export interface VaultKeys {
    /** AES-GCM, for file contents. */
    content: CryptoKey;
    /** AES-GCM, for one path segment at a time. */
    name: CryptoKey;
    /** HMAC-SHA256, the source of a name's deterministic nonce. */
    nameNonce: CryptoKey;
    /**
     * Proof that a password matches the one this remote was set up with.
     *
     * Derived like the others, and therefore useless for decrypting anything —
     * which is what makes it safe to leave lying in a plaintext marker file.
     */
    check: Bytes;
}

export interface CryptoMarker {
    version: number;
    iterations: number;
    /** base64. */
    salt: string;
    /** base64 of `VaultKeys.check`. */
    check: string;
}

/**
 * A byte array Web Crypto will take.
 *
 * TypeScript distinguishes a `Uint8Array` over an `ArrayBuffer` from one over a
 * `SharedArrayBuffer`, and the crypto signatures accept only the former —
 * sharing memory with another thread while it is being encrypted is exactly the
 * hazard that distinction exists to prevent. Naming it once is tidier than
 * casting at a dozen call sites.
 */
type Bytes = Uint8Array<ArrayBuffer>;

function subtle(): SubtleCrypto {
    const api = crypto?.subtle;
    if (!api) {
        throw new Error('This device has no Web Crypto, so encrypted sync cannot run here.');
    }
    return api;
}

export function randomBytes(length: number): Bytes {
    const out = new Uint8Array(length);
    const api = crypto;
    if (!api?.getRandomValues) {
        // Refused rather than filled with `Math.random`. A weak nonce here is
        // not a degraded feature, it is a broken one, and quietly producing
        // ciphertext nobody can rely on is worse than not producing any.
        throw new Error('This device has no secure random source, so encrypted sync cannot run here.');
    }
    api.getRandomValues(out);
    return out;
}

/**
 * Stretch the password, then split the result into subkeys.
 *
 * The split matters: one key used for contents, names and the password check
 * alike would mean a name and a file could be confused for one another, and the
 * check value would be the encryption key sitting in a plaintext file. HKDF
 * with a distinct label per purpose costs nothing and keeps them unrelated.
 */
export async function deriveKeys(
    password: string,
    salt: Bytes,
    iterations: number
): Promise<VaultKeys> {
    const api = subtle();
    const material = await api.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
    const root = await api.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        256
    );

    const hkdf = await api.importKey('raw', root, 'HKDF', false, ['deriveBits']);
    const branch = async (label: string): Promise<ArrayBuffer> =>
        api.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(label) },
            hkdf,
            256
        );

    const [content, name, nonce, check] = await Promise.all([
        branch('zenith/sync/content/v1'),
        branch('zenith/sync/name/v1'),
        branch('zenith/sync/name-nonce/v1'),
        branch('zenith/sync/check/v1'),
    ]);

    return {
        content: await api.importKey('raw', content, 'AES-GCM', false, ['encrypt', 'decrypt']),
        name: await api.importKey('raw', name, 'AES-GCM', false, ['encrypt', 'decrypt']),
        nameNonce: await api.importKey('raw', nonce, { name: 'HMAC', hash: 'SHA-256' }, false, [
            'sign',
        ]),
        check: new Uint8Array(check),
    };
}

// ── File contents ────────────────────────────────────

/**
 * Encrypt one file.
 *
 * `key` — the file's own path, relative to the sync root — is authenticated but
 * not encrypted here: it is bound into the ciphertext so that the same bytes
 * moved to a different path on the server stop decrypting. The path itself is
 * hidden separately, by `encryptPath`.
 */
export async function encryptContent(
    keys: VaultKeys,
    key: string,
    data: ArrayBuffer
): Promise<ArrayBuffer> {
    const nonce = randomBytes(NONCE_BYTES);
    const body = await subtle().encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: utf8(key) },
        keys.content,
        data
    );

    const out = new Uint8Array(CONTENT_HEADER_BYTES + body.byteLength);
    out.set(MAGIC, 0);
    out[4] = VERSION;
    out[5] = ALG_AES_256_GCM;
    out.set(nonce, 6);
    out.set(new Uint8Array(body), CONTENT_HEADER_BYTES);
    return out.buffer;
}

export async function decryptContent(
    keys: VaultKeys,
    key: string,
    data: ArrayBuffer
): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(data);
    if (bytes.length < CONTENT_OVERHEAD) {
        throw new Error(`"${key}" is too short to be an encrypted file.`);
    }
    if (!MAGIC.every((byte, i) => bytes[i] === byte)) {
        throw new Error(
            `"${key}" on the remote is not encrypted. Point encrypted sync at an empty folder, or turn encryption off.`
        );
    }
    if (bytes[4] !== VERSION || bytes[5] !== ALG_AES_256_GCM) {
        throw new Error(
            `"${key}" was written by a newer version of Zenith than this one can read.`
        );
    }

    const nonce = bytes.subarray(6, CONTENT_HEADER_BYTES);
    try {
        return await subtle().decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: utf8(key) },
            keys.content,
            bytes.subarray(CONTENT_HEADER_BYTES)
        );
    } catch {
        // Web Crypto gives no detail here on purpose, and neither can we: a
        // wrong password, a corrupted download and a tampered file are the same
        // failure to it. Saying so plainly beats guessing.
        throw new Error(
            `"${key}" could not be decrypted — the password may be wrong, or the file may be damaged.`
        );
    }
}

/**
 * The size of the file inside, worked out from the size of the file outside.
 *
 * This exists because the sync plan compares a local file's size against the
 * remote's, and gets it wrong in the direction of "these are different" if the
 * remote reports its encrypted size. Working it out arithmetically means the
 * comparison stays exact and no extra download is needed to make it so — which
 * is the practical reason this format has a fixed-size header and one tag
 * rather than a chunked layout with a variable number of them.
 *
 * Null when the object is too small to be one of ours.
 */
export function plainSize(cipherSize: number): number | null {
    const size = cipherSize - CONTENT_OVERHEAD;
    return size < 0 ? null : size;
}

// ── Paths ────────────────────────────────────────────

/**
 * Encrypt a path, one segment at a time.
 *
 * Per segment rather than whole, so the folder tree still exists on the remote.
 * That keeps every backend working the way it already does — WebDAV creating
 * parents, Dropbox listing recursively, S3 prefixes — and keeps individual
 * names short enough to stay under the length limits a flattened path would
 * blow through on a deep vault.
 *
 * The nonce for each segment is a MAC over the whole path down to it, and it is
 * stored in front of the ciphertext because decryption needs it and cannot
 * recompute it — the plaintext path is exactly what is not known yet. Deriving
 * it from the full path rather than the segment alone means the same folder
 * name in two different places does not produce the same encrypted name, so the
 * shape of the tree leaks a little less.
 */
export async function encryptPath(keys: VaultKeys, path: string): Promise<string> {
    const out: string[] = [];
    let parent = '';

    for (const segment of path.split('/').filter(Boolean)) {
        const full = parent ? `${parent}/${segment}` : segment;
        const nonce = await nonceFor(keys, full);
        const body = await subtle().encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: utf8(parent) },
            keys.name,
            utf8(segment)
        );

        const packed = new Uint8Array(nonce.length + body.byteLength);
        packed.set(nonce, 0);
        packed.set(new Uint8Array(body), nonce.length);
        out.push(base32Encode(packed));
        parent = full;
    }

    return out.join('/');
}

/**
 * Turn a remote path back into a vault path, or null when it is not one of ours.
 *
 * Null rather than throwing: a listing may legitimately contain the marker
 * file, something another tool left behind, or a folder the user made by hand.
 * Those are not errors, they are simply not ours, and the caller skips them.
 */
export async function decryptPath(keys: VaultKeys, encrypted: string): Promise<string | null> {
    const out: string[] = [];
    let parent = '';

    for (const segment of encrypted.split('/').filter(Boolean)) {
        const packed = base32Decode(segment);
        if (!packed || packed.length < NONCE_BYTES + TAG_BYTES) return null;

        const nonce = packed.subarray(0, NONCE_BYTES);
        try {
            const plain = await subtle().decrypt(
                { name: 'AES-GCM', iv: nonce, additionalData: utf8(parent) },
                keys.name,
                packed.subarray(NONCE_BYTES)
            );
            const text = new TextDecoder().decode(plain);
            out.push(text);
            parent = parent ? `${parent}/${text}` : text;
        } catch {
            return null;
        }
    }

    return out.length > 0 ? out.join('/') : null;
}

async function nonceFor(keys: VaultKeys, path: string): Promise<Bytes> {
    const mac = await subtle().sign('HMAC', keys.nameNonce, utf8(path));
    return new Uint8Array(mac).subarray(0, NONCE_BYTES);
}

// ── The marker file ──────────────────────────────────

/**
 * Build the marker a fresh remote gets.
 *
 * Its real job is not storing the salt — that is incidental. It is telling a
 * device with the wrong password so, before it uploads anything. Without a
 * check value, a typo produces a second, silently undecryptable copy of the
 * vault sitting alongside the first, and the user finds out weeks later. With
 * one, the run stops on the first request.
 */
export async function newMarker(
    password: string,
    iterations = DEFAULT_ITERATIONS
): Promise<{ marker: CryptoMarker; keys: VaultKeys }> {
    const salt = randomBytes(SALT_BYTES);
    const keys = await deriveKeys(password, salt, iterations);
    return {
        marker: {
            version: VERSION,
            iterations,
            salt: toBase64(salt),
            check: toBase64(keys.check),
        },
        keys,
    };
}

export function serializeMarker(marker: CryptoMarker): ArrayBuffer {
    // Pretty-printed and labelled, because the one person who will ever read it
    // is someone wondering what this file is doing in their Dropbox.
    const body = {
        _: 'Zenith encrypted sync. The notes here are encrypted; this file is not, and holds no secret — only the salt and a check value. Deleting it makes the folder unreadable.',
        ...marker,
    };
    return utf8(JSON.stringify(body, null, 2)).buffer;
}

export function parseMarker(data: ArrayBuffer): CryptoMarker | null {
    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder().decode(data));
    } catch {
        return null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const body = raw as Record<string, unknown>;

    const salt = typeof body.salt === 'string' ? body.salt : '';
    const check = typeof body.check === 'string' ? body.check : '';
    const iterations = typeof body.iterations === 'number' ? body.iterations : 0;
    const version = typeof body.version === 'number' ? body.version : 0;
    if (!salt || !check || iterations <= 0) return null;

    return { version, iterations, salt, check };
}

/**
 * Does this password open this remote?
 *
 * Compared in constant time. The value being compared is not a secret and the
 * attack is not a practical one, but a timing-variable comparison on a
 * credential check is the kind of thing that gets copied into somewhere it does
 * matter.
 */
export function markerAccepts(marker: CryptoMarker, keys: VaultKeys): boolean {
    const expected = fromBase64(marker.check);
    if (!expected || expected.length !== keys.check.length) return false;

    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ keys.check[i];
    return diff === 0;
}

/** Derive the keys a marker describes. Throws if the marker is unusable. */
export async function keysForMarker(password: string, marker: CryptoMarker): Promise<VaultKeys> {
    const salt = fromBase64(marker.salt);
    if (!salt || salt.length === 0) {
        throw new Error('The encryption marker on this remote is damaged — its salt is unreadable.');
    }
    if (marker.version > VERSION) {
        throw new Error(
            'This remote was encrypted by a newer version of Zenith. Update before syncing with it.'
        );
    }
    return deriveKeys(password, salt, marker.iterations);
}

// ── Encoding helpers ─────────────────────────────────

function utf8(text: string): Bytes {
    return new TextEncoder().encode(text);
}

export function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function fromBase64(text: string): Bytes | null {
    try {
        const binary = atob(text);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}
