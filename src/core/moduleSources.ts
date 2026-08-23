import { requestUrl, type DataAdapter } from 'obsidian';
import { validateManifest, type ThirdPartyManifest } from './moduleManifestSchema';

/**
 * Getting a module's files from wherever the user keeps them.
 *
 * Resolution only — nothing here writes to disk. `moduleInstaller` downloads
 * and validates everything into memory first and only then writes, which gets
 * near-atomic installs without temp files.
 */

export type ModuleSourceKind = 'github' | 'url' | 'vault' | 'paste';

export interface ModuleSource {
    kind: ModuleSourceKind;
    /**
     * github: `owner/repo`, optionally `owner/repo@ref` or `owner/repo@ref:subdir`
     * url:    absolute https URL to manifest.json (or main.js)
     * vault:  vault-relative path to the .js file
     * paste:  empty
     */
    ref: string;
    /** The tag or branch actually used, filled in at install time. */
    resolvedRef?: string;
}

export interface ModulePayload {
    manifest: ThirdPartyManifest;
    code: string;
    styles?: string;
    /** Human-readable origin for the consent screen. Never truncated. */
    origin: string;
    resolvedRef?: string;
}

export class SourceError extends Error {
    constructor(
        message: string,
        readonly detail?: string
    ) {
        super(message);
        this.name = 'SourceError';
    }
}

export interface GithubRef {
    owner: string;
    repo: string;
    ref?: string;
    subdir?: string;
}

/** `owner/repo`, `owner/repo@v1.2.0`, `owner/repo@main:packages/mod`. */
export function parseGithubRef(input: string): GithubRef | null {
    const trimmed = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
    const match = trimmed.match(
        /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:@([A-Za-z0-9._/-]+?))?(?::([A-Za-z0-9._/-]+))?$/
    );
    if (!match) return null;
    return {
        owner: match[1],
        repo: match[2],
        ref: match[3] || undefined,
        subdir: match[4]?.replace(/^\/+|\/+$/g, '') || undefined,
    };
}

/** Fetch text, or null on any non-2xx. `throw: false` keeps 404 out of the catch. */
async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await requestUrl({ url, throw: false });
        if (res.status < 200 || res.status >= 300) return null;
        return res.text;
    } catch {
        return null;
    }
}

interface ReleaseAsset {
    name?: string;
    browser_download_url?: string;
}

/** The three files a module can ship, keyed by the name we look for. */
const ASSET_NAMES = { manifest: 'manifest.json', main: 'main.js', styles: 'styles.css' };

async function fromGithubRelease(ref: GithubRef): Promise<ModulePayload | null> {
    let json: { tag_name?: string; assets?: ReleaseAsset[] } | undefined;
    try {
        const res = await requestUrl({
            url: `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases/latest`,
            headers: { Accept: 'application/vnd.github+json' },
            throw: false,
        });
        // 404 = no releases; 403 = anonymous rate limit (60/hour, and it is 403,
        // not 429). Both mean "try the raw files instead", not "give up".
        if (res.status !== 200) return null;
        json = res.json;
    } catch {
        return null;
    }

    const assets = json?.assets ?? [];
    const find = (name: string) =>
        assets.find((a) => a.name?.toLowerCase() === name)?.browser_download_url;

    const manifestUrl = find(ASSET_NAMES.manifest);
    const mainUrl = find(ASSET_NAMES.main);
    if (!manifestUrl || !mainUrl) return null;

    // requestUrl follows the redirect to objects.githubusercontent.com.
    const [manifestText, code] = await Promise.all([fetchText(manifestUrl), fetchText(mainUrl)]);
    if (!manifestText || !code) return null;

    const stylesUrl = find(ASSET_NAMES.styles);
    return {
        manifest: JSON.parse(manifestText),
        code,
        styles: stylesUrl ? ((await fetchText(stylesUrl)) ?? undefined) : undefined,
        origin: `github.com/${ref.owner}/${ref.repo} @ ${json?.tag_name ?? 'latest'}`,
        resolvedRef: json?.tag_name,
    };
}

