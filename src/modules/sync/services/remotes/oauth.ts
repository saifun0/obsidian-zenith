/**
 * The OAuth machinery Dropbox and OneDrive share.
 *
 * ── Why the two use different grants ──
 *
 * Both need an authorization the user grants in a browser, and neither can use
 * the obvious redirect. Obsidian's `obsidian://` scheme is not an https URL, and
 * a plugin cannot listen on a port at all on iOS or Android — so any flow that
 * depends on a redirect coming back to us is desktop-only, which defeats the
 * purpose of syncing.
 *
 * So each provider uses the flow it offers that needs no redirect:
 *
 * - **Dropbox** shows the authorization code on screen when no redirect URI is
 *   given, and the user pastes it back. One extra step, works everywhere.
 * - **Microsoft** implements the device authorization grant: the plugin gets a
 *   short code, the user types it at a URL on any device, and the plugin polls
 *   until it is approved. No pasting, and also works everywhere.
 *
 * ── Why the network is injected ──
 *
 * The functions below take a `PostForm` rather than calling `requestUrl`. The
 * bugs in an OAuth client are not in the HTTP — they are in the polling, the
 * backoff, the expiry arithmetic and the error mapping, and all of that is
 * reachable in a test only if the transport can be faked.
 */

// ── Shapes ───────────────────────────────────────────

export interface TokenSet {
    accessToken: string;
    /** Absent when the provider issued none — the user must re-authorize. */
    refreshToken: string;
    /** Epoch ms at which the access token stops working. */
    expiresAt: number;
}

/** Minimal form POST. Returns the parsed body whatever the status. */
export type PostForm = (
    url: string,
    form: Record<string, string>
) => Promise<{ status: number; json: unknown }>;

export interface OAuthError {
    /** The provider's own `error` code, when it gave one. */
    code: string;
    message: string;
}

export type TokenResult = { ok: true; tokens: TokenSet } | { ok: false; error: OAuthError };

// ── PKCE ─────────────────────────────────────────────

/**
 * A code verifier: 43–128 characters from the unreserved set.
 *
 * 32 random bytes base64url-encoded lands at 43 characters, the shortest the
 * spec allows and comfortably more entropy than the exchange needs.
 */
export function generateVerifier(): string {
    const bytes = new Uint8Array(32);
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
    } else {
        // Only reachable where Web Crypto is missing. A weak verifier is still
        // better than refusing to authorize at all: it is a one-shot value that
        // never leaves the device except as its own hash.
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return base64Url(bytes);
}

/** The S256 challenge for a verifier. */
export async function challengeFor(verifier: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('This device has no Web Crypto, so PKCE cannot be used.');
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
}

/**
 * base64url: base64 with the URL-safe alphabet and no padding.
 *
 * The padding matters — a trailing `=` is not in the unreserved set, and a
 * verifier carrying one is rejected as malformed.
 */
export function base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Authorization URL ────────────────────────────────

export interface AuthUrlParams {
    authUrl: string;
    clientId: string;
    challenge: string;
    scopes?: string[];
    /** Omitted entirely when absent — which is what makes Dropbox show the code. */
    redirectUri?: string;
    /**
     * Opaque value echoed back on the redirect, and checked when it arrives.
     *
     * Only meaningful with a redirect. A code the user copied by hand came from
     * a page they were looking at; a code that arrives over a URL scheme came
     * from whoever could open that URL, and any application on the device can
     * open one. Matching `state` against what this device sent is what makes
     * the difference between finishing our authorization and finishing
     * somebody else's.
     */
    state?: string;
    extra?: Record<string, string>;
}

export function buildAuthUrl(params: AuthUrlParams): string {
    const query: Record<string, string> = {
        client_id: params.clientId,
        response_type: 'code',
        code_challenge: params.challenge,
        code_challenge_method: 'S256',
        ...params.extra,
    };
    if (params.scopes?.length) query.scope = params.scopes.join(' ');
    if (params.redirectUri) query.redirect_uri = params.redirectUri;
    if (params.state) query.state = params.state;

    const search = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return `${params.authUrl}?${search}`;
}

// ── Token responses ──────────────────────────────────

/**
 * Read a token response.
 *
 * `expires_in` is seconds from now, which is only meaningful at the moment of
 * the reply — so it is turned into an absolute time here rather than stored as
 * given. A provider that omits it is treated as an hour, which every provider
 * involved actually uses.
 */
export function parseTokenResponse(raw: unknown, now: number, previous?: TokenSet): TokenSet | null {
    if (!raw || typeof raw !== 'object') return null;
    const body = raw as Record<string, unknown>;

    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    if (!accessToken) return null;

    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;

    // A refresh response often omits the refresh token, meaning "keep using the
    // one you have". Dropping it would log the user out an hour later.
    const refreshToken =
        typeof body.refresh_token === 'string' && body.refresh_token
            ? body.refresh_token
            : (previous?.refreshToken ?? '');

    return { accessToken, refreshToken, expiresAt: now + Math.max(0, expiresIn) * 1000 };
}

export function parseOAuthError(raw: unknown, status: number): OAuthError {
    const body = (raw ?? {}) as Record<string, unknown>;
    const code = typeof body.error === 'string' ? body.error : `http_${status}`;
    const description =
        typeof body.error_description === 'string'
            ? body.error_description
            : typeof body.error_summary === 'string'
              ? body.error_summary
              : '';
    return { code, message: description || `The provider answered ${status}.` };
}

