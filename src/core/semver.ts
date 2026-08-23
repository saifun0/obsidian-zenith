/**
 * Version comparison, tolerant of what people actually write in a manifest.
 *
 * A third-party manifest is hand-authored, so it will contain `1.2`, `v1.2.0`,
 * `1.2.0-beta.1` and occasionally nonsense. Refusing to install over a version
 * string would be worse than comparing it loosely, so unparseable input sorts
 * as equal rather than throwing.
 */

interface Parsed {
    parts: number[];
    /** Present means a pre-release, which sorts BELOW the same release. */
    prerelease: string | null;
}

function parse(version: string): Parsed | null {
    if (typeof version !== 'string') return null;
    const cleaned = version.trim().replace(/^v/i, '');
    if (!cleaned) return null;

    const [core, ...rest] = cleaned.split('-');
    const parts = core.split('.').map((p) => Number.parseInt(p, 10));
    if (!parts.length || parts.some((p) => Number.isNaN(p))) return null;

    return { parts, prerelease: rest.length ? rest.join('-') : null };
}

/** -1 if a < b, 1 if a > b, 0 if equal or either is unparseable. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
    const pa = parse(a);
    const pb = parse(b);
    if (!pa || !pb) return 0;

    // Compare position by position, treating a missing segment as 0 so that
    // "1.2" and "1.2.0" are the same version.
    const length = Math.max(pa.parts.length, pb.parts.length);
    for (let i = 0; i < length; i++) {
        const va = pa.parts[i] ?? 0;
        const vb = pb.parts[i] ?? 0;
        if (va < vb) return -1;
        if (va > vb) return 1;
    }

    // Same numbers: a pre-release precedes the release it leads to.
    if (pa.prerelease && !pb.prerelease) return -1;
    if (!pa.prerelease && pb.prerelease) return 1;
    if (pa.prerelease && pb.prerelease) {
        if (pa.prerelease < pb.prerelease) return -1;
        if (pa.prerelease > pb.prerelease) return 1;
    }
    return 0;
}

/**
 * Whether `actual` satisfies a minimum. No minimum means yes — a manifest that
 * declares no requirement is not making a claim we should second-guess.
 */
export function satisfiesMin(actual: string, min: string | undefined): boolean {
    if (!min) return true;
    return compareVersions(actual, min) >= 0;
}
