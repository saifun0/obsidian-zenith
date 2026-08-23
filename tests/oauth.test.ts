import { describe, it, expect } from 'vitest';
import {
    base64Url,
    buildAuthUrl,
    challengeFor,
    exchangeCode,
    generateVerifier,
    isExpired,
    parseDeviceCodeStart,
    parseOAuthError,
    parseTokenResponse,
    readPoll,
    refreshTokens,
    type PostForm,
    type TokenSet,
} from '../src/modules/sync/services/remotes/oauth';

/** A `PostForm` that answers from a script and records what it was asked. */
function fakePost(
    replies: Array<{ status: number; json: unknown }>,
    sent: Array<{ url: string; form: Record<string, string> }> = []
): PostForm & { sent: typeof sent } {
    let i = 0;
    const post = (async (url, form) => {
        sent.push({ url, form });
        return replies[Math.min(i++, replies.length - 1)];
    }) as PostForm & { sent: typeof sent };
    post.sent = sent;
    return post;
}

const NOW = 1_700_000_000_000;

describe('PKCE', () => {
    it('produces the challenge RFC 7636 publishes for its example verifier', async () => {
        // Appendix B. Getting S256 wrong is silent: the authorization succeeds
        // and the exchange fails with a message about an invalid grant.
        expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
            'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
        );
    });

    it('generates a verifier of a length the spec allows', () => {
        const verifier = generateVerifier();
        expect(verifier.length).toBeGreaterThanOrEqual(43);
        expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('generates verifiers from the unreserved set only', () => {
        for (let i = 0; i < 20; i++) {
            expect(generateVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/);
        }
    });

    it('does not repeat itself', () => {
        const seen = new Set(Array.from({ length: 50 }, () => generateVerifier()));
        expect(seen.size).toBe(50);
    });
});

describe('base64Url', () => {
    it('uses the URL-safe alphabet and drops the padding', () => {
        // A trailing `=` is not in the unreserved set, and a verifier carrying
        // one is rejected as malformed.
        const bytes = new Uint8Array([251, 255, 190]);
        expect(base64Url(bytes)).toBe('-_--');
        expect(base64Url(new Uint8Array([1]))).toBe('AQ');
        expect(base64Url(new Uint8Array([1, 2]))).toBe('AQI');
    });
});

describe('buildAuthUrl', () => {
    const base = {
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        clientId: 'abc123',
        challenge: 'CHAL',
    };

    it('carries the PKCE parameters', () => {
        const url = buildAuthUrl(base);
        expect(url).toContain('code_challenge=CHAL');
        expect(url).toContain('code_challenge_method=S256');
        expect(url).toContain('response_type=code');
        expect(url).toContain('client_id=abc123');
    });

    it('omits the redirect entirely when there is none', () => {
        // That omission is exactly what makes Dropbox show the code on screen
        // instead of trying to redirect somewhere we cannot receive.
        expect(buildAuthUrl(base)).not.toContain('redirect_uri');
    });

    it('includes the redirect when there is one', () => {
        expect(buildAuthUrl({ ...base, redirectUri: 'obsidian://zenith' })).toContain(
            'redirect_uri=obsidian%3A%2F%2Fzenith'
        );
    });

    it('joins scopes with spaces and encodes them', () => {
        const url = buildAuthUrl({ ...base, scopes: ['files.content.read', 'files.content.write'] });
        expect(url).toContain('scope=files.content.read%20files.content.write');
    });

    it('passes provider-specific extras through', () => {
        expect(buildAuthUrl({ ...base, extra: { token_access_type: 'offline' } })).toContain(
            'token_access_type=offline'
        );
    });
});

describe('parseTokenResponse', () => {
    it('turns expires_in into an absolute time', () => {
        // Seconds-from-now is only meaningful at the moment of the reply.
        const tokens = parseTokenResponse(
            { access_token: 'a', refresh_token: 'r', expires_in: 14400 },
            NOW
        );
        expect(tokens?.expiresAt).toBe(NOW + 14_400_000);
    });

    it('assumes an hour when the provider says nothing', () => {
        expect(parseTokenResponse({ access_token: 'a' }, NOW)?.expiresAt).toBe(NOW + 3_600_000);
    });

    it('keeps the previous refresh token when the reply omits one', () => {
        // A refresh response usually omits it, meaning "keep using yours".
        // Dropping it would log the user out an hour later.
        const previous: TokenSet = { accessToken: 'old', refreshToken: 'keep-me', expiresAt: 0 };
        const tokens = parseTokenResponse({ access_token: 'new', expires_in: 60 }, NOW, previous);
        expect(tokens?.refreshToken).toBe('keep-me');
    });

    it('prefers a fresh refresh token when the reply has one', () => {
        const previous: TokenSet = { accessToken: 'old', refreshToken: 'old-r', expiresAt: 0 };
        const tokens = parseTokenResponse(
            { access_token: 'new', refresh_token: 'new-r' },
            NOW,
            previous
        );
        expect(tokens?.refreshToken).toBe('new-r');
    });

    it('is null without an access token', () => {
        expect(parseTokenResponse({ refresh_token: 'r' }, NOW)).toBeNull();
        expect(parseTokenResponse(null, NOW)).toBeNull();
        expect(parseTokenResponse('not an object', NOW)).toBeNull();
    });
});

describe('isExpired', () => {
    const tokens: TokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 300_000 };

    it('is false while there is comfortable time left', () => {
        expect(isExpired(tokens, NOW)).toBe(false);
    });

    it('refreshes early rather than letting a request die mid-flight', () => {
        // A token that expires during a sync run kills the run; one extra
        // refresh call costs nothing.
        expect(isExpired(tokens, NOW + 250_000)).toBe(true);
        expect(isExpired(tokens, NOW + 230_000)).toBe(false);
    });
});