/**
 * Whether a token needs refreshing.
 *
 * Refreshed a minute early on purpose: a token that expires while a request is
 * in flight fails the request, and a sync run that dies halfway through is worse
 * than one extra refresh call.
 */
export function isExpired(tokens: TokenSet, now: number, skewMs = 60_000): boolean {
    return tokens.expiresAt - skewMs <= now;
}

// ── Grants ───────────────────────────────────────────

export interface ExchangeParams {
    tokenUrl: string;
    clientId: string;
    code: string;
    verifier: string;
    redirectUri?: string;
    extra?: Record<string, string>;
}

export async function exchangeCode(
    post: PostForm,
    params: ExchangeParams,
    now: number
): Promise<TokenResult> {
    const form: Record<string, string> = {
        grant_type: 'authorization_code',
        client_id: params.clientId,
        // Providers differ on whether a pasted code carries stray whitespace;
        // trimming here costs nothing and saves an inscrutable failure.
        code: params.code.trim(),
        code_verifier: params.verifier,
        ...params.extra,
    };
    if (params.redirectUri) form.redirect_uri = params.redirectUri;

    const res = await post(params.tokenUrl, form);
    if (res.status >= 400) return { ok: false, error: parseOAuthError(res.json, res.status) };

    const tokens = parseTokenResponse(res.json, now);
    return tokens
        ? { ok: true, tokens }
        : { ok: false, error: { code: 'bad_response', message: 'The provider sent no access token.' } };
}

export async function refreshTokens(
    post: PostForm,
    params: { tokenUrl: string; clientId: string; extra?: Record<string, string> },
    previous: TokenSet,
    now: number
): Promise<TokenResult> {
    if (!previous.refreshToken) {
        return {
            ok: false,
            error: {
                code: 'no_refresh_token',
                message: 'This connection has no refresh token — authorize again.',
            },
        };
    }

    const res = await post(params.tokenUrl, {
        grant_type: 'refresh_token',
        client_id: params.clientId,
        refresh_token: previous.refreshToken,
        ...params.extra,
    });
    if (res.status >= 400) return { ok: false, error: parseOAuthError(res.json, res.status) };

    const tokens = parseTokenResponse(res.json, now, previous);
    return tokens
        ? { ok: true, tokens }
        : { ok: false, error: { code: 'bad_response', message: 'The provider sent no access token.' } };
}

// ── Device authorization grant ───────────────────────

export interface DeviceCodeStart {
    deviceCode: string;
    /** What the user types at `verificationUri`. */
    userCode: string;
    verificationUri: string;
    /** Epoch ms after which the code is dead. */
    expiresAt: number;
    /** How long to wait between polls. */
    intervalMs: number;
}

export function parseDeviceCodeStart(raw: unknown, now: number): DeviceCodeStart | null {
    if (!raw || typeof raw !== 'object') return null;
    const body = raw as Record<string, unknown>;

    const deviceCode = typeof body.device_code === 'string' ? body.device_code : '';
    const userCode = typeof body.user_code === 'string' ? body.user_code : '';
    if (!deviceCode || !userCode) return null;

    // Microsoft sends `verification_uri`; some providers send the `_complete`
    // variant with the code already embedded, which is friendlier when present.
    const uri =
        (typeof body.verification_uri_complete === 'string' && body.verification_uri_complete) ||
        (typeof body.verification_uri === 'string' && body.verification_uri) ||
        (typeof body.verification_url === 'string' && body.verification_url) ||
        '';
    if (!uri) return null;

    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 900;
    const interval = typeof body.interval === 'number' ? body.interval : 5;

    return {
        deviceCode,
        userCode,
        verificationUri: uri,
        expiresAt: now + expiresIn * 1000,
        // Never poll faster than once a second, whatever the provider claims —
        // a zero interval would spin.
        intervalMs: Math.max(1000, interval * 1000),
    };
}

/** One poll's outcome, before any waiting is decided. */
export type PollOutcome =
    | { kind: 'pending' }
    /** The provider asked us to back off; the new interval is included. */
    | { kind: 'slow_down'; intervalMs: number }
    | { kind: 'granted'; tokens: TokenSet }
    | { kind: 'failed'; error: OAuthError };

/**
 * Interpret one device-code poll.
 *
 * Split out from the waiting loop because this is where the provider's
 * vocabulary has to be mapped correctly: `authorization_pending` means "keep
 * going" and `slow_down` means "keep going, but slower", while everything else
 * is terminal. Treating `slow_down` as a failure aborts an authorization the
 * user is part-way through; treating `expired_token` as pending loops forever.
 */
export function readPoll(status: number, raw: unknown, now: number): PollOutcome {
    if (status < 400) {
        const tokens = parseTokenResponse(raw, now);
        return tokens
            ? { kind: 'granted', tokens }
            : {
                  kind: 'failed',
                  error: { code: 'bad_response', message: 'The provider sent no access token.' },
              };
    }

    const error = parseOAuthError(raw, status);
    if (error.code === 'authorization_pending') return { kind: 'pending' };
    if (error.code === 'slow_down') {
        const body = (raw ?? {}) as Record<string, unknown>;
        const interval = typeof body.interval === 'number' ? body.interval : 0;
        // Providers that ask us to slow down without saying by how much get the
        // conventional five extra seconds.
        return { kind: 'slow_down', intervalMs: Math.max(1000, (interval || 5) * 1000) };
    }
    return { kind: 'failed', error };
}
