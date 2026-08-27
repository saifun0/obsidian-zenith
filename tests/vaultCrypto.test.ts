import { beforeAll, describe, it, expect } from 'vitest';
import { base32Decode, base32Encode } from '../src/modules/sync/services/crypto/base32';
import {
    CONTENT_OVERHEAD,
    decryptContent,
    decryptPath,
    deriveKeys,
    encryptContent,
    encryptPath,
    keysForMarker,
    markerAccepts,
    newMarker,
    parseMarker,
    plainSize,
    serializeMarker,
    type VaultKeys,
} from '../src/modules/sync/services/crypto/vaultCrypto';

/**
 * A deliberately weak stretching count.
 *
 * The real one is six hundred thousand rounds, which is the point of it — and
 * which would make this file take minutes. Nothing here tests the cost.
 */
const ROUNDS = 1000;

const SALT = new Uint8Array(16).fill(7);

const keysFor = (password: string, salt = SALT) => deriveKeys(password, salt, ROUNDS);

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (data: ArrayBuffer) => new TextDecoder().decode(data);

describe('base32', () => {
    it('round-trips', () => {
        for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 32, 33]) {
            const input = new Uint8Array(length).map((_, i) => (i * 37 + 11) & 0xff);
            const decoded = base32Decode(base32Encode(input));
            expect(Array.from(decoded ?? [])).toEqual(Array.from(input));
        }
    });

    it('emits only characters a path can carry, in one case', () => {
        const encoded = base32Encode(new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]));
        // One case is the whole reason base32 is here: Dropbox compares paths
        // case-insensitively, so two names differing only in case would collide.
        expect(encoded).toMatch(/^[a-z2-7]+$/);
    });

    it('accepts upper case on the way in, in case a server changed it', () => {
        const input = new Uint8Array([9, 8, 7, 6, 5]);
        const encoded = base32Encode(input);
        expect(Array.from(base32Decode(encoded.toUpperCase()) ?? [])).toEqual(Array.from(input));
    });

    it('refuses anything that is not base32', () => {
        expect(base32Decode('not!base32')).toBeNull();
        expect(base32Decode('abc019')).toBeNull();
    });

    it('refuses a name with a whole symbol left dangling', () => {
        // Five bytes encode to exactly eight symbols. A ninth carries five bits
        // that no byte can be built from, so the name was cut or padded wrong.
        const whole = base32Encode(new Uint8Array([1, 2, 3, 4, 5]));
        expect(whole).toHaveLength(8);
        expect(base32Decode(`${whole}a`)).toBeNull();
    });

    it('refuses a name whose padding bits are not the zeroes an encoder writes', () => {
        // One byte is two symbols, the second carrying three real bits and two
        // of padding. Setting those to ones is something no encoder produces.
        expect(base32Encode(new Uint8Array([255]))).toBe('74');
        expect(base32Decode('77')).toBeNull();
    });
});

describe('file contents', () => {
    let keys: VaultKeys;
    beforeAll(async () => {
        keys = await keysFor('correct horse');
    });

    it('round-trips', async () => {
        const sealed = await encryptContent(keys, 'notes/today.md', bytes('# Monday'));
        expect(text(await decryptContent(keys, 'notes/today.md', sealed))).toBe('# Monday');
    });

    it('round-trips an empty file, and arbitrary bytes', async () => {
        const empty = await encryptContent(keys, 'a.md', new ArrayBuffer(0));
        expect((await decryptContent(keys, 'a.md', empty)).byteLength).toBe(0);

        const blob = new Uint8Array(1024).map((_, i) => (i * 91) & 0xff);
        const sealed = await encryptContent(keys, 'x.bin', blob.buffer as ArrayBuffer);
        const back = new Uint8Array(await decryptContent(keys, 'x.bin', sealed));
        expect(Array.from(back)).toEqual(Array.from(blob));
    });

    it('does not leave the plaintext lying in the output', async () => {
        const sealed = await encryptContent(keys, 'a.md', bytes('the secret words'));
        expect(text(sealed)).not.toContain('secret');
    });

    it('produces different bytes each time, for the same input', async () => {
        // Contents get a random nonce. Nothing needs two uploads to look alike,
        // and identical ciphertext would tell the server the file was unchanged.
        const a = await encryptContent(keys, 'a.md', bytes('same'));
        const b = await encryptContent(keys, 'a.md', bytes('same'));
        expect(new Uint8Array(a)).not.toEqual(new Uint8Array(b));
    });

    it('costs a fixed number of bytes, which is what makes the size exact', async () => {
        for (const size of [0, 1, 100, 5000]) {
            const sealed = await encryptContent(keys, 'a.md', new ArrayBuffer(size));
            expect(sealed.byteLength).toBe(size + CONTENT_OVERHEAD);
            // The sync plan compares a local size against the remote's, so this
            // subtraction has to land exactly or every file reads as a conflict.
            expect(plainSize(sealed.byteLength)).toBe(size);
        }
    });

    it('has no size to report for something too small to be ours', () => {
        expect(plainSize(0)).toBeNull();
        expect(plainSize(CONTENT_OVERHEAD - 1)).toBeNull();
    });

    it('refuses the wrong password rather than returning rubbish', async () => {
        const sealed = await encryptContent(keys, 'a.md', bytes('hello'));
        const other = await keysFor('wrong horse');
        await expect(decryptContent(other, 'a.md', sealed)).rejects.toThrow(/could not be decrypted/);
    });

    it('notices a single altered byte', async () => {
        const sealed = new Uint8Array(await encryptContent(keys, 'a.md', bytes('hello')));
        sealed[sealed.length - 1] ^= 1;
        await expect(decryptContent(keys, 'a.md', sealed.buffer as ArrayBuffer)).rejects.toThrow();
    });

    it('refuses a file that was moved to another path on the server', async () => {
        // The path is authenticated, so the same bytes filed elsewhere are not
        // a valid file elsewhere.
        const sealed = await encryptContent(keys, 'notes/a.md', bytes('hello'));
        await expect(decryptContent(keys, 'notes/b.md', sealed)).rejects.toThrow();
    });

    it('says so plainly when the file was never encrypted at all', async () => {
        await expect(
            decryptContent(keys, 'a.md', bytes('# just a note, sitting there in the open'))
        ).rejects.toThrow(/not encrypted/);
    });
});

