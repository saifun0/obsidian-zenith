import { describe, expect, it } from 'vitest';
import {
    folderHomeOf,
    pairedRename,
    placeProjects,
} from '../src/modules/projects/services/projectLayout';

/**
 * A project may be a folder: one that holds a note of its own name. These are
 * the rules of what is a project and what is a project's material — and of
 * how the folder and its note keep one name.
 */

const ROOT = '20 Projects';
const at = (...paths: string[]) => paths.map((p) => `${ROOT}/${p}`);
const places = (...paths: string[]) => placeProjects(at(...paths), ROOT);

describe('where the projects are', () => {
    it('takes a note by itself as a project, as it always was', () => {
        expect(places('Zenith.md', 'vboks.ru.md')).toEqual([
            { notePath: `${ROOT}/vboks.ru.md`, notes: 0, files: 0 },
            { notePath: `${ROOT}/Zenith.md`, notes: 0, files: 0 },
        ]);
    });

    it('takes a folder with a note of its own name as one project', () => {
        expect(places('Zenith/Zenith.md', 'Zenith/Roadmap.md', 'Zenith/logo.png')).toEqual([
            {
                notePath: `${ROOT}/Zenith/Zenith.md`,
                folderPath: `${ROOT}/Zenith`,
                notes: 1,
                files: 1,
            },
        ]);
    });

    it('does not make projects of the notes inside a project', () => {
        const found = places(
            'Move/Move.md',
            'Move/Minutes.md',
            'Move/Quotes/Movers.md',
            'Move/Quotes/scan.pdf'
        );
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ notes: 2, files: 1 });
    });

    it('has no projects inside projects', () => {
        // The stage has a note of its own name, and is still the project's material.
        const found = places('Site/Site.md', 'Site/Stage 1/Stage 1.md', 'Site/Stage 1/todo.md');
        expect(found.map((p) => p.notePath)).toEqual([`${ROOT}/Site/Site.md`]);
        expect(found[0].notes).toBe(2);
    });

    it('lets a folder without a note of its own name be only a group', () => {
        const found = places('Work/Site/Site.md', 'Work/Site/Brief.md', 'Work/Tax.md');
        expect(found).toEqual([
            {
                notePath: `${ROOT}/Work/Site/Site.md`,
                folderPath: `${ROOT}/Work/Site`,
                notes: 1,
                files: 0,
            },
            // A note in a group is a project by itself.
            { notePath: `${ROOT}/Work/Tax.md`, notes: 0, files: 0 },
        ]);
    });

    it('compares the names without regard to case', () => {
        expect(places('zenith/Zenith.md')[0].folderPath).toBe(`${ROOT}/zenith`);
    });

    it('does not take the projects folder itself for a project', () => {
        // A note named after the projects folder is a project like any other,
        // and the notes beside it stay projects.
        const found = placeProjects([`${ROOT}/${ROOT}.md`, `${ROOT}/Zenith.md`], ROOT);
        expect(found.map((p) => p.folderPath)).toEqual([undefined, undefined]);
        expect(found).toHaveLength(2);
    });

    it('counts what is not a note as a file, and is not confused by one', () => {
        // A picture is never a project, in a project's folder or out of it.
        expect(places('cover.png', 'Zenith/Zenith.md', 'Zenith/a.png', 'Zenith/b.canvas')).toEqual([
            {
                notePath: `${ROOT}/Zenith/Zenith.md`,
                folderPath: `${ROOT}/Zenith`,
                notes: 0,
                files: 2,
            },
        ]);
    });

    it('looks only under the projects folder, and finds nothing without one', () => {
        expect(placeProjects(['Other/Zenith/Zenith.md', `${ROOT}/A.md`], ROOT)).toHaveLength(1);
        expect(placeProjects([`${ROOT}/A.md`], '')).toEqual([]);
        // A trailing slash on the setting is the same folder.
        expect(placeProjects([`${ROOT}/A.md`], `${ROOT}/`)).toHaveLength(1);
    });
});

describe('a project’s place as a folder', () => {
    it('is a folder of its own name, beside where the note was', () => {
        expect(folderHomeOf(`${ROOT}/Zenith.md`)).toEqual({
            folderPath: `${ROOT}/Zenith`,
            notePath: `${ROOT}/Zenith/Zenith.md`,
        });
        expect(folderHomeOf(`${ROOT}/Work/vboks.ru.md`).notePath).toBe(
            `${ROOT}/Work/vboks.ru/vboks.ru.md`
        );
    });
});

