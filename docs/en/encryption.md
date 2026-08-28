# Encrypted sync

[← Documentation](../../README.md) · **English** · [Русский](../ru/encryption.md)

Turn on **Settings → Sync → Encrypt everything before it is uploaded** and Zenith
encrypts file contents *and* filenames before anything leaves the device. The server —
Dropbox, OneDrive, S3 or WebDAV — holds ciphertext under unreadable names and never sees
the password.

Encrypted sync needs a folder of its own. Encrypted and plain files cannot share one, so
pointing it at a folder that already holds notes is refused rather than mixed into.

**Losing the password loses the notes.** There is no copy of it on the server; that is the
whole point. It sits in `data.json` in plain text like every other credential here —
Obsidian offers plugins no keychain — so back it up the way you back up anything else you
cannot regenerate.

## The format

Documented so that the vault is never hostage to this plugin: everything below can be
re-implemented in a short script against any standard crypto library.

A file called `.zenith-crypt.json` sits at the root of the remote folder, unencrypted. It
holds no secret — only the KDF parameters, the salt, and a check value:

```json
{
  "version": 1,
  "iterations": 600000,
  "salt": "<16 random bytes, base64>",
  "check": "<32 bytes, base64>"
}
```

Keys are derived once per remote, not once per file:

```
root        = PBKDF2-HMAC-SHA256(password, salt, iterations)          → 32 bytes
contentKey  = HKDF-SHA256(root, info = "zenith/sync/content/v1")      → 32 bytes
nameKey     = HKDF-SHA256(root, info = "zenith/sync/name/v1")         → 32 bytes
nameNonce   = HKDF-SHA256(root, info = "zenith/sync/name-nonce/v1")   → 32 bytes
check       = HKDF-SHA256(root, info = "zenith/sync/check/v1")        → 32 bytes
```

HKDF is used with an empty salt. `check` is compared against the marker's, which is how a
mistyped password is caught before anything is uploaded rather than weeks later.

**File contents** are AES-256-GCM with a random nonce, and the file's own vault path as
additional authenticated data — so the same bytes filed at another path do not decrypt:

```
bytes 0..3    magic, ASCII "ZNC1"
byte  4       format version, 1
byte  5       algorithm, 1 = AES-256-GCM
bytes 6..17   nonce, 12 bytes
bytes 18..    ciphertext, with the 16-byte tag at the end
```

The overhead is a fixed 34 bytes, which is deliberate: it lets the plugin work out a file's
decrypted size from its encrypted size without downloading it, and the sync plan compares
sizes to decide whether two copies are the same file.

**Paths** are encrypted one segment at a time, so the folder tree survives and names stay
short. Each segment is AES-256-GCM over the segment text, with the plaintext parent path as
additional authenticated data, and a *deterministic* nonce — the first 12 bytes of
`HMAC-SHA256(nameNonce, full plaintext path down to this segment)`. Determinism is what
makes two devices agree on a name instead of each uploading its own copy. The nonce is
stored in front of the ciphertext because decryption cannot recompute it, and the whole
thing is [RFC 4648 base32](https://www.rfc-editor.org/rfc/rfc4648), lower-case and
unpadded:

```
segment = base32( nonce[12] || AES-256-GCM(nameKey, nonce, segment, aad = parent path) )
```

Base32 rather than base64 because Dropbox compares paths case-insensitively, and two names
differing only in case would silently collide.

## What the server still learns

Not the contents, and not the names. It does see how many files there are, roughly how large
each one is, when each was written, and the shape of the folder tree. Hiding those needs
padding and decoy traffic, which cost real bandwidth and would make the size comparison
above impossible — this stops where Remotely Save and rclone stop, for the same reasons.
