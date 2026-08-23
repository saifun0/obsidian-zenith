import type { MetadataProviderId } from '../../../../core/contentTypes';
import { searchMetadata } from './index';
import type { MetadataResult } from './types';

/**
 * Re-fetch the metadata for an item that was auto-filled once before.
 *
 * The providers only expose search, not lookup-by-id, so this searches the
 * title and then prefers the hit whose `sourceId` matches what was stored —
 * which is what those ids were saved for. Without that check a re-sync could
 * silently rebind an item to a different work with a similar name.
 *
 * Resolves to null when nothing plausible comes back, so the caller can say
 * "couldn't refresh" rather than overwrite good data with a wrong match.
 */
export async function findRefreshedMetadata(
    provider: MetadataProviderId,
    title: string,
    sourceId?: string
): Promise<MetadataResult | null> {
    const query = title.trim();
    if (!query) return null;

    const results = await searchMetadata(provider, query);
    if (results.length === 0) return null;

    if (sourceId) {
        const exact = results.find((r) => r.sourceId === sourceId);
        if (exact) return exact;
    }

    // No stored id (or it's gone): only accept an unambiguous title match,
    // rather than whatever happened to rank first.
    const normalized = query.toLowerCase();
    return results.find((r) => r.title.toLowerCase() === normalized) ?? null;
}
