import { describe, it, expect } from 'vitest';
import {
    PendingAuthStore,
    PENDING_TTL_MS,
    randomState,
} from '../src/modules/sync/services/remotes/oauthPending';
import { buildAuthUrl } from '../src/modules/sync/services/remotes/oauth';
import { DropboxRemote } from '../src/modules/sync/services/remotes/dropboxRemote';

/**
 * The half of a redirect authorization that happens outside any view.
 *
 * With a code the user copied, a wrong one simply fails the exchange. With a
 * redirect the code arrives over a URL scheme that any application on the
 * device can open, so `state` is the only thing separating "we finished our
 * authorization" from "we finished somebody else's".
 */

const started = {
    provider: 'dropbox' as const,
    verifier: 'v-1',
    state: 's-1',
    clientId: 'app-1',
    redirectUri: 'obsidian://zenith-dropbox',
};

describe('a pending authorization', () => {
    it('is claimed by the state it was started with', () => {
        const store = new PendingAuthStore();
        store.begin(started, 1000);

        expect(store.take('s-1', 2000)).toMatchObject({ verifier: 'v-1', clientId: 'app-1' });
    });

    it('is claimed once and no more', () => {
        // A code can only be exchanged once, and a verifier left lying about
        // after that is a secret with nothing left to protect.
        const store = new PendingAuthStore();
        store.begin(started, 1000);

        expect(store.take('s-1', 2000)).not.toBeNull();
        expect(store.take('s-1', 2000)).toBeNull();
    });

    it('refuses a callback carrying somebody else’s state', () => {
        const store = new PendingAuthStore();
        store.begin(started, 1000);

        expect(store.take('s-2', 2000)).toBeNull();
        // And refusing it did not throw ours away — the real one can still
        // arrive, which is the point of checking rather than clearing.
        expect(store.take('s-1', 2000)).not.toBeNull();
    });

    it('refuses a callback carrying no state at all', () => {
        const store = new PendingAuthStore();
        store.begin({ ...started, state: '' }, 1000);

        expect(store.take('', 2000)).toBeNull();
    });

    it('refuses one that arrives too late', () => {
        const store = new PendingAuthStore();
        store.begin(started, 1000);

        expect(store.take('s-1', 1000 + PENDING_TTL_MS + 1)).toBeNull();
    });

    it('refuses everything when nothing was started', () => {
        expect(new PendingAuthStore().take('s-1', 1000)).toBeNull();
    });

    it('is replaced by pressing Connect again', () => {
        // Pressing it twice is what someone does when the first attempt went
        // nowhere, and the second is the one they are waiting on.
        const store = new PendingAuthStore();
        store.begin(started, 1000);
        store.begin({ ...started, state: 's-2', verifier: 'v-2' }, 2000);

        expect(store.take('s-1', 3000)).toBeNull();
        expect(store.take('s-2', 3000)).toMatchObject({ verifier: 'v-2' });
    });

    it('can be read without being consumed', () => {
        const store = new PendingAuthStore();
        store.begin(started, 1000);

        expect(store.peek('dropbox', 2000)).toMatchObject({ state: 's-1' });
        expect(store.peek('onedrive', 2000)).toBeNull();
        expect(store.take('s-1', 2000)).not.toBeNull();
    });

    it('is dropped on cancel', () => {
        const store = new PendingAuthStore();
        store.begin(started, 1000);
        store.cancel();

        expect(store.take('s-1', 2000)).toBeNull();
    });
});

describe('randomState', () => {
    it('is long enough to be worth checking', () => {
        expect(randomState()).toMatch(/^[0-9a-f]{32}$/);
    });

    it('differs every time', () => {
        const seen = new Set(Array.from({ length: 50 }, () => randomState()));
        expect(seen.size).toBe(50);
    });
});

describe('the authorization URL', () => {
    it('carries the redirect and the state when there is a redirect', () => {
        const url = DropboxRemote.authorizeUrl('app-1', 'chal', {
            redirectUri: 'obsidian://zenith-dropbox',
            state: 's-1',
        });

        expect(url).toContain('redirect_uri=obsidian%3A%2F%2Fzenith-dropbox');
        expect(url).toContain('state=s-1');
        expect(url).toContain('code_challenge_method=S256');
        // Without this Dropbox issues no refresh token, the connection works for
        // four hours, and then stops for no visible reason.
        expect(url).toContain('token_access_type=offline');
    });

    it('carries neither when there is not — which is what puts the code on screen', () => {
        const url = DropboxRemote.authorizeUrl('app-1', 'chal');

        expect(url).not.toContain('redirect_uri');
        expect(url).not.toContain('state=');
    });

    it('omits state from the base builder when none was given', () => {
        expect(buildAuthUrl({ authUrl: 'https://x.test', clientId: 'a', challenge: 'c' })).not.toContain(
            'state'
        );
    });
});
