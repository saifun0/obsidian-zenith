import { App, TFile } from 'obsidian';
import { IMAGE_EXTENSIONS } from '../../core/constants';

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTENSIONS);

export interface VaultImage {
    path: string;
    /** The file's name without its extension. */
    name: string;
    /** When it was last changed, for "newest first". */
    mtime: number;
}

/** Whether a reference is a remote/absolute URL rather than a vault path. */
export function isRemoteRef(ref: string): boolean {
    return /^(https?:|data:|app:|file:)/i.test(ref.trim());
}

/**
 * Resolve an image reference (URL or vault path) to a usable `src`.
 * Returns null if a vault path can't be resolved to a file.
 */
export function resolveMediaSrc(app: App, ref: string): string | null {
    const r = ref.trim();
    if (!r) return null;
    if (isRemoteRef(r)) return r;
    const file =
        app.vault.getAbstractFileByPath(r) ?? app.metadataCache.getFirstLinkpathDest(r, '');
    if (file instanceof TFile) return app.vault.getResourcePath(file);
    return null;
}

/**
 * All image files in the vault, newest first: the picture someone opens the
 * picker for is usually the one they have just saved.
 */
export function getVaultImages(app: App): VaultImage[] {
    return app.vault
        .getFiles()
        .filter((f) => IMAGE_EXT_SET.has(f.extension.toLowerCase()))
        .map((f) => ({ path: f.path, name: f.basename, mtime: f.stat.mtime }))
        .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
}

/** A short display label for a reference (filename / URL basename). */
export function mediaLabel(ref: string): string {
    const r = ref.trim();
    // A picture carried in the address itself has no name to show, and the
    // address is the whole picture in base64.
    if (/^data:/i.test(r)) return '';
    if (isRemoteRef(r)) {
        try {
            return decodeURIComponent(new URL(r).pathname.split('/').pop() || r);
        } catch {
            return r;
        }
    }
    return r.split('/').pop() || r;
}

/** {@link mediaLabel} without the extension — what a tile is captioned with. */
export function mediaTitle(ref: string): string {
    const label = mediaLabel(ref);
    const dot = label.lastIndexOf('.');
    return dot > 0 && label.length - dot <= 6 ? label.slice(0, dot) : label;
}

/** Where a reference comes from, said briefly: a site's host, or a folder in the vault. */
export function mediaSource(ref: string): string {
    const r = ref.trim();
    if (/^data:/i.test(r)) return '';
    if (isRemoteRef(r)) {
        try {
            return new URL(r).host.replace(/^www\./, '');
        } catch {
            return '';
        }
    }
    const slash = r.lastIndexOf('/');
    return slash > 0 ? r.slice(0, slash) : '';
}

/**
 * How many of the vault's pictures the picker draws at once. A vault of notes
 * with screenshots holds thousands; the newest of them are the likely ones,
 * and the rest are a search away.
 */
export const PICKER_LIMIT = 120;

/** What the picker shows for what has been typed. */
export interface PickerView {
    /** What was typed is a link: it alone is shown, to be taken or not. */
    link: string | null;
    /** The saved references that match. */
    saved: string[];
    /** The vault's pictures that match and are not saved — those are above. */
    vault: VaultImage[];
    /** Matching pictures left out, past {@link PICKER_LIMIT}. */
    more: number;
}

/**
 * One line serves for both things the picker used to have a field each for:
 * finding a picture and giving it the address of one. A link is not a search —
 * nothing in the vault is called `https://…` — so the two never collide.
 */
export function pickerView(
    query: string,
    saved: readonly string[],
    images: readonly VaultImage[],
    limit = PICKER_LIMIT
): PickerView {
    const q = query.trim();
    if (q && isRemoteRef(q)) return { link: q, saved: [], vault: [], more: 0 };

    const needle = q.toLowerCase();
    const has = (...texts: string[]) => !needle || texts.some((t) => t.toLowerCase().includes(needle));
    const kept = new Set(saved);
    const vault = images.filter((img) => !kept.has(img.path) && has(img.name, img.path));
    return {
        link: null,
        saved: saved.filter((ref) => has(ref, mediaLabel(ref))),
        vault: vault.slice(0, limit),
        more: Math.max(0, vault.length - limit),
    };
}
