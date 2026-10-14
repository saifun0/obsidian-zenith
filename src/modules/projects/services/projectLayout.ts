/**
 * Where the projects are, among the files of the projects folder.
 *
 * A project is a note. It may also be a folder: one that holds a note of its
 * own name — `Zenith/Zenith.md` — is the project, that note is its main note,
 * and everything else under the folder is the project's material: its other
 * notes, its pictures, its tasks. A note that is in no such folder is a
 * project by itself, as every project used to be.
 *
 * Three things follow from "everything under the folder is its material":
 *
 * - A note inside a project's folder is not a project. Before there were
 *   folders, every note anywhere under the projects folder was one, and the
 *   minutes of a meeting filed beside a project would have appeared as a
 *   project called "Minutes".
 * - There are no projects inside projects. A folder inside a project's folder
 *   is material even if it holds a note of its own name; its tasks would
 *   otherwise be counted twice, once for the stage and once for the whole.
 * - A folder that holds no note of its own name is only a way of grouping:
 *   `Work/Site/Site.md` is the project "Site", filed under "Work".
 *
 * Names are compared without regard to case, as Obsidian compares them.
 *
 * Pure: paths in, places out. What reads the vault is `ProjectParser`.
 */

export interface ProjectPlace {
    /** The project's note: the main note of its folder, or a note by itself. */
    notePath: string;
    /** The folder that is the project, when it has one. */
    folderPath?: string;
    /** The other notes under that folder. */
    notes: number;
    /** What is under it that is not a note. */
    files: number;
}

export const dirOf = (path: string): string =>
    path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const isNote = (path: string): boolean => /\.md$/i.test(path);
const baseOf = (path: string): string => nameOf(path).replace(/\.md$/i, '');
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const trimSlash = (path: string): string => path.trim().replace(/\/+$/, '');

/**
 * The projects among `paths` — every file under the projects folder `root`,
 * notes and everything else, by vault path.
 */
export function placeProjects(paths: readonly string[], root: string): ProjectPlace[] {
    const top = trimSlash(root);
    if (!top) return [];
    const under = paths.filter((path) => path.startsWith(`${top}/`));

    // Folders that hold a note of their own name. The projects folder itself
    // is not one: a note called after it is a project like any other.
    const mainOf = new Map<string, string>();
    for (const path of under) {
        if (!isNote(path)) continue;
        const dir = dirOf(path);
        if (dir === top || mainOf.has(dir)) continue;
        if (same(baseOf(path), nameOf(dir))) mainOf.set(dir, path);
    }

    // The outermost wins: what is inside a project is that project's.
    const homes: string[] = [];
    for (const dir of [...mainOf.keys()].sort((a, b) => a.length - b.length)) {
        if (!homes.some((home) => dir.startsWith(`${home}/`))) homes.push(dir);
    }

    const folders = new Map<string, ProjectPlace>(
        homes.map((dir) => [
            dir,
            { notePath: mainOf.get(dir) as string, folderPath: dir, notes: 0, files: 0 },
        ])
    );
    const alone: ProjectPlace[] = [];
    for (const path of under) {
        const home = homes.find((dir) => path.startsWith(`${dir}/`));
        if (!home) {
            if (isNote(path)) alone.push({ notePath: path, notes: 0, files: 0 });
            continue;
        }
        const place = folders.get(home) as ProjectPlace;
        if (path === place.notePath) continue;
        if (isNote(path)) place.notes++;
        else place.files++;
    }

    return [...folders.values(), ...alone].sort((a, b) => a.notePath.localeCompare(b.notePath));
}

/** Where a note that is a project by itself would go to be a folder: `Name/Name.md`. */
export function folderHomeOf(notePath: string): { folderPath: string; notePath: string } {
    const dir = dirOf(notePath);
    const folderPath = dir ? `${dir}/${baseOf(notePath)}` : baseOf(notePath);
    return { folderPath, notePath: `${folderPath}/${nameOf(notePath)}` };
}

/**
 * What else has to be renamed for a project's folder and its main note to
 * keep one name, after one of the two was renamed in the file tree.
 *
 * A project is known by that pairing, so renaming the folder alone would
 * leave a folder with no main note — and every note in it would turn up as a
 * project of its own. The other half follows: the folder was renamed, so its
 * note is; the note was, so its folder is.
 *
 * Nothing when the change is not that: a move to another place, a change of
 * case only, a note that was not a main note, a name that is already taken.
 * `namesIn` lists what a folder holds, by name.
 */
export function pairedRename(
    change: { path: string; oldPath: string; isFolder: boolean },
    root: string,
    namesIn: (folderPath: string) => readonly string[]
): { from: string; to: string } | null {
    const top = trimSlash(root);
    const { path, oldPath } = change;
    if (!top || !path.startsWith(`${top}/`) || !oldPath.startsWith(`${top}/`)) return null;

    const was = change.isFolder ? nameOf(oldPath) : baseOf(oldPath);
    const now = change.isFolder ? nameOf(path) : baseOf(path);
    if (same(was, now)) return null;

    if (change.isFolder) {
        // The folder was renamed: the note that carried its old name follows.
        const names = namesIn(path);
        const main = names.find((name) => isNote(name) && same(baseOf(name), was));
        if (!main) return null;
        if (names.some((name) => isNote(name) && same(baseOf(name), now))) return null;
        return { from: `${path}/${main}`, to: `${path}/${now}.md` };
    }

    // A note was renamed where it stood: if it was its folder's main note, the
    // folder follows.
    const dir = dirOf(path);
    if (!isNote(path) || dir !== dirOf(oldPath) || dir === top) return null;
    if (!same(was, nameOf(dir))) return null;
    const parent = dirOf(dir);
    if (namesIn(parent).some((name) => same(name, now))) return null;
    return { from: dir, to: parent ? `${parent}/${now}` : now };
}
