/**
 * FNV-1a, 32-bit.
 *
 * A quick fingerprint for noticing that something changed — change DETECTION,
 * not integrity: anyone who can rewrite the thing can rewrite the recorded hash
 * beside it. A cryptographic digest would imply a guarantee this cannot make.
 */
export function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        // The FNV prime, as shifts — a plain multiply overflows past 2^32 and
        // loses the low bits that make this a hash.
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        hash >>>= 0;
    }
    return hash.toString(16).padStart(8, '0');
}
