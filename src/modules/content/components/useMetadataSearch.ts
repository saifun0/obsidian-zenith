import { useEffect, useRef, useState } from 'react';
import type { MetadataProviderId } from '../../../core/contentTypes';
import { providerMinQueryLength, providerSearchable, searchMetadataDetailed } from '../services/metadata';
import type { MetadataResult } from '../services/metadata/types';

export type MetadataSearchState = 'off' | 'short' | 'searching' | 'ready' | 'empty' | 'error';

export interface MetadataSearch {
    results: MetadataResult[];
    state: MetadataSearchState;
    /** Re-run the current query, ignoring the debounce (used by "Try again"). */
    retry: () => void;
}

const DEBOUNCE_MS = 350;

/**
 * useMetadataSearch — debounced provider lookup for the add form.
 *
 * Two things the inline version got wrong: a slow response for an old query
 * could land after a newer one and overwrite it (so the list showed results for
 * a title you'd already edited), and every miss looked identical whether the
 * query was too short, genuinely unmatched, or the request failed. A monotonic
 * request id fixes the first; an explicit state machine fixes the second.
 */
export function useMetadataSearch(
    provider: MetadataProviderId,
    query: string,
    enabled = true
): MetadataSearch {
    const [results, setResults] = useState<MetadataResult[]>([]);
    const [state, setState] = useState<MetadataSearchState>('off');
    const [nonce, setNonce] = useState(0);
    const latest = useRef(0);

    useEffect(() => {
        const q = query.trim();

        if (!enabled || !providerSearchable(provider)) {
            setResults([]);
            setState('off');
            return;
        }
        if (q.length < providerMinQueryLength(provider)) {
            setResults([]);
            setState(q.length === 0 ? 'off' : 'short');
            return;
        }

        setState('searching');
        const requestId = ++latest.current;
        const timer = window.setTimeout(async () => {
            const { results: found, failed } = await searchMetadataDetailed(provider, q);
            // A newer query started while this one was in flight — drop it.
            if (requestId !== latest.current) return;
            setResults(found);
            setState(failed ? 'error' : found.length > 0 ? 'ready' : 'empty');
        }, DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [provider, query, enabled, nonce]);

    // Invalidate any in-flight response on unmount so it can't set state.
    useEffect(() => () => void ++latest.current, []);

    return { results, state, retry: () => setNonce((n) => n + 1) };
}
