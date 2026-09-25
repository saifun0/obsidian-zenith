import { requestUrl } from 'obsidian';

/**
 * The one HTTP call every remote makes, and the retrying that wraps it.
 *
 * ── Why a seam at all ──
 *
 * The remotes used to call `requestUrl` directly, which made everything below
 * the parsers untestable: a rate-limit response, a half-finished upload session,
 * a token that expired mid-run — none of it reachable without a network. The
 * bugs in a storage client live exactly there, so the transport is a parameter.
 *
 * ── Why retrying belongs here rather than in the engine ──
 *
 * A 429 is not a failure of the file; it is the server asking us to wait. The
 * engine, one level up, cannot tell those apart — it would record the file as
 * failed, leave its previous-sync record untouched, and try again on the next
 * run, which is a strictly worse version of waiting two seconds. Dropbox in
 * particular rate-limits a real vault at four parallel transfers within the
 * first few dozen files, so a client without this does not finish a first sync.
 */

export interface HttpRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer;
    contentType?: string;
}

export interface HttpResponse {
    status: number;
    /** Lower-cased names — servers disagree on the casing, callers should not. */
    headers: Record<string, string>;
    text: string;
    arrayBuffer: ArrayBuffer;
}

export type Http = (req: HttpRequest) => Promise<HttpResponse>;

/**
 * `requestUrl`, not `fetch`.
 *
 * Every endpoint here is cross-origin, and the renderer's CORS rules block them
 * on desktop and mobile alike. `throw: false` because a 4xx body carries the
 * provider's own error code, which is the part worth showing the user.
 *
 * `text` and `arrayBuffer` stay getters rather than being read here: Obsidian
 * materialises each on first access, and eagerly touching both would hold a
 * downloaded attachment in memory twice.
 */
export const obsidianHttp: Http = async (req) => {
    const res = await requestUrl({
        url: req.url,
        method: req.method,
        throw: false,
        headers: req.headers,
        contentType: req.contentType,
        body: req.body,
    });

    return {
        status: res.status,
        headers: normalizeHeaders(res.headers),
        get text() {
            return res.text;
        },
        get arrayBuffer() {
            return res.arrayBuffer;
        },
    };
};

// ── Retrying ─────────────────────────────────────────

export interface RetryOptions {
    /** Total tries including the first. */
    attempts: number;
    baseDelayMs: number;
    /**
     * Longest we will ever wait between tries.
     *
     * A server that asks for longer than this is not throttling us, it is
     * telling us to come back later — see `waitFor`.
     */
    maxDelayMs: number;
    sleep: (ms: number) => Promise<void>;
    /** Injected so the jitter is reproducible in tests. */
    random: () => number;
}

export const DEFAULT_RETRY: RetryOptions = {
    attempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    random: Math.random,
};

/**
 * Statuses worth trying again.
 *
 * Deliberately short. A 409 from Dropbox or a 404 from Graph is the server
 * answering the question we asked, and repeating the question does not change
 * the answer — it just delays the error the user needs to see. 408 is in
 * because a request timeout is the server saying it gave up listening, not that
 * the request was wrong.
 */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Wrap a transport so throttling and transient server failures are waited out.
 *
 * Safe to apply to every call these remotes make, because every one of them is
 * idempotent: uploads overwrite, deletes tolerate an already-missing target,
 * listings and downloads read. A remote that grew a non-idempotent call would
 * have to opt out of this, which is a thing to remember when adding one.
 */
export function withRetry(http: Http, options: Partial<RetryOptions> = {}): Http {
    const opts = { ...DEFAULT_RETRY, ...options };

    return async (req) => {
        let attempt = 0;

        for (;;) {
            attempt++;
            let res: HttpResponse | null = null;
            let thrown: unknown = null;

            try {
                res = await http(req);
                if (!RETRYABLE.has(res.status)) return res;
            } catch (err) {
                // A dropped connection, DNS that failed, a webview that
                // suspended mid-request. Indistinguishable from a 503 as far as
                // what to do about it.
                thrown = err;
            }

            if (attempt >= opts.attempts) {
                if (thrown instanceof Error) throw thrown;
                if (thrown) throw new Error(typeof thrown === 'string' ? thrown : 'Request failed');
                return res as HttpResponse;
            }

            const wait = waitFor(res, attempt, opts);
            if (wait === null) {
                // The server named a wait longer than we are willing to sit on.
                // Reporting that is more use than sleeping through it.
                throw new Error(
                    `The server is rate-limiting this device and asked to be left alone for ${Math.round(
                        (retryAfterMs(res) ?? 0) / 1000
                    )}s. Try syncing again later.`
                );
            }

            await opts.sleep(wait);
        }
    };
}

/**
 * How long to wait before the next try, or null when we should give up instead.
 *
 * `Retry-After` wins when the server sent one: it is the only party that knows
 * when its own limit resets, and backing off on our own schedule while ignoring
 * it is how a client gets throttled harder.
 */
export function waitFor(
    res: HttpResponse | null,
    attempt: number,
    opts: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'random'>
): number | null {
    const asked = retryAfterMs(res);
    if (asked !== null) return asked > opts.maxDelayMs ? null : asked;

    // Full jitter: the whole point is that several transfers throttled at the
    // same instant do not all come back at the same instant, which is what
    // turns one 429 into a run of them.
    const ceiling = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
    return Math.round(ceiling * opts.random());
}

/**
 * `Retry-After`, in milliseconds, or null when the server did not send a usable
 * one. Both spelt forms are accepted: seconds, and an HTTP date.
 */
export function retryAfterMs(res: HttpResponse | null, now = Date.now()): number | null {
    const raw = res?.headers['retry-after'];
    if (!raw) return null;

    const seconds = Number(raw.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.max(0, at - now);

    return null;
}

/**
 * Lower-case every header name, once, at the edge.
 *
 * `HttpResponse` promises lower-cased names so that nothing downstream has to
 * guess — Dropbox sends `retry-after`, other servers send `Retry-After`, and a
 * lookup that guesses wrong reads as "the server asked for no particular wait",
 * which is a silent loss rather than a visible one. Normalising here means the
 * promise is kept in exactly one place.
 */
export function normalizeHeaders(
    headers: Record<string, string> | undefined
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers ?? {})) out[key.toLowerCase()] = value;
    return out;
}
