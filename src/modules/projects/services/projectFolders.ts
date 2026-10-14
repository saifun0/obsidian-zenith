import { Notice, TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { translatorNow } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import type ZenithPlugin from '../../../main';
import type { Project } from '../projectsTypes';
import { dirOf, folderHomeOf, nameOf, pairedRename } from './projectLayout';

/**
 * A project and its folder, in the vault.
 *
 * `projectLayout` says what the rules are; this is where files are moved by
 * them. Every move goes through Obsidian's own renaming (`fileManager`), which
 * is what repairs the links that point at what moved — a task that says
 * `[[Zenith]]` still means the project after its note has gone into a folder.
 */

/** What a folder holds, by name. The vault's top is the folder named nothing. */
function namesIn(app: App, folderPath: string): string[] {
    const folder = folderPath ? app.vault.getAbstractFileByPath(folderPath) : app.vault.getRoot();
    return folder instanceof TFolder ? folder.children.map((child) => child.name) : [];
}

/**
 * Give a project that is a note by itself a folder of its own: `Name.md`
 * becomes `Name/Name.md`.
 *
 * A folder of that name which is already there is used — it is, as often as
 * not, where the project's material has been kept all along. Unless it is a
 * project already, with a main note of its own: then nothing is moved, and
 * the answer is `taken`.
 */
export async function moveIntoFolder(app: App, file: TFile): Promise<'moved' | 'taken'> {
    const home = folderHomeOf(file.path);
    const wanted = nameOf(home.folderPath).toLowerCase();
    // Looked up among what stands beside the note, by name and without regard
    // to case: `getAbstractFileByPath` is exact, and the file system may not be.
    const parent = file.parent ?? app.vault.getRoot();
    const there = parent.children.find(
        (child) => child !== file && child.name.toLowerCase() === wanted
    );

    let folderPath = home.folderPath;
    if (there instanceof TFolder) {
        const hasMain = there.children.some(
            (child) =>
                child instanceof TFile &&
                child.extension === 'md' &&
                child.basename.toLowerCase() === there.name.toLowerCase()
        );
        if (hasMain) return 'taken';
        folderPath = there.path;
    } else if (there) {
        return 'taken';
    } else {
        await app.vault.createFolder(folderPath);
    }

    await app.fileManager.renameFile(file, `${folderPath}/${file.name}`);
    return 'moved';
}

/** Move one project into its own folder, and say what happened. */
export async function moveProjectIntoFolder(plugin: ZenithPlugin, project: Project): Promise<void> {
    const t = translatorNow();
    const file = plugin.app.vault.getAbstractFileByPath(project.filePath);
    if (!(file instanceof TFile) || project.folderPath) return;
    try {
        const result = await moveIntoFolder(plugin.app, file);
        new Notice(
            t(result === 'moved' ? 'projects.notice.moved' : 'projects.notice.folderTaken', {
                name: project.title,
            })
        );
        if (result === 'moved') await plugin.dataService.reloadProjects();
    } catch (err) {
        console.error('Zenith: failed to move the project into a folder:', err);
        new Notice(t('projects.notice.failed'));
    }
}

/**
 * Every project that is still a note by itself, into a folder of its own.
 *
 * One at a time and in order: two renames at once in one folder is how a file
 * tree ends up half moved. A project whose folder is taken is left where it
 * is and counted, so the notice can say how many were.
 */
export async function moveAllProjectsIntoFolders(plugin: ZenithPlugin): Promise<void> {
    const t = translatorNow();
    const flat = useZenithStore.getState().projects.filter((project) => !project.folderPath);
    if (flat.length === 0) {
        new Notice(t('projects.notice.allInFolders'));
        return;
    }

    let moved = 0;
    let left = 0;
    for (const project of flat) {
        const file = plugin.app.vault.getAbstractFileByPath(project.filePath);
        if (!(file instanceof TFile)) continue;
        try {
            if ((await moveIntoFolder(plugin.app, file)) === 'moved') moved++;
            else left++;
        } catch (err) {
            console.error(`Zenith: failed to move "${project.filePath}" into a folder:`, err);
            left++;
        }
    }
    await plugin.dataService.reloadProjects();
    new Notice(
        left > 0
            ? t('projects.notice.movedSome', { moved, left })
            : t.plural('projects.notice.movedAll', moved)
    );
}

/**
 * After a rename in the file tree: if it was a project's folder or its main
 * note, rename the other to match (`pairedRename`).
 *
 * Returns what it did, for whoever is listening; nothing when the rename was
 * not one of a pair, or was the answer to one this function made itself.
 */
export async function keepNamesPaired(
    app: App,
    root: string,
    file: TAbstractFile,
    oldPath: string
): Promise<{ from: string; to: string } | null> {
    const move = pairedRename(
        { path: file.path, oldPath, isFolder: file instanceof TFolder },
        root,
        (folder) => namesIn(app, folder)
    );
    if (!move) return null;
    const target = app.vault.getAbstractFileByPath(move.from);
    if (!target) return null;
    try {
        await app.fileManager.renameFile(target, move.to);
        return move;
    } catch (err) {
        console.error(`Zenith: could not rename "${move.from}" after "${dirOf(move.to)}":`, err);
        return null;
    }
}

/**
 * Show a project's folder in Obsidian's file tree.
 *
 * Through the file explorer's own view, which has no public way to be asked;
 * where that is not there — the core plugin is off, or its view has changed —
 * the answer is `false` and the caller opens the project's note instead.
 */
export function revealFolder(app: App, folderPath: string): boolean {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
    const view = leaf?.view as { revealInFolder?: (target: TAbstractFile) => void } | undefined;
    if (!folder || !leaf || typeof view?.revealInFolder !== 'function') return false;
    void app.workspace.revealLeaf(leaf);
    view.revealInFolder(folder);
    return true;
}
