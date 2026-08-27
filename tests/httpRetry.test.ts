import { describe, it, expect } from 'vitest';
import {
    normalizeHeaders,
    retryAfterMs,
    waitFor,
    withRetry,
    type Http,
    type HttpRequest,
    type HttpResponse,
} from '../src/modules/sync/services/remotes/http';

function reply(status: number, headers: Record<string, string> = {}): HttpResponse {
    return { status, headers, text: '', arrayBuffer: new ArrayBuffer(0) };
}

/** A transport that hands back a scripted sequence, and records the waits. */
function scripted(steps: Array<HttpResponse | Error>) {
    const slept: number[] = [];
    let calls = 0;

    const http: Http = async () => {
        const step = steps[Math.min(calls++, steps.length - 1)];
        if (step instanceof Error) throw step;
        return step;
    };

    return {
        slept,
        get calls() {
            return calls;
        },
        wrap: (attempts = 5) =>
            withRetry(http, {
                attempts,
                baseDelayMs: 100,
                maxDelayMs: 10_000,
                sleep: async (ms) => {
                    slept.push(ms);
                },
                // No jitter, so the backoff is a fixed sequence to assert on.
                random: () => 1,
            }),
    };
}

const GET: HttpRequest = { url: 'https://example.test/x', method: 'GET' };

describe('withRetry', () => {
    it('returns a good answer without waiting', async () => {
        const t = scripted([reply(200)]);
        const res = await t.wrap()(GET);

        expect(res.status).toBe(200);
        expect(t.calls).toBe(1);
        expect(t.slept).toEqual([]);
    });

    it('waits out a rate limit and returns what comes after it', async () => {
        const t = scripted([reply(429), reply(429), reply(200)]);
        const res = await t.wrap()(GET);

        expect(res.status).toBe(200);
        expect(t.calls).toBe(3);
        // Doubling from the base delay, because this is what stops several
        // throttled transfers all coming back at the same instant.
        expect(t.slept).toEqual([100, 200]);
    });

    it('does the same for a server that fell over', async () => {
        const t = scripted([reply(503), reply(200)]);
        expect((await t.wrap()(GET)).status).toBe(200);
        expect(t.calls).toBe(2);
    });

    it('leaves an answer the server meant alone', async () => {
        // 404 and 409 are the server answering the question, not refusing to.
        for (const status of [400, 401, 403, 404, 409]) {
            const t = scripted([reply(status), reply(200)]);
            expect((await t.wrap()(GET)).status).toBe(status);
            expect(t.calls).toBe(1);
        }
    });

    it('gives the last answer back once the tries run out', async () => {
        const t = scripted([reply(429)]);
        const res = await t.wrap(3)(GET);

        expect(res.status).toBe(429);
        expect(t.calls).toBe(3);
        expect(t.slept).toHaveLength(2);
    });

    it('treats a dropped connection like a 503', async () => {
        const t = scripted([new Error('network down'), reply(200)]);
        expect((await t.wrap()(GET)).status).toBe(200);
        expect(t.calls).toBe(2);
    });

    it('rethrows the connection error when it never recovers', async () => {
        const t = scripted([new Error('network down')]);
        await expect(t.wrap(2)(GET)).rejects.toThrow('network down');
        expect(t.calls).toBe(2);
    });

    it('waits exactly as long as the server asked', async () => {
        const t = scripted([reply(429, { 'retry-after': '3' }), reply(200)]);
        await t.wrap()(GET);

        expect(t.slept).toEqual([3000]);
    });

    it('stops rather than sleeping through a very long cool-off', async () => {
        // Reporting a five-minute lockout is more use to the user than sitting
        // silently through it.
        const t = scripted([reply(429, { 'retry-after': '300' })]);
        await expect(t.wrap()(GET)).rejects.toThrow(/rate-limiting/);
        expect(t.slept).toEqual([]);
    });
});

describe('normalizeHeaders', () => {
    it('lower-cases the names, so nothing downstream has to guess', () => {
        // The whole reason `retryAfterMs` can look up one spelling: servers
        // disagree, and this is where the disagreement stops.
        expect(normalizeHeaders({ 'Retry-After': '2', ETag: 'abc' })).toEqual({
            'retry-after': '2',
            etag: 'abc',
        });
    });

    it('survives a response that carried no headers at all', () => {
        expect(normalizeHeaders(undefined)).toEqual({});
    });
});

describe('retryAfterMs', () => {
    it('reads seconds', () => {
        expect(retryAfterMs(reply(429, { 'retry-after': '7' }))).toBe(7000);
    });

    it('reads an HTTP date, relative to now', () => {
        const now = Date.parse('2026-01-01T00:00:00Z');
        const header = new Date(now + 5000).toUTCString();
        expect(retryAfterMs(reply(429, { 'retry-after': header }), now)).toBe(5000);
    });

    it('never asks for a wait in the past', () => {
        const now = Date.parse('2026-01-01T00:00:00Z');
        const header = new Date(now - 60_000).toUTCString();
        expect(retryAfterMs(reply(429, { 'retry-after': header }), now)).toBe(0);
    });

    it('is null when there is nothing usable to read', () => {
        expect(retryAfterMs(reply(429))).toBeNull();
        expect(retryAfterMs(reply(429, { 'retry-after': 'soon' }))).toBeNull();
        expect(retryAfterMs(null)).toBeNull();
    });
});

describe('waitFor', () => {
    const opts = { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 };

    it('doubles, then stops at the ceiling', () => {
        expect(waitFor(null, 1, opts)).toBe(100);
        expect(waitFor(null, 2, opts)).toBe(200);
        expect(waitFor(null, 3, opts)).toBe(400);
        expect(waitFor(null, 9, opts)).toBe(1000);
    });

    it('jitters down from that ceiling, never up', () => {
        expect(waitFor(null, 3, { ...opts, random: () => 0 })).toBe(0);
        expect(waitFor(null, 3, { ...opts, random: () => 0.5 })).toBe(200);
    });
});
