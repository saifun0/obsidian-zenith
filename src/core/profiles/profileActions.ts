import { normalizePath, TFile, TFolder, type App } from 'obsidian';
import { useZenithStore } from '../../store';
import type { ZenithSettings } from '../../store/settingsSlice';
import {
    profileFileName,
    profilePatch,
    serializeProfile,
    undoFor,
    type ApplyMode,
    type ModuleContext,
    type Profile,
} from './profiles';
import { TEMPLATE_UNTOUCHED } from './templates';

/** Where exported profiles go. */
export const PROFILES_FOLDER = 'Zenith/profiles';

/**
 * The modules a profile speaks for. A template leaves sync alone; a profile
 * someone saved or exported speaks for every built-in module, since it was
 * taken from a whole state.
 */
export function moduleContext(template: boolean): ModuleContext {
    const available = useZenithStore.getState().availableModules;
    const builtIn = available
        .filter((m) => m.isBuiltIn)
        .map((m) => m.id)
        .filter((id) => !template || !TEMPLATE_UNTOUCHED.includes(id));
    return { builtIn, available: available.map((m) => m.id) };
}

/** The change a profile would make right now. */
export function pendingPatch(
    profile: Profile,
    mode: ApplyMode,
    template: boolean
): Partial<ZenithSettings> {
    return profilePatch(useZenithStore.getState().settings, profile, mode, moduleContext(template));
}

/**
 * Apply a profile, keeping what it changed so it can be put back.
 *
 * Returns false when there was nothing to change — the undo from the apply
 * before is then kept rather than replaced by an empty one.
 */
export function applyProfile(
    profile: Profile,
    mode: ApplyMode,
    template: boolean,
    name: string
): boolean {
    const { settings, updateSettings } = useZenithStore.getState();
    const patch = profilePatch(settings, profile, mode, moduleContext(template));
    if (Object.keys(patch).length === 0) return false;
    updateSettings({
        ...patch,
        profileUndo: { name, at: Date.now(), before: undoFor(settings, patch) },
    });
    return true;
}

/** Put back what the last apply changed, exactly as it was. */
export function undoProfile(): boolean {
    const { settings, updateSettings } = useZenithStore.getState();
    const undo = settings.profileUndo;
    if (!undo) return false;
    updateSettings({ ...undo.before, profileUndo: null });
    return true;
}

/**
 * Write a profile to `Zenith/profiles/<name>.json`.
 *
 * A file already there is not overwritten — it may be one somebody edited by
 * hand, or another person's profile with the same name. The new one gets a
 * number instead, and the path it landed at is returned.
 */
export async function exportToVault(app: App, profile: Profile): Promise<string> {
    const folder = normalizePath(PROFILES_FOLDER);
    let path = '';
    let built = '';
    for (const part of folder.split('/')) {
        built = built ? `${built}/${part}` : part;
        if (!(app.vault.getAbstractFileByPath(built) instanceof TFolder)) {
            try {
                await app.vault.createFolder(built);
            } catch {
                // Created meanwhile — fine.
            }
        }
    }
    const file = profileFileName(profile.name);
    const base = file.replace(/\.json$/, '');
    for (let n = 1; ; n++) {
        path = normalizePath(`${folder}/${n === 1 ? file : `${base} (${n}).json`}`);
        if (!app.vault.getAbstractFileByPath(path)) break;
    }
    await app.vault.create(path, serializeProfile(profile));
    return path;
}

/** JSON files anywhere in the vault, the profiles folder's first. */
export function profileFiles(app: App): TFile[] {
    const inFolder = (f: TFile) => f.path.startsWith(`${normalizePath(PROFILES_FOLDER)}/`);
    return app.vault
        .getFiles()
        .filter((f) => f.extension === 'json')
        .sort((a, b) => Number(inFolder(b)) - Number(inFolder(a)) || a.path.localeCompare(b.path));
}
