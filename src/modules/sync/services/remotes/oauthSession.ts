import { requestUrl } from 'obsidian';
import {
    isExpired,
    refreshTokens,
    type PostForm,
    type TokenSet,
} from './oauth';

/**
 * Holding a usable access token, and renewing it when it goes stale.
 *
 * Refreshing is serialised through one in-flight promise. A sync run fires
 * several requests at once by design, and without this every one of them would
 * notice the expiry at the same moment and refresh separately — which with some
 * providers invalidates the refresh token as a replay and logs the user out
 * mid-run.
 */

export interface TokenStore {
    read(): TokenSet | null;
    write(tokens: TokenSet): void;
    clear(): void;
}

export interface SessionConfig {
    tokenUrl: string;
    clientId: string;
    /** Provider-specific extras for the refresh call. */
    refreshExtra?: Record<string, string>;
}

export class OAuthSession {
    private refreshing: Promise<string> | null = null;

    constructor(
        private readonly config: SessionConfig,
        private readonly store: TokenStore,
        private readonly post: PostForm = postForm
    ) {}

    get authorized(): boolean {
        return !!this.store.read()?.accessToken;
    }

    /** A token good to use now, refreshed first if it is close to expiring. */
    async accessToken(now = Date.now()): Promise<string> {
        const tokens = this.store.read();
        if (!tokens) throw new Error('Not connected — authorize this device first.');
        if (!isExpired(tokens, now)) return tokens.accessToken;

        // Everyone who arrives while a refresh is in flight waits for that one.
        this.refreshing ??= this.doRefresh(tokens, now).finally(() => {
            this.refreshing = null;
        });
        return this.refreshing;
    }

    private async doRefresh(previous: TokenSet, now: number): Promise<string> {
        const result = await refreshTokens(
            this.post,
            {
                tokenUrl: this.config.tokenUrl,
                clientId: this.config.clientId,
                extra: this.config.refreshExtra,
            },
            previous,
            now
        );

        if (!result.ok) {
            // A refresh token the provider has rejected will never work again,
            // so it is thrown away rather than retried on every request for the
            // rest of the session.
            if (result.error.code === 'invalid_grant' || result.error.code === 'no_refresh_token') {
                this.store.clear();
            }
            throw new Error(`Could not renew the connection: ${result.error.message}`);
        }

        this.store.write(result.tokens);
        return result.tokens.accessToken;
    }
}

/**
 * Form POST over Obsidian's `requestUrl`.
 *
 * Not `fetch`: token endpoints are cross-origin, and the renderer's CORS rules
 * would block them on desktop and mobile alike.
 */
export const postForm: PostForm = async (url, form) => {
    const body = Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const res = await requestUrl({
        url,
        method: 'POST',
        // The status is inspected rather than thrown on: a 400 carries the
        // provider's own error code, which is the useful part.
        throw: false,
        contentType: 'application/x-www-form-urlencoded',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    return { status: res.status, json: safeJson(res.text) };
};

/** Parse a body that may not be JSON at all — an HTML error page, say. */
export function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}
