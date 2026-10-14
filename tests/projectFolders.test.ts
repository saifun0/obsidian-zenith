import { describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { keepNamesPaired, moveIntoFolder } from '../src/modules/projects/services/projectFolders';
import { ProjectWriter } from '../src/modules/projects/services/projectWriter';
import { filterTasksForProject } from '../src/modules/projects/services/projectParser';
import type { Project } from '../src/modules/projects/projectsTypes';
import type { Task } from '../src/store/taskSlice';

/**
 * A project as a folder, in a vault: being made as one, being given one, and
 * keeping the folder's name and its note's name the same.
 */

const ROOT = '20 Projects';

/** A small vault: folders and files by path, linked both ways, with Obsidian's renaming. */
function vault(paths: string[]) {
    const byPath = new Map<string, TFile | TFolder>();
    const root = Object.assign(new TFolder(), { path: '', name: '', children: [] as unknown[] });

    const folder = (path: string): TFolder => {
        if (!path) return root;
        const found = byPath.get(path);
        if (found instanceof TFolder) return found;
        const made = Object.assign(new TFolder(), {
            path,
            name: path.slice(path.lastIndexOf('/') + 1),
            children: [] as unknown[],
        });
        const parent = folder(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
        Object.assign(made, { parent });
        parent.children.push(made);
        byPath.set(path, made);
        return made;
    };
    const file = (path: string): TFile => {
        const name = path.slice(path.lastIndexOf('/') + 1);
        const parent = folder(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
        const made = Object.assign(new TFile(), {
            path,
            name,
            basename: name.replace(/\.[^.]+$/, ''),
            extension: name.slice(name.lastIndexOf('.') + 1),
            parent,
        });
        parent.children.push(made);
        byPath.set(path, made);
        return made;
    };
    for (const path of paths) file(path);

    const renames: Array<[string, string]> = [];
    const app = {
        vault: {
            getAbstractFileByPath: (path: string) => byPath.get(path) ?? null,
            getRoot: () => root,
            createFolder: vi.fn(async (path: string) => folder(path)),
            create: vi.fn(async (path: string) => file(path)),
        },
        fileManager: {
            renameFile: vi.fn(async (target: TFile | TFolder, to: string) => {
                renames.push([target.path, to]);
            }),
            processFrontMatter: vi.fn(async () => {}),
        },
    };
    return { app: app as never, byPath, renames, file };
}

describe('giving a project a folder of its own', () => {
    it('moves Name.md into a new folder Name, through Obsidian’s renaming', async () => {
        const v = vault([`${ROOT}/Zenith.md`]);
        const note = v.byPath.get(`${ROOT}/Zenith.md`) as TFile;
        expect(await moveIntoFolder(v.app, note)).toBe('moved');
        expect(v.byPath.has(`${ROOT}/Zenith`)).toBe(true);
        // Renamed, not copied: Obsidian repairs the links to it on the way.
        expect(v.renames).toEqual([[`${ROOT}/Zenith.md`, `${ROOT}/Zenith/Zenith.md`]]);
    });

    it('uses a folder of that name that is already there, whatever its case', async () => {
        const v = vault([`${ROOT}/Zenith.md`, `${ROOT}/zenith/logo.png`]);
        const note = v.byPath.get(`${ROOT}/Zenith.md`) as TFile;
        expect(await moveIntoFolder(v.app, note)).toBe('moved');
        expect(v.renames).toEqual([[`${ROOT}/Zenith.md`, `${ROOT}/zenith/Zenith.md`]]);
    });

    it('leaves the note where it is when the folder is a project already', async () => {
        const v = vault([`${ROOT}/Zenith.md`, `${ROOT}/Zenith/Zenith.md`]);
        const note = v.byPath.get(`${ROOT}/Zenith.md`) as TFile;
        expect(await moveIntoFolder(v.app, note)).toBe('taken');
        expect(v.renames).toEqual([]);
    });
});

describe('making a project', () => {
    it('makes a folder with the note in it, under one name', async () => {
        const v = vault([]);
        const file = await new ProjectWriter(v.app).create(ROOT, {
            title: 'Q3: launch',
            status: 'active',
            priority: 'none',
            tags: [],
            taskTags: [],
        });
        // The colon is not a file name's, so it is a dash in both.
        expect(file.path).toBe(`${ROOT}/Q3- launch/Q3- launch.md`);
    });

    it('numbers the name when a folder or a project note has it', async () => {
        const v = vault([`${ROOT}/Move.md`, `${ROOT}/Move 2/notes.md`]);
        const file = await new ProjectWriter(v.app).create(ROOT, {
            title: 'Move',
            status: 'active',
            priority: 'none',
            tags: [],
            taskTags: [],
        });
        expect(file.path).toBe(`${ROOT}/Move 3/Move 3.md`);
    });
});

describe('a folder and its note keep one name', () => {
    it('renames the note when its folder was renamed', async () => {
        // The folder was "Zenith" and is "Aurora" now; the note inside is still "Zenith".
        const v = vault([`${ROOT}/Aurora/Zenith.md`, `${ROOT}/Aurora/Roadmap.md`]);
        const moved = await keepNamesPaired(
            v.app,
            ROOT,
            v.byPath.get(`${ROOT}/Aurora`) as TFolder,
            `${ROOT}/Zenith`
        );
        expect(moved).toEqual({ from: `${ROOT}/Aurora/Zenith.md`, to: `${ROOT}/Aurora/Aurora.md` });
        expect(v.renames).toEqual([[`${ROOT}/Aurora/Zenith.md`, `${ROOT}/Aurora/Aurora.md`]]);
    });

    it('does nothing for a rename that is not one of the pair', async () => {
        const v = vault([`${ROOT}/Zenith/Zenith.md`, `${ROOT}/Zenith/Plan.md`]);
        const moved = await keepNamesPaired(
            v.app,
            ROOT,
            v.byPath.get(`${ROOT}/Zenith/Plan.md`) as TFile,
            `${ROOT}/Zenith/Roadmap.md`
        );
        expect(moved).toBeNull();
        expect(v.renames).toEqual([]);
    });
});

describe('a project’s tasks, when the project is a folder', () => {
    const task = (filePath: string, title: string): Task =>
        ({
            id: `${filePath}:${title}`,
            title,
            filePath,
            status: 'todo',
            completed: false,
            priority: 'none',
            tags: [],
            subtasks: [],
            lineNumber: 1,
        }) as Task;
    const zenith = {
        id: `${ROOT}/Zenith/Zenith.md`,
        filePath: `${ROOT}/Zenith/Zenith.md`,
        fileName: 'Zenith.md',
        folderPath: `${ROOT}/Zenith`,
        notes: 2,
        files: 0,
        title: 'Zenith',
        taskTags: [],
    } as unknown as Project;

    it('counts a task in any note of the folder, and none from a folder that only begins alike', () => {
        const tasks = [
            task(`${ROOT}/Zenith/Zenith.md`, 'Ship 0.5.0'),
            task(`${ROOT}/Zenith/Meetings/Monday.md`, 'Answer the review'),
            task(`${ROOT}/Zenith 2/Zenith 2.md`, 'Someone else’s'),
            task('10 Inbox/Tasks/Inbox.md', 'Unrelated'),
        ];
        expect(filterTasksForProject(zenith, tasks).map((t) => t.title)).toEqual([
            'Ship 0.5.0',
            'Answer the review',
        ]);
    });
});
