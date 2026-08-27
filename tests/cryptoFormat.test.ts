import { describe, it, expect } from 'vitest';
import {
    encryptContent,
    encryptPath,
    keysForMarker,
    newMarker,
} from '../src/modules/sync/services/crypto/vaultCrypto';

/**
 * The on-disk format, read back by something that does not share its code.
 *
 * The escape hatch for encrypted sync is the format description in the README:
 * lose the plugin, keep the notes, provided the description is true. This file
 * is what makes it true — it re-implements decryption from that description
 * alone, against plain Web Crypto, and decrypts what the plugin produced.
 *
 * That gives it a second job. Any change to the layout, the labels, the nonce
 * derivation or the encoding fails here, which is exactly right: those are not
 * implementation details, they are a promise to every vault already encrypted.
 */

const subtle = globalThis.crypto.subtle;
const utf8 = (value: string) => new TextEncoder().encode(value);

/** RFC 4648 base32, decode only. Written out rather than imported, on purpose. */
function base32Decode(text: string): Uint8Array {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const out: number[] = [];
    let bits = 0;
    let value = 0;

    for (const char of text) {
        const index = alphabet.indexOf(char);
        if (index < 0) throw new Error(`not base32: ${char}`);
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return new Uint8Array(out);
}

/** Everything the README says about deriving keys, and nothing else. */
async function deriveFromReadme(password: string, saltBase64: string, iterations: number) {
    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    const passwordKey = await subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
        'deriveBits',
    ]);
    const root = await subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        passwordKey,
        256
    );

    const hkdf = await subtle.importKey('raw', root, 'HKDF', false, ['deriveBits']);
    const branch = (info: string) =>
        subtle.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) },
            hkdf,
            256
        );

    const aes = (bits: ArrayBuffer) =>
        subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);

    return {
        content: await aes(await branch('zenith/sync/content/v1')),
        name: await aes(await branch('zenith/sync/name/v1')),
        nameNonce: await subtle.importKey(
            'raw',
            await branch('zenith/sync/name-nonce/v1'),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        ),
    };
}

type ReadmeKeys = Awaited<ReturnType<typeof deriveFromReadme>>;

async function readContent(keys: ReadmeKeys, path: string, file: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(file);

    expect(Array.from(bytes.subarray(0, 4))).toEqual(Array.from(utf8('ZNC1')));
    expect(bytes[4]).toBe(1);
    expect(bytes[5]).toBe(1);

    const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.subarray(6, 18), additionalData: utf8(path) },
        keys.content,
        bytes.subarray(18)
    );
    return new TextDecoder().decode(plain);
}

async function readPath(keys: ReadmeKeys, encrypted: string): Promise<string> {
    const out: string[] = [];
    let parent = '';

    for (const segment of encrypted.split('/')) {
        const packed = base32Decode(segment);
        const plain = await subtle.decrypt(
            { name: 'AES-GCM', iv: packed.subarray(0, 12), additionalData: utf8(parent) },
            keys.name,
            packed.subarray(12)
        );
        const name = new TextDecoder().decode(plain);
        out.push(name);
        parent = parent ? `${parent}/${name}` : name;
    }

    return out.join('/');
}

describe('the format the README describes', () => {
    const PASSWORD = 'a password from the settings screen';
    const PATH = 'Заметки/2026/встреча 🎉.md';
    const BODY = '# Notes\n\n- [ ] follow up';

    it('is the format the plugin actually writes', async () => {
        const { marker, keys } = await newMarker(PASSWORD, 1000);
        const sealedPath = await encryptPath(keys, PATH);
        const sealedFile = await encryptContent(keys, PATH, utf8(BODY).buffer as ArrayBuffer);

        // From here on, only the marker file and the README.
        const readme = await deriveFromReadme(PASSWORD, marker.salt, marker.iterations);
        expect(await readPath(readme, sealedPath)).toBe(PATH);
        expect(await readContent(readme, PATH, sealedFile)).toBe(BODY);
    });

    it('derives a name nonce the way the README says it does', async () => {
        const { marker, keys } = await newMarker(PASSWORD, 1000);
        const readme = await deriveFromReadme(PASSWORD, marker.salt, marker.iterations);

        // HMAC over the full plaintext path down to the segment, truncated to
        // twelve bytes. This is the part that makes two devices agree, so it is
        // worth pinning on its own rather than only through a round trip.
        const expected = new Uint8Array(
            await subtle.sign('HMAC', readme.nameNonce, utf8('a/b.md'))
        ).subarray(0, 12);

        const second = (await encryptPath(keys, 'a/b.md')).split('/')[1];
        expect(Array.from(base32Decode(second).subarray(0, 12))).toEqual(Array.from(expected));
    });

    it('costs exactly the 34 bytes the README claims', async () => {
        const { keys } = await newMarker(PASSWORD, 1000);
        const sealed = await encryptContent(keys, 'a.md', new ArrayBuffer(1000));
        expect(sealed.byteLength).toBe(1034);
    });

    it('checks the password with the value in the marker, as described', async () => {
        const { marker } = await newMarker(PASSWORD, 1000);
        const keys = await keysForMarker(PASSWORD, marker);
        expect(btoa(String.fromCharCode(...keys.check))).toBe(marker.check);
    });
});
