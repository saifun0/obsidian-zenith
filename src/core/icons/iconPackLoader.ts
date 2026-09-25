import type { ModuleFs } from '../moduleFs';
import { isSafeId } from '../pluginPaths';
import { describeSvgProblem } from './iconSvg';
import { isSafeIconName, type IconRegistry, type IconSourceKind } from './iconRegistry';

/**
 * Reading icon packs off disk.
 *
 * A pack is a folder of `.svg` files plus an optional `pack.json` naming it.
 * That is the whole format on purpose: the common case is "someone sent me a
 * zip of icons", and anything requiring a build step or a JSON index would mean
 * the answer to "how do I add my logo" is a paragraph instead of a sentence.
 *
 * Takes a `ModuleFs` rather than touching the adapter, so the failure paths that
 * actually bite — a missing folder, a pack.json that is not JSON, a 3 MB
 * "icon" — are exercised against a fake in tests instead of a real vault.
 */

export interface IconPackReport {
    /** Pack id (its folder name). */
    id: string;
    label: string;
    author?: string;
    loaded: number;
    /** One line per file that could not be used, ready to show. */
    skipped: { file: string; reason: string }[];
}

interface PackManifest {
    name?: string;
    author?: string;
}

function parsePackManifest(raw: string): PackManifest {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const source = parsed as Record<string, unknown>;
        return {
            name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : undefined,
            author:
                typeof source.author === 'string' && source.author.trim()
                    ? source.author.trim()
                    : undefined,
        };
    } catch {
        // A broken pack.json costs the pack its label, not its icons.
        return {};
    }
}

/** `logo.svg` → `logo`. Returns null for anything that isn't a usable icon file. */
export function iconNameFromFile(file: string): string | null {
    if (!file.toLowerCase().endsWith('.svg')) return null;
    const name = file.slice(0, -4);
    return isSafeIconName(name) ? name : null;
}

/**
 * Load every `.svg` in one folder into the registry under `sourceId`.
 *
 * Registers silently and leaves the notification to the caller, so loading
 * twenty packs at startup re-renders the app once rather than twenty times.
 */
export async function loadIconsFromFolder(
    fs: ModuleFs,
    folder: string,
    registry: IconRegistry,
    sourceId: string,
    sourceKind: IconSourceKind,
    options: { label?: string; author?: string } = {}
): Promise<IconPackReport> {
    const report: IconPackReport = {
        id: sourceId,
        label: options.label ?? sourceId,
        author: options.author,
        loaded: 0,
        skipped: [],
    };

    registry.ensureSource(sourceId, sourceKind, report.label, report.author);

    for (const file of await fs.listFiles(folder)) {
        const name = iconNameFromFile(file);
        if (!name) {
            // Silent for non-SVGs: a README or a licence file in a pack folder
            // is normal and reporting it as an error would be noise.
            if (file.toLowerCase().endsWith('.svg')) {
                report.skipped.push({ file, reason: 'Name must be letters, digits, "-" or "_".' });
            }
            continue;
        }

        let raw: string;
        try {
            raw = await fs.read(`${folder}/${file}`);
        } catch {
            report.skipped.push({ file, reason: 'Could not be read.' });
            continue;
        }

        const added = registry.add(sourceId, sourceKind, name, raw, {
            label: report.label,
            author: report.author,
            silent: true,
        });

        if (added.ok) report.loaded++;
        else {
            report.skipped.push({
                file,
                reason:
                    added.problem.kind === 'bad-name'
                        ? 'Name must be letters, digits, "-" or "_".'
                        : describeSvgProblem(added.problem),
            });
        }
    }

    return report;
}

/**
 * Discover and load every pack under `root`.
 *
 * A missing root is the normal state for a fresh install, not an error — nobody
 * should have to create a folder before the feature stops warning at them.
 */
export async function loadIconPacks(
    fs: ModuleFs,
    root: string,
    registry: IconRegistry
): Promise<IconPackReport[]> {
    const reports: IconPackReport[] = [];

    for (const id of await fs.listFolders(root)) {
        // The folder name becomes the icon id's source segment, so it is
        // validated with the same rule that keeps a module id from escaping.
        if (!isSafeId(id)) continue;

        const folder = `${root}/${id}`;
        let manifest: PackManifest = {};
        const manifestPath = `${folder}/pack.json`;
        if (await fs.exists(manifestPath)) {
            try {
                manifest = parsePackManifest(await fs.read(manifestPath));
            } catch {
                manifest = {};
            }
        }

        reports.push(
            await loadIconsFromFolder(fs, folder, registry, id, 'pack', {
                label: manifest.name ?? id,
                author: manifest.author,
            })
        );
    }

    // One notification for the whole sweep.
    registry.emit();
    return reports;
}
