/**
 * Base32, RFC 4648, lower-case and unpadded.
 *
 * ── Why not base64url ──
 *
 * These strings become filenames on the remote, and Dropbox compares paths
 * case-insensitively. Base64 uses both cases as distinct symbols, so two
 * different encrypted names could differ only in casing — and Dropbox would
 * treat them as the same file and let one overwrite the other. Silently, and
 * only for whichever pair of notes happened to collide.
 *
 * Base32 has one case, so the question cannot arise. It costs about a fifth
 * more characters than base64, which is a cheap price for not having to reason
 * about it again.
 *
 * Lower-case rather than the spec's upper-case for the same family of reason:
 * Dropbox echoes paths back in two forms, `path_display` (as created) and
 * `path_lower`, and when every name we create is already lower-case the two
 * agree and it does not matter which one a response carries.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** Index by character code, so decoding is a lookup rather than a scan. */
const REVERSE = (() => {
    const table = new Int8Array(128).fill(-1);
    for (let i = 0; i < ALPHABET.length; i++) {
        table[ALPHABET.charCodeAt(i)] = i;
        // Accept upper case on the way in even though we never emit it: a
        // server that upper-cased a path should not cost the user the file.
        table[ALPHABET.toUpperCase().charCodeAt(i)] = i;
    }
    return table;
})();

export function base32Encode(bytes: Uint8Array): string {
    let out = '';
    let buffer = 0;
    let bits = 0;

    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(buffer >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    // The tail, left-aligned and zero-filled. No `=` padding: it carries no
    // information the length does not already give, and it is one more
    // character class to worry about in a path.
    if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];

    return out;
}

/**
 * Decode, or null when the input is not valid base32.
 *
 * Null rather than a throw because the caller is looking at a filename from a
 * server, which may simply belong to something else — an ordinary answer, not
 * an error. Strict about the tail on purpose: leftover bits have to be the zero
 * padding an encoder would have written, so a truncated name is rejected here
 * rather than becoming a shorter, wrong byte string.
 */
export function base32Decode(text: string): Uint8Array<ArrayBuffer> | null {
    const out: number[] = [];
    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const value = code < 128 ? REVERSE[code] : -1;
        if (value < 0) return null;

        buffer = (buffer << 5) | value;
        bits += 5;
        if (bits >= 8) {
            out.push((buffer >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    // A whole symbol left over means the input was cut short mid-byte, and any
    // non-zero padding bit means it was not produced by this encoder.
    if (bits >= 5) return null;
    if ((buffer & ((1 << bits) - 1)) !== 0) return null;

    return new Uint8Array(out);
}
