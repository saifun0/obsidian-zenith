/**
 * FNV-1a, 32-bit.
 *
 * Used to notice that a module's `main.js` on disk is no longer the file Zenith
 * installed — because it was edited by hand, or arrived changed through vault
 * sync from another device. That is change DETECTION, not integrity: anyone who
 * can rewrite the file can rewrite the recorded hash beside it. A cryptographic
 * digest would imply a guarantee this cannot make.
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