describe('parseOAuthError', () => {
    it('prefers the provider description', () => {
        expect(
            parseOAuthError({ error: 'invalid_grant', error_description: 'code expired' }, 400)
        ).toEqual({ code: 'invalid_grant', message: 'code expired' });
    });

    it("reads Dropbox's error_summary too", () => {
        expect(parseOAuthError({ error: 'x', error_summary: 'path/not_found' }, 409).message).toBe(
            'path/not_found'
        );
    });

    it('falls back to the status', () => {
        expect(parseOAuthError({}, 503)).toEqual({
            code: 'http_503',
            message: 'The provider answered 503.',
        });
    });
});

describe('exchangeCode', () => {
    it('sends the verifier and the code', async () => {
        const post = fakePost([{ status: 200, json: { access_token: 'a', refresh_token: 'r' } }]);
        const result = await exchangeCode(
            post,
            { tokenUrl: 'https://t', clientId: 'cid', code: 'CODE', verifier: 'VER' },
            NOW
        );

        expect(result.ok).toBe(true);
        expect(post.sent[0].form).toMatchObject({
            grant_type: 'authorization_code',
            client_id: 'cid',
            code: 'CODE',
            code_verifier: 'VER',
        });
    });

    it('trims a pasted code', async () => {
        // Selecting a code from a web page picks up whitespace, and the failure
        // it causes says nothing useful.
        const post = fakePost([{ status: 200, json: { access_token: 'a' } }]);
        await exchangeCode(
            post,
            { tokenUrl: 'https://t', clientId: 'cid', code: '  CODE\n', verifier: 'VER' },
            NOW
        );
        expect(post.sent[0].form.code).toBe('CODE');
    });

    it('omits the redirect when there is none', async () => {
        const post = fakePost([{ status: 200, json: { access_token: 'a' } }]);
        await exchangeCode(
            post,
            { tokenUrl: 'https://t', clientId: 'cid', code: 'C', verifier: 'V' },
            NOW
        );
        expect('redirect_uri' in post.sent[0].form).toBe(false);
    });

    it('reports the provider error rather than throwing', async () => {
        const post = fakePost([
            { status: 400, json: { error: 'invalid_grant', error_description: 'expired' } },
        ]);
        const result = await exchangeCode(
            post,
            { tokenUrl: 'https://t', clientId: 'cid', code: 'C', verifier: 'V' },
            NOW
        );

        expect(result).toEqual({ ok: false, error: { code: 'invalid_grant', message: 'expired' } });
    });
});