describe('keeping a folder and its main note under one name', () => {
    /** A vault as folders and the names in them. */
    const vault = (tree: Record<string, string[]>) => (folder: string) => tree[folder] ?? [];

    it('renames the note after its folder', () => {
        // "Zenith" became "Zenith 2": the note inside still has the old name.
        const names = vault({ [`${ROOT}/Zenith 2`]: ['Zenith.md', 'Roadmap.md'] });
        expect(
            pairedRename(
                { path: `${ROOT}/Zenith 2`, oldPath: `${ROOT}/Zenith`, isFolder: true },
                ROOT,
                names
            )
        ).toEqual({ from: `${ROOT}/Zenith 2/Zenith.md`, to: `${ROOT}/Zenith 2/Zenith 2.md` });
    });

    it('renames the folder after its main note', () => {
        const names = vault({ [ROOT]: ['Zenith', 'Other.md'], [`${ROOT}/Zenith`]: ['Aurora.md'] });
        expect(
            pairedRename(
                {
                    path: `${ROOT}/Zenith/Aurora.md`,
                    oldPath: `${ROOT}/Zenith/Zenith.md`,
                    isFolder: false,
                },
                ROOT,
                names
            )
        ).toEqual({ from: `${ROOT}/Zenith`, to: `${ROOT}/Aurora` });
    });

    it('answers its own renames with nothing, so the two do not chase each other', () => {
        // The note renamed after the folder: it was not the main note by its old name…
        const afterFolder = vault({ [`${ROOT}/Zenith 2`]: ['Zenith 2.md'] });
        expect(
            pairedRename(
                {
                    path: `${ROOT}/Zenith 2/Zenith 2.md`,
                    oldPath: `${ROOT}/Zenith 2/Zenith.md`,
                    isFolder: false,
                },
                ROOT,
                afterFolder
            )
        ).toBeNull();
        // …and the folder renamed after the note holds no note of its old name.
        const afterNote = vault({ [`${ROOT}/Aurora`]: ['Aurora.md'] });
        expect(
            pairedRename(
                { path: `${ROOT}/Aurora`, oldPath: `${ROOT}/Zenith`, isFolder: true },
                ROOT,
                afterNote
            )
        ).toBeNull();
    });

    it('leaves alone what is not a renaming of the pair', () => {
        const names = vault({
            [ROOT]: ['Zenith', 'Taken'],
            [`${ROOT}/Zenith`]: ['Zenith.md', 'Roadmap.md'],
            [`${ROOT}/Group`]: ['Loose.md'],
        });
        const none = (change: { path: string; oldPath: string; isFolder: boolean }) =>
            expect(pairedRename(change, ROOT, names), change.path).toBeNull();

        // A material note renamed.
        none({ path: `${ROOT}/Zenith/Plan.md`, oldPath: `${ROOT}/Zenith/Roadmap.md`, isFolder: false });
        // A note moved out of its folder, name and all: a move, not a renaming.
        none({ path: `${ROOT}/Zenith.md`, oldPath: `${ROOT}/Zenith/Zenith.md`, isFolder: false });
        // A change of case only: the pair still matches.
        none({ path: `${ROOT}/zenith`, oldPath: `${ROOT}/Zenith`, isFolder: true });
        // A folder that was only a group.
        none({ path: `${ROOT}/Team`, oldPath: `${ROOT}/Group`, isFolder: true });
        // A project by itself, directly in the projects folder.
        none({ path: `${ROOT}/B.md`, oldPath: `${ROOT}/A.md`, isFolder: false });
        // Outside the projects folder.
        none({ path: 'Notes/B', oldPath: 'Notes/A', isFolder: true });
    });

    it('does not rename onto a name that is taken', () => {
        // The folder would become "Taken", which is already there.
        const names = vault({ [ROOT]: ['Zenith', 'Taken'], [`${ROOT}/Zenith`]: ['Taken.md'] });
        expect(
            pairedRename(
                {
                    path: `${ROOT}/Zenith/Taken.md`,
                    oldPath: `${ROOT}/Zenith/Zenith.md`,
                    isFolder: false,
                },
                ROOT,
                names
            )
        ).toBeNull();
        // The folder already holds a note of its new name.
        const both = vault({ [`${ROOT}/New`]: ['Old.md', 'New.md'] });
        expect(
            pairedRename({ path: `${ROOT}/New`, oldPath: `${ROOT}/Old`, isFolder: true }, ROOT, both)
        ).toBeNull();
    });
});
