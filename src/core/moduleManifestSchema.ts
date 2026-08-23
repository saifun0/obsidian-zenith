import { isSafeModuleId } from './modulePaths';
import { satisfiesMin } from './semver';

/**
 * Validating a third-party `manifest.json`.
 *
 * Everything in it is a claim by the module's author, and none of it is
 * verified — the UI must say so. What IS enforced here is the small set of
 * facts Zenith relies on structurally: a usable id, a name to show, and a
 * version requirement we can honour.
 */
export interface ThirdPartyManifest {
    id: string;
    name: string;
    description: string;
    /** Normalised to `0.0.0` when the author omitted it. */
    version: string;
    author?: string;
    icon?: string;
    minZenithVersion?: string;
    minAppVersion?: string;
    /** Author's own notes about what the module does. Shown verbatim. */
    notes?: string;
}

export type ManifestProblem =
    | { kind: 'bad-id'; id: unknown }
    | { kind: 'reserved-id'; id: string }
    | { kind: 'missing-name' }
    | { kind: 'incompatible'; required: string; actual: string };

export type ManifestCheck =
    | { ok: true; manifest: ThirdPartyManifest }
    | { ok: false; problem: ManifestProblem };

/**
 * Ids a third-party module may never take.
 *
 * The built-ins are passed in, but this frozen list is checked as well so a
 * module cannot squat an id that a future built-in will want — at which point
 * the collision would appear on upgrade, in the user's vault, with no warning.
 */
const RESERVED_IDS: ReadonlySet<string> = new Set([
    'dashboard',
    'weather',
    'tasks',
    'tasks-calendar',
    'content',
    'journal',
    'media',
    'zenith',
    'settings',
    'core',
]);

function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function validateManifest(
    raw: unknown,
    ctx: { reservedIds?: ReadonlySet<string>; pluginVersion: string }
): ManifestCheck {
    const source = (raw ?? {}) as Record<string, unknown>;

    if (!isSafeModuleId(source.id)) {
        return { ok: false, problem: { kind: 'bad-id', id: source.id } };
    }
    const id = source.id;

    if (RESERVED_IDS.has(id) || ctx.reservedIds?.has(id)) {
        return { ok: false, problem: { kind: 'reserved-id', id } };
    }

    const name = text(source.name);
    if (!name) return { ok: false, problem: { kind: 'missing-name' } };

    const minZenithVersion = text(source.minZenithVersion) || undefined;
    if (!satisfiesMin(ctx.pluginVersion, minZenithVersion)) {
        return {
            ok: false,
            problem: {
                kind: 'incompatible',
                required: minZenithVersion ?? '',
                actual: ctx.pluginVersion,
            },
        };
    }

    return {
        ok: true,
        manifest: {
            id,
            name,
            description: text(source.description),
            version: text(source.version, '0.0.0'),
            author: text(source.author) || undefined,
            icon: text(source.icon) || undefined,
            minZenithVersion,
            minAppVersion: text(source.minAppVersion) || undefined,
            notes: text(source.notes) || undefined,
        },
    };
}

/** A human-readable reason, for the settings row and the install error. */
export function describeManifestProblem(problem: ManifestProblem): string {
    switch (problem.kind) {
        case 'bad-id':
            return `Invalid module id ${JSON.stringify(problem.id)} — use letters, digits, "-" and "_".`;
        case 'reserved-id':
            return `"${problem.id}" is reserved by Zenith and cannot be used by a module.`;
        case 'missing-name':
            return 'The manifest has no "name".';
        case 'incompatible':
            return `Needs Zenith ${problem.required} or newer; this is ${problem.actual}.`;
    }
}
