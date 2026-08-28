/**
 * The two pure decisions the state inspector makes, kept out of the component
 * so they can be tested.
 *
 * Masking is the one that matters. The obvious use of a page that prints the
 * whole settings object is copying it into a bug report, and that object holds
 * Dropbox refresh tokens and the vault encryption password — the second of
 * which is the only thing standing between an encrypted backup and whoever has
 * it. Getting this wrong is not a cosmetic bug, so it is a function with tests
 * rather than a conditional buried in JSX.
 */

/**
 * Field names whose value is a secret.
 *
 * Matched against the key alone, at any depth, so a token nested inside a
 * provider's own object is caught by the same rule as a top-level one. Erring
 * generous is deliberate: a masked field that did not need masking costs a
 * click on the reveal switch, and the opposite costs a vault.
 */
export const SECRET_KEY = /token|password|secret|refresh|credential|passphrase|apikey|api_key/i;

/**
 * Replace secret values with a placeholder.
 *
 * The mask is on the value, never on the key: someone reading this is usually
 * asking whether a field is SET at all, and an object with its secret fields
 * deleted answers that question wrongly.
 *
 * A secret key masks its whole value, object and all, rather than recursing to
 * mask the leaves. A token bag is free to call its fields anything — `value`,
 * `v`, `data` — and a rule that only masks recognised leaf names would let
 * those through. What is lost is the useful non-secret field inside, like an
 * expiry; the placeholder says how much was there instead, which is enough to
 * tell an empty bag from a full one.
 */
export function maskSecrets(value: unknown, key: string, reveal: boolean): unknown {
    if (!reveal && SECRET_KEY.test(key) && value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) return `••• (${value.length} items)`;
        return typeof value === 'object' ? '••• (object)' : '•••';
    }

    if (Array.isArray(value)) {
        // Entries inherit the parent key, so an array of objects still has each
        // object's own fields checked by name.
        return value.map((entry) => maskSecrets(entry, key, reveal));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
                childKey,
                maskSecrets(child, childKey, reveal),
            ])
        );
    }

    return value;
}

/**
 * Keep the top-level entries whose key or serialised value mentions `query`.
 *
 * Matching the value as well as the key is what makes the box useful for the
 * question you actually arrive with — "which setting is holding this folder
 * path" — rather than only for the one you already know the name of.
 */
export function narrowEntries(
    source: Record<string, unknown>,
    query: string
): Record<string, unknown> {
    const needle = query.trim().toLowerCase();
    if (!needle) return source;

    return Object.fromEntries(
        Object.entries(source).filter(
            ([key, value]) =>
                key.toLowerCase().includes(needle) ||
                JSON.stringify(value ?? null)
                    .toLowerCase()
                    .includes(needle)
        )
    );
}
