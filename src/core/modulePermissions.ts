/**
 * What a third-party module says it will do with Zenith, declared in its
 * `manifest.json`:
 *
 * ```json
 * "permissions": ["tasks:read", "ui:slots", "network:api.example.com"]
 * ```
 *
 * A permission is a contract, not a wall. Module code runs with the same reach
 * as any Obsidian plugin (see `moduleEval`), so nothing here can stop a module
 * that sets out to misbehave. What the list does do: it is shown in words in
 * the consent dialog; the API hands a module only the parts it declared, with
 * a clear error for the rest, so an honest module cannot drift past what the
 * user agreed to; a change to the list asks again; and whoever reviews the
 * code knows what to look for. The real protection is still consent, the
 * pinned hash and readable source.
 */

/** Permissions without an argument. */
export const PLAIN_PERMISSIONS = [
    'tasks:read',
    'tasks:write',
    'journal:read',
    'journal:write',
    'content:read',
    'content:write',
    'content:metadata',
    'calendar:layers',
    'prayer:provider',
    'ui:slots',
    'features',
] as const;
export type PlainPermission = (typeof PLAIN_PERMISSIONS)[number];

/** `settings:<module>` — fields on a built-in module's settings page. */
const SETTINGS = /^settings:([a-z0-9][a-z0-9-]*)$/;
/** `network:<host>` — requests to exactly that host. */
const NETWORK = /^network:((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/;

export type Permission = PlainPermission | `settings:${string}` | `network:${string}`;

export function isPermission(value: string): value is Permission {
    return (
        (PLAIN_PERMISSIONS as readonly string[]).includes(value) ||
        SETTINGS.test(value) ||
        NETWORK.test(value)
    );
}

export interface PermissionList {
    permissions: Permission[];
    /** Entries that are not a permission — a typo must not pass for nothing. */
    invalid: string[];
}

/** The manifest's list, lower-cased, deduplicated and sorted. */
export function parsePermissions(raw: unknown): PermissionList {
    if (raw === undefined) return { permissions: [], invalid: [] };
    if (!Array.isArray(raw)) {
        const shown = typeof raw === 'string' ? raw : (JSON.stringify(raw) ?? typeof raw);
        return { permissions: [], invalid: [shown] };
    }
    const permissions = new Set<Permission>();
    const invalid: string[] = [];
    for (const entry of raw) {
        const value = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
        if (value && isPermission(value)) permissions.add(value);
        else invalid.push(String(entry));
    }
    return { permissions: [...permissions].sort(), invalid };
}

/** Whether two lists grant the same — the question behind asking again. */
export function samePermissions(a: readonly string[] = [], b: readonly string[] = []): boolean {
    const x = [...new Set(a)].sort();
    const y = [...new Set(b)].sort();
    return x.length === y.length && x.every((p, i) => p === y[i]);
}

/** A permission in words: the key to translate, and what goes into it. */
export function describePermission(permission: string): {
    key: string;
    params: Record<string, string>;
} {
    const settings = SETTINGS.exec(permission);
    if (settings) return { key: 'permission.settings', params: { module: settings[1] } };
    const network = NETWORK.exec(permission);
    if (network) return { key: 'permission.network', params: { host: network[1] } };
    return { key: `permission.${permission.replace(':', '.')}`, params: {} };
}

/** The host a URL goes to, when it is a web address at all. */
export function hostOf(url: string): string | null {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:'
            ? parsed.hostname.toLowerCase()
            : null;
    } catch {
        return null;
    }
}

export class ZenithPermissionError extends Error {
    constructor(
        readonly moduleId: string,
        readonly permission: string
    ) {
        super(
            `Zenith: module "${moduleId}" needs the "${permission}" permission for this. ` +
                `Add it to "permissions" in its manifest.json — the user is asked to agree again.`
        );
        this.name = 'ZenithPermissionError';
    }
}

/** Permission checks for one module. */
export function permissionGuard(moduleId: string, granted: readonly string[]) {
    const set = new Set(granted);
    return {
        has: (permission: string) => set.has(permission),
        require(permission: string): void {
            if (!set.has(permission)) throw new ZenithPermissionError(moduleId, permission);
        },
        /** `network:<host>` for the URL's host, or an error naming it. */
        requireUrl(url: string): void {
            const host = hostOf(url);
            if (!host) throw new Error(`Zenith: "${url}" is not a web address.`);
            if (!set.has(`network:${host}`))
                throw new ZenithPermissionError(moduleId, `network:${host}`);
        },
    };
}
