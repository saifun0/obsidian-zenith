import { App, TFolder, getIconIds, normalizePath } from 'obsidian';
import { toLocalIsoDate } from './dateUtils';
import { useZenithStore } from '../store';

export interface VaultFolderSpec {
    name: string;
    /** Icon id assigned in the file explorer when the folder has none yet. */
    icon: string;
}

/**
 * The opinionated "Johnny-Decimal"-style folder taxonomy the Vault Setup button
 * scaffolds. Order matters only for display; each is created at the vault root.
 *
 * Each folder carries its icon, because a scaffolded vault that then needs nine
 * right-click-and-pick trips to look finished isn't really scaffolded. Ids are
 * whatever `getIconIds()` reports — Obsidian's lucide names are `lucide-`
 * prefixed there, and its own glyphs are not. Change one here and the button
 * hands it out from then on; a folder the user has already given an icon is
 * never overwritten.
 */
export const VAULT_STRUCTURE: readonly VaultFolderSpec[] = [
    { name: '00 Files', icon: 'lucide-folder-open' },
    { name: '10 Inbox', icon: 'lucide-lightbulb' },
    { name: '15 Journal', icon: 'lucide-bookmark' },
    { name: '20 Projects', icon: 'lucide-chart-no-axes-column-increasing' },
    { name: '30 Content', icon: 'lucide-film' },
    // Not a lucide id — Obsidian ships its own glyphs alongside them, and the
    // picker offers both, so an id here may come from either set.
    { name: '40 Resources', icon: 'box-glyph' },
    { name: '45 Study', icon: 'lucide-school' },
    { name: '50 Archive', icon: 'lucide-archive' },
    { name: '99 Trash', icon: 'lucide-trash-2' },
];

const ARCHIVE_ROOT = '50 Archive';

export interface ScaffoldResult {
    created: string[];
    archived: number;
    archiveDest: string | null;
    /** Folders that gained an icon (those that already had one are untouched). */
    iconed: number;
}

/**
 * VaultScaffoldService — creates the standard folder structure and archives all
 * pre-existing top-level content into `50 Archive/Archived <timestamp>/`.
 *
 * This is destructive (it moves the user's existing files), so callers MUST
 * confirm with the user first (see VaultScaffoldModal). Moves go through
 * `fileManager.renameFile` so internal links are preserved.
 */
export class VaultScaffoldService {
    constructor(private readonly app: App) {}

    /** Top-level items that would be archived (everything except the archive folder). */
    itemsToArchive(): string[] {
        return this.app.vault
            .getRoot()
            .children.filter((f) => f.path !== ARCHIVE_ROOT)
            .map((f) => f.name);
    }

    async scaffold(): Promise<ScaffoldResult> {
        const root = this.app.vault.getRoot();

        // Snapshot BEFORE we create anything, so freshly-made folders aren't archived.
        const existing = root.children.slice();
        const toMove = existing.filter((f) => f.path !== ARCHIVE_ROOT);

        // 1. Ensure the archive root exists.
        await this.ensureFolder(ARCHIVE_ROOT);

        // 2. Move all pre-existing top-level items into a timestamped archive subfolder.
        let archived = 0;
        let archiveDest: string | null = null;
        if (toMove.length > 0) {
            archiveDest = `${ARCHIVE_ROOT}/Archived ${this.timestamp()}`;
            await this.ensureFolder(archiveDest);
            for (const file of toMove) {
                const target = normalizePath(`${archiveDest}/${file.name}`);
                try {
                    await this.app.fileManager.renameFile(file, target);
                    archived++;
                } catch (err) {
                    console.error(`Zenith: failed to archive "${file.path}"`, err);
                }
            }
        }

        // 3. Create the (now empty) structure folders.
        const created: string[] = [];
        for (const { name } of VAULT_STRUCTURE) {
            if (!this.app.vault.getAbstractFileByPath(name)) {
                await this.ensureFolder(name);
                created.push(name);
            }
        }

        // 4. Label them.
        const iconed = this.assignIcons();

        return { created, archived, archiveDest, iconed };
    }

    /**
     * Give each structure folder its icon.
     *
     * Applied to the whole structure rather than only to folders created just
     * now, so re-running the button repairs a vault whose icons were never set
     * — but an assignment the user made themselves always wins, which is what
     * makes the action safe to repeat.
     *
     * Unknown ids are skipped rather than stored: `setIcon` renders nothing for
     * a name Obsidian doesn't have, and a blank space where an icon should be is
     * harder to diagnose than no icon at all.
     */
    private assignIcons(): number {
        const known = new Set(getIconIds());
        const current = useZenithStore.getState().settings.folderIcons;
        const next = { ...current };
        let iconed = 0;

        for (const { name, icon } of VAULT_STRUCTURE) {
            if (next[name]) continue;
            // Obsidian reports built-ins both bare and `lucide-` prefixed
            // depending on version; accept whichever this one has.
            const resolved = known.has(icon)
                ? icon
                : known.has(`lucide-${icon}`)
                  ? `lucide-${icon}`
                  : null;
            if (!resolved) {
                console.warn(`Zenith: no icon "${icon}" for "${name}" — left unset.`);
                continue;
            }
            next[name] = resolved;
            iconed++;
        }

        if (iconed > 0) useZenithStore.getState().updateSettings({ folderIcons: next });
        return iconed;
    }

    private timestamp(): string {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${toLocalIsoDate(now)} ${hh}-${mm}`;
    }

    private async ensureFolder(path: string): Promise<void> {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFolder) return;
        try {
            await this.app.vault.createFolder(path);
        } catch {
            // Concurrent creation / already exists — safe to ignore.
        }
    }
}
