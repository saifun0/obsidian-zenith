/**
 * The app registrations Zenith ships with, and the user's own when they'd
 * rather have one.
 *
 * ── Why shipping one is safe ──
 *
 * A `client_id` is not a secret. RFC 8252 starts from the position that a
 * native app cannot keep one, and PKCE exists precisely so that a public,
 * published client id is still safe to authorize against: the code is useless
 * without the verifier, which never leaves the device. Every desktop
 * application that talks to these providers has its id sitting in the binary.
 *
 * ── Why the override stays ──
 *
 * What a shared registration does cost is shared fate. Provider limits apply
 * partly per app, a registration can be throttled or suspended, and a
 * development-status Dropbox app is capped on linked accounts until it has been
 * through review. None of that is visible to the person it happens to, and all
 * of it is fixed by using an app of your own — so anyone who wants their own
 * limits and their own consent screen can have them, and everyone else never
 * has to open a developer console.
 */

/**
 * Zenith's own Dropbox app key.
 *
 * Empty means "no registration ships with this build", and the settings ask for
 * one instead of offering to fall back — which is the honest state until the
 * app has been registered and, if it is going to be used by more than a handful
 * of people, taken through Dropbox's production review.
 */
export const SHIPPED_DROPBOX_CLIENT_ID: string = '';

/** Zenith's own Azure application (client) id. Empty as above. */
export const SHIPPED_ONEDRIVE_CLIENT_ID: string = '';

/**
 * The id to actually authorize with: the user's, or ours.
 *
 * Trimmed before the emptiness test on purpose — a field someone cleared by
 * selecting all and typing a space should fall back, not authorize against a
 * client id made of whitespace and fail with the provider's own unhelpful
 * wording.
 */
export function effectiveClientId(own: string, shipped: string): string {
    return own.trim() || shipped;
}

export const dropboxClientId = (own: string): string =>
    effectiveClientId(own, SHIPPED_DROPBOX_CLIENT_ID);

export const onedriveClientId = (own: string): string =>
    effectiveClientId(own, SHIPPED_ONEDRIVE_CLIENT_ID);

/**
 * Whether this build carries a registration for a provider at all.
 *
 * Read at module load and used to pick which wording the settings show, so the
 * field asks for an app key when there is nothing to fall back to and offers to
 * be left empty when there is.
 */
export const HAS_SHIPPED_DROPBOX = SHIPPED_DROPBOX_CLIENT_ID !== '';
export const HAS_SHIPPED_ONEDRIVE = SHIPPED_ONEDRIVE_CLIENT_ID !== '';