describe('refreshTokens', () => {
    const previous: TokenSet = { accessToken: 'old', refreshToken: 'r', expiresAt: 0 };

    it('sends the refresh token', async () => {
        const post = fakePost([{ status: 200, json: { access_token: 'new', expires_in: 60 } }]);
        const result = await refreshTokens(post, { tokenUrl: 'https://t', clientId: 'c' }, previous, NOW);

        expect(result.ok && result.tokens.accessToken).toBe('new');
        expect(post.sent[0].form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r' });
    });

    it('refuses without a refresh token instead of calling out', async () => {
        const post = fakePost([{ status: 200, json: {} }]);
        const result = await refreshTokens(
            post,
            { tokenUrl: 'https://t', clientId: 'c' },
            { accessToken: 'a', refreshToken: '', expiresAt: 0 },
            NOW
        );

        expect(result).toMatchObject({ ok: false, error: { code: 'no_refresh_token' } });
        expect(post.sent).toHaveLength(0);
    });
});

describe('parseDeviceCodeStart', () => {
    const reply = {
        device_code: 'DEV',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://microsoft.com/devicelogin',
        expires_in: 900,
        interval: 5,
    };

    it('reads what the user needs to see', () => {
        const start = parseDeviceCodeStart(reply, NOW);
        expect(start).toMatchObject({
            deviceCode: 'DEV',
            userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin',
            intervalMs: 5000,
        });
        expect(start?.expiresAt).toBe(NOW + 900_000);
    });

    it('prefers the complete verification URI when there is one', () => {
        const start = parseDeviceCodeStart(
            { ...reply, verification_uri_complete: 'https://ms.com/dl?code=ABCD' },
            NOW
        );
        expect(start?.verificationUri).toBe('https://ms.com/dl?code=ABCD');
    });

    it('never polls faster than once a second', () => {
        // A zero interval from the provider would otherwise spin.
        expect(parseDeviceCodeStart({ ...reply, interval: 0 }, NOW)?.intervalMs).toBe(1000);
    });

    it('is null when the reply is unusable', () => {
        expect(parseDeviceCodeStart({ user_code: 'A' }, NOW)).toBeNull();
        expect(parseDeviceCodeStart({ device_code: 'D', user_code: 'A' }, NOW)).toBeNull();
        expect(parseDeviceCodeStart(null, NOW)).toBeNull();
    });
});

describe('readPoll', () => {
    it('keeps waiting while the user has not finished', () => {
        // Treating this as a failure would abort an authorization the user is
        // part-way through.
        expect(readPoll(400, { error: 'authorization_pending' }, NOW)).toEqual({ kind: 'pending' });
    });

    it('backs off when asked, without giving up', () => {
        expect(readPoll(400, { error: 'slow_down', interval: 10 }, NOW)).toEqual({
            kind: 'slow_down',
            intervalMs: 10_000,
        });
    });

    it('backs off by a conventional amount when told nothing', () => {
        expect(readPoll(400, { error: 'slow_down' }, NOW)).toEqual({
            kind: 'slow_down',
            intervalMs: 5000,
        });
    });

    it('stops on a terminal error', () => {
        // Treating these as pending would loop forever.
        for (const code of ['expired_token', 'access_denied', 'invalid_client']) {
            expect(readPoll(400, { error: code }, NOW).kind).toBe('failed');
        }
    });

    it('takes the tokens when the grant lands', () => {
        const outcome = readPoll(200, { access_token: 'a', refresh_token: 'r', expires_in: 60 }, NOW);
        expect(outcome).toMatchObject({ kind: 'granted' });
        expect(outcome.kind === 'granted' && outcome.tokens.expiresAt).toBe(NOW + 60_000);
    });

    it('fails a success response that carries no token', () => {
        expect(readPoll(200, { token_type: 'Bearer' }, NOW).kind).toBe('failed');
    });
});