describe('paths', () => {
    let keys: VaultKeys;
    beforeAll(async () => {
        keys = await keysFor('correct horse');
    });

    it('round-trips', async () => {
        for (const path of ['a.md', 'notes/a.md', 'a/b/c/deep note.md', 'x.y.z']) {
            const sealed = await encryptPath(keys, path);
            expect(await decryptPath(keys, sealed)).toBe(path);
        }
    });

    it('round-trips names a Latin-1 header could not carry', async () => {
        const path = 'Заметки/встреча 🎉.md';
        expect(await decryptPath(keys, await encryptPath(keys, path))).toBe(path);
    });

    it('gives the same answer every time, which is what lets two devices agree', async () => {
        // The nonce is a MAC of the path rather than random, precisely so this
        // holds. Without it the second device uploads a duplicate of the vault.
        const once = await encryptPath(keys, 'notes/a.md');
        const twice = await encryptPath(keys, 'notes/a.md');
        expect(twice).toBe(once);

        // And on another device, meaning another derivation of the same password.
        const elsewhere = await keysFor('correct horse');
        expect(await encryptPath(elsewhere, 'notes/a.md')).toBe(once);
    });

    it('keeps the folder tree, so the backends can go on working as they do', async () => {
        const sealed = await encryptPath(keys, 'a/b/c.md');
        expect(sealed.split('/')).toHaveLength(3);
    });

    it('hides that two notes in different folders share a name', async () => {
        const one = (await encryptPath(keys, 'work/notes.md')).split('/')[1];
        const other = (await encryptPath(keys, 'home/notes.md')).split('/')[1];
        expect(one).not.toBe(other);
    });

    it('encrypts a folder to the same name wherever it is used', async () => {
        // The other half of the same rule: `work/` has to be one folder on the
        // remote, or every file in it lands somewhere different.
        const a = (await encryptPath(keys, 'work/one.md')).split('/')[0];
        const b = (await encryptPath(keys, 'work/two.md')).split('/')[0];
        expect(a).toBe(b);
    });

    it('leaves nothing of the original name showing', async () => {
        const sealed = await encryptPath(keys, 'salaries/2026.md');
        expect(sealed).not.toContain('salaries');
        expect(sealed).not.toContain('2026');
        expect(sealed).toMatch(/^[a-z2-7/]+$/);
    });

    it('reads as not-ours rather than failing, for a name from another password', async () => {
        const sealed = await encryptPath(keys, 'a.md');
        const other = await keysFor('wrong horse');
        expect(await decryptPath(other, sealed)).toBeNull();
    });

    it('reads as not-ours for a name nobody encrypted', async () => {
        // A listing legitimately contains other people's files. Skipping them is
        // the job; throwing would abandon the run over a stray file.
        expect(await decryptPath(keys, 'README.md')).toBeNull();
        expect(await decryptPath(keys, '.zenith-crypt.json')).toBeNull();
        expect(await decryptPath(keys, '')).toBeNull();
    });
});

describe('the marker file', () => {
    it('round-trips through JSON', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        const back = parseMarker(serializeMarker(marker));
        expect(back).toEqual(marker);
    });

    it('carries a note for whoever finds it in their Dropbox', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        expect(new TextDecoder().decode(serializeMarker(marker))).toContain('encrypted');
    });

    it('accepts the password it was made with', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        expect(markerAccepts(marker, await keysForMarker('hunter2', marker))).toBe(true);
    });

    it('rejects any other password', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        expect(markerAccepts(marker, await keysForMarker('hunter3', marker))).toBe(false);
        expect(markerAccepts(marker, await keysForMarker('', marker))).toBe(false);
    });

    it('salts each remote separately, so one password gives different keys', async () => {
        const a = await newMarker('hunter2', ROUNDS);
        const b = await newMarker('hunter2', ROUNDS);
        expect(a.marker.salt).not.toBe(b.marker.salt);
        expect(markerAccepts(a.marker, b.keys)).toBe(false);
    });

    it('is null for a file that is not a marker', () => {
        expect(parseMarker(bytes('not json'))).toBeNull();
        expect(parseMarker(bytes('{}'))).toBeNull();
        expect(parseMarker(bytes('{"salt":"AA==","check":"AA=="}'))).toBeNull();
    });

    it('refuses a remote written by a newer version, rather than mangling it', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        await expect(keysForMarker('hunter2', { ...marker, version: 99 })).rejects.toThrow(
            /newer version/
        );
    });

    it('refuses a marker whose salt is unreadable', async () => {
        const { marker } = await newMarker('hunter2', ROUNDS);
        await expect(keysForMarker('hunter2', { ...marker, salt: '!!!' })).rejects.toThrow(
            /damaged/
        );
    });
});