async function fromGithubRaw(ref: GithubRef): Promise<ModulePayload | null> {
    // An explicit ref wins; otherwise try both common default branch names.
    const branches = ref.ref ? [ref.ref] : ['main', 'master'];
    const prefix = ref.subdir ? `${ref.subdir}/` : '';

    for (const branch of branches) {
        const base = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${prefix}`;
        const manifestText = await fetchText(`${base}${ASSET_NAMES.manifest}`);
        if (!manifestText) continue;
        const code = await fetchText(`${base}${ASSET_NAMES.main}`);
        if (!code) continue;

        return {
            manifest: JSON.parse(manifestText),
            code,
            styles: (await fetchText(`${base}${ASSET_NAMES.styles}`)) ?? undefined,
            origin: `github.com/${ref.owner}/${ref.repo} @ ${branch}`,
            resolvedRef: branch,
        };
    }
    return null;
}

async function resolveGithub(rawRef: string): Promise<ModulePayload> {
    const ref = parseGithubRef(rawRef);
    if (!ref) {
        throw new SourceError('Expected "owner/repo", optionally "owner/repo@tag" or "@branch:subdir".');
    }

    const release = await fromGithubRelease(ref);
    if (release) return release;

    const raw = await fromGithubRaw(ref);
    if (raw) return raw;

    throw new SourceError(
        `Could not find manifest.json and main.js in ${ref.owner}/${ref.repo}.`,
        ref.ref
            ? `Checked the "${ref.ref}" ref.`
            : 'Checked the latest release, then the "main" and "master" branches. ' +
              'GitHub also rate-limits anonymous requests to 60 per hour.'
    );
}

/** Swap the last path segment of a URL. */
function sibling(url: string, filename: string): string {
    return url.replace(/[^/]*$/, filename);
}

async function resolveUrl(rawUrl: string): Promise<ModulePayload> {
    const url = rawUrl.trim();
    // Only https: `http:` is interceptable, and `file:`/`data:` would let a
    // pasted string smuggle in code with no origin to show the user.
    if (!/^https:\/\//i.test(url)) {
        throw new SourceError('Only https:// URLs are supported.');
    }

    const manifestUrl = url.endsWith('.js') ? sibling(url, ASSET_NAMES.manifest) : url;
    const mainUrl = url.endsWith('.js') ? url : sibling(url, ASSET_NAMES.main);

    const [manifestText, code] = await Promise.all([fetchText(manifestUrl), fetchText(mainUrl)]);
    if (!manifestText) throw new SourceError(`No manifest.json at ${manifestUrl}`);
    if (!code) throw new SourceError(`No main.js at ${mainUrl}`);

    return {
        manifest: JSON.parse(manifestText),
        code,
        styles: (await fetchText(sibling(url, ASSET_NAMES.styles))) ?? undefined,
        origin: url,
    };
}

/**
 * A manifest embedded in the module's own source, as a leading block comment:
 *
 *   /* zenith-module
 *   { "id": "my-module", "name": "My Module", "version": "1.0.0" }
 *   *\/
 *
 * This exists so a single `.js` file dropped into the vault from an iPhone is
 * installable — there is no second file to place beside it, and no reliable way
 * to unzip an archive without pulling in a DEFLATE implementation.
 */
const EMBEDDED_MANIFEST = /^\s*\/\*\s*zenith-module\s*([\s\S]*?)\*\//;

export function readEmbeddedManifest(code: string): unknown | null {
    const match = code.match(EMBEDDED_MANIFEST);
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

async function resolveVault(path: string, adapter: DataAdapter): Promise<ModulePayload> {
    const file = path.trim();
    if (!file.toLowerCase().endsWith('.js')) {
        throw new SourceError('Pick a .js file. Zip archives are not supported.');
    }
    if (!(await adapter.exists(file))) throw new SourceError(`No such file: ${file}`);

    const code = await adapter.read(file);

    // A sibling manifest.json wins; otherwise look for one embedded in the file.
    const siblingPath = file.replace(/[^/]*$/, ASSET_NAMES.manifest);
    let manifest: unknown = null;
    if (await adapter.exists(siblingPath)) {
        try {
            manifest = JSON.parse(await adapter.read(siblingPath));
        } catch {
            throw new SourceError(`${siblingPath} is not valid JSON.`);
        }
    } else {
        manifest = readEmbeddedManifest(code);
    }

    if (!manifest) {
        throw new SourceError(
            'No manifest found.',
            'Put a manifest.json next to the file, or start the file with a ' +
                '/* zenith-module { ... } */ header.'
        );
    }

    return { manifest: manifest as ThirdPartyManifest, code, origin: `vault: ${file}` };
}

export interface ResolveContext {
    adapter: DataAdapter;
    pluginVersion: string;
    reservedIds?: ReadonlySet<string>;
    paste?: { manifest: string; code: string };
}

/** Fetch and validate a module's files. Throws `SourceError` with a reason. */
export async function resolveSource(
    source: ModuleSource,
    ctx: ResolveContext
): Promise<ModulePayload> {
    let payload: ModulePayload;

    switch (source.kind) {
        case 'github':
            payload = await resolveGithub(source.ref);
            break;
        case 'url':
            payload = await resolveUrl(source.ref);
            break;
        case 'vault':
            payload = await resolveVault(source.ref, ctx.adapter);
            break;
        case 'paste': {
            if (!ctx.paste) throw new SourceError('Nothing pasted.');
            let manifest: unknown;
            try {
                manifest = JSON.parse(ctx.paste.manifest);
            } catch {
                throw new SourceError('The manifest is not valid JSON.');
            }
            if (!ctx.paste.code.trim()) throw new SourceError('The code box is empty.');
            payload = {
                manifest: manifest as ThirdPartyManifest,
                code: ctx.paste.code,
                origin: 'pasted by you',
            };
            break;
        }
    }

    // Validate at the end, once, wherever the files came from.
    const checked = validateManifest(payload.manifest, {
        pluginVersion: ctx.pluginVersion,
        reservedIds: ctx.reservedIds,
    });
    if (!checked.ok) {
        const { describeManifestProblem } = await import('./moduleManifestSchema');
        throw new SourceError(describeManifestProblem(checked.problem));
    }

    return { ...payload, manifest: checked.manifest };
}
