/**
 * The half-finished authorization, held while the user is in their browser.
 *
 * A PKCE exchange needs the verifier that produced the challenge, and with a
 * redirect flow the code comes back through a completely different door — the
 * `obsidian://` handler, minutes later, quite possibly with the settings pane
 * long since closed. So the verifier cannot live in the component that started
 * the flow; something outside the UI has to be holding it when the door opens.
 *
 * In memory rather than in `data.json`, deliberately. This is a live secret for
 * the next few minutes and worthless afterwards, and writing it to disk would
 * park it in the vault indefinitely for no gain — losing it costs one retry.
 */

export type PendingProvider = 'dropbox' | 'onedrive';

export interface PendingAuth {
    provider: PendingProvider;
    /** The PKCE verifier whose challenge the browser is carrying. */
    verifier: string;
    /** Echoed through the provider and checked on the way back. */
    state: string;
    /** The id the flow started with — settings may have changed since. */
    clientId: string;
    redirectUri: string;
    startedAt: number;
}

/**
 * How long a started authorization stays answerable.
 *
 * Long enough to sign in, approve, and deal with a two-factor prompt; short
 * enough that a verifier abandoned an hour ago is not still sitting there
 * waiting for a code somebody else could bring.
 */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export class PendingAuthStore {
    private pending: PendingAuth | null = null;

    /**
     * Start one, replacing whatever was in flight.
     *
     * Replacing rather than refusing: pressing Connect twice is what someone
     * does when the first attempt went nowhere, and the second press is the one
     * they are waiting on.
     */
    begin(auth: Omit<PendingAuth, 'startedAt'>, now = Date.now()): void {
        this.pending = { ...auth, startedAt: now };
    }

    /** What is in flight for a provider, or null. Does not consume it. */
    peek(provider: PendingProvider, now = Date.now()): PendingAuth | null {
        const pending = this.pending;
        if (!pending || pending.provider !== provider) return null;
        return this.expired(pending, now) ? null : pending;
    }

    /**
     * Claim the pending authorization a callback belongs to, or null.
     *
     * Single use: a code can only be exchanged once, and a verifier left behind
     * after a successful exchange is a secret with nothing left to protect.
     * Null covers all three ways this goes wrong — nothing in flight, a `state`
     * we never sent, and one we sent too long ago — because the caller says the
     * same thing to the user in each case, and being specific about which would
     * be telling whoever sent it which guess was closest.
     */
    take(state: string, now = Date.now()): PendingAuth | null {
        const pending = this.pending;
        if (!pending) return null;
        if (!state || pending.state !== state) return null;

        this.pending = null;
        return this.expired(pending, now) ? null : pending;
    }

    cancel(): void {
        this.pending = null;
    }

    private expired(auth: PendingAuth, now: number): boolean {
        return now - auth.startedAt > PENDING_TTL_MS;
    }
}

/**
 * A random value for `state`.
 *
 * Same shape and same source as a PKCE verifier — this is the other half of the
 * same job, and there is no reason for it to be weaker.
 */
export function randomState(): string {
    const bytes = new Uint8Array(16);
    const api = crypto;
    if (api?.getRandomValues) {
        api.getRandomValues(bytes);
    } else {
        // Only reachable without Web Crypto, where PKCE itself cannot run. A
        // weak state is still better than none: it is compared against what
        // this device sent, and never leaves the device except as itself.
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
