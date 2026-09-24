import { isSafeModuleId } from './modulePaths';
import { LOCALES, type TranslationTable } from './i18n';
import { msg, type Message } from './message';
import { satisfiesMin } from './semver';
import { parsePermissions, type Permission } from './modulePermissions';

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
    /**
     * Strings by locale, e.g. `{ "ru": { "module.my-mod.name": "Мой модуль" } }`.
     *
     * Here as well as in the module's code because the settings list shows
     * modules that are switched OFF, whose code has therefore never run. The
     * name and description of a module you have not enabled are exactly the
     * text you are reading when you decide whether to enable it.
     */
    translations?: TranslationTable;
    /** What it will do with Zenith — see `modulePermissions`. Empty when it declared none. */
    permissions: Permission[];
    /**
     * 2 when the manifest says so or declares permissions at all — a module
     * that lists what it needs is written against the permission-aware API.
     */
    apiVersion: number;
}

export type ManifestProblem =
    | { kind: 'bad-id'; id: unknown }
    | { kind: 'reserved-id'; id: string }
    | { kind: 'missing-name' }
    | { kind: 'incompatible'; required: string; actual: string }
    | { kind: 'bad-permission'; permission: string };

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
    'study',
    'zenith',
    'settings',
    'core',
]);

function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Read the `translations` object, keeping only locales Zenith knows and values
 * that are actually strings. Namespacing is NOT checked here — `registerTranslations`
 * owns that rule, and enforcing it in two places would let the two disagree.
 */
function translationTable(value: unknown): TranslationTable | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    const out: TranslationTable = {};

    for (const locale of LOCALES) {
        const chunk = source[locale];
        if (!chunk || typeof chunk !== 'object') continue;
        const kept: Record<string, string> = {};
        for (const [key, entry] of Object.entries(chunk as Record<string, unknown>)) {
            if (typeof entry === 'string' && entry.trim()) kept[key] = entry;
        }
        if (Object.keys(kept).length > 0) out[locale] = kept;
    }

    return Object.keys(out).length > 0 ? out : undefined;
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

    // Refused rather than ignored: a misspelt permission would otherwise be a
    // module that fails at the first call, after the user agreed to it.
    const permissions = parsePermissions(source.permissions);
    if (permissions.invalid.length) {
        return { ok: false, problem: { kind: 'bad-permission', permission: permissions.invalid[0] } };
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
            translations: translationTable(source.translations),
            permissions: permissions.permissions,
            apiVersion: source.apiVersion === 2 || Array.isArray(source.permissions) ? 2 : 1,
        },
    };
}

/**
 * The reason, as a key the settings row can translate.
 *
 * Not a finished sentence: this runs during discovery, inside the plugin's
 * `onload`, and the answer is rendered much later by a component that knows
 * which language the user reads.
 */
export function describeManifestProblem(problem: ManifestProblem): Message {
    switch (problem.kind) {
        case 'bad-id':
            return msg('modules.manifest.badId', { id: JSON.stringify(problem.id) });
        case 'reserved-id':
            return msg('modules.manifest.reservedId', { id: problem.id });
        case 'missing-name':
            return msg('modules.manifest.missingName');
        case 'incompatible':
            return msg('modules.manifest.incompatible', {
                required: problem.required,
                actual: problem.actual,
            });
        case 'bad-permission':
            return msg('modules.manifest.badPermission', { permission: problem.permission });
    }
}
