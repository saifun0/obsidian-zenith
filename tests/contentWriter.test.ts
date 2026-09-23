import { describe, it, expect } from 'vitest';
import { TFile, type App } from 'obsidian';
import { ContentWriter } from '../src/modules/content/services/contentWriter';

/**
 * One note's frontmatter behind the two calls the writer makes. Enough to see
 * which keys an edit touches — the property that matters for notes written by
 * an older version or shared with another plugin.
 */
function fakeApp(frontmatter: Record<string, unknown>) {
    const file = Object.assign(new TFile(), { path: 'Content/Bleach.md', basename: 'Bleach' });
    const created: Record<string, string> = {};
    const app = {
        vault: {
            getAbstractFileByPath: (path: string) =>
                path === file.path ? file : created[path] !== undefined ? new TFile() : null,
            create: (path: string, content: string) => {
                created[path] = content;
                return Promise.resolve(new TFile());
            },
            createFolder: () => Promise.resolve(),
        },
        fileManager: {
            processFrontMatter: (_f: TFile, fn: (fm: Record<string, unknown>) => void) => {
                fn(frontmatter);
                return Promise.resolve();
            },
        },
    } as unknown as App;
    return { app, created };
}

/** What an older Zenith, and some other plugin, left in the note. */
const LEFT_BEHIND = {
    externalRating: 7.8,
    source: 'https://myanimelist.net/anime/269',
    sourceId: 269,
    'other-plugin': { keep: true },
};

describe('ContentWriter — keys it does not own', () => {
    it('leaves them exactly as they were through every kind of edit', async () => {
        const fm: Record<string, unknown> = {
            title: 'Bleach',
            status: 'backlog',
            rating: 0,
            ...LEFT_BEHIND,
        };
        const { app } = fakeApp(fm);
        const writer = new ContentWriter(app);

        await writer.setRating('Content/Bleach.md', 8);
        await writer.setStatus('Content/Bleach.md', 'in-progress', {});
        await writer.setProgress('Content/Bleach.md', 21, 366);
        await writer.patch('Content/Bleach.md', { progressTotal: undefined, year: 2004 });

        expect(fm).toMatchObject({
            rating: 8,
            status: 'in-progress',
            progress: 21,
            year: 2004,
            ...LEFT_BEHIND,
        });
        expect(fm).not.toHaveProperty('progressTotal');
    });

    it('writes none of them into a new note', async () => {
        const { app, created } = fakeApp({});
        await new ContentWriter(app).createItem('Content', {
            title: 'Andrei Rublev',
            type: 'movie',
            status: 'completed',
            rating: 10,
            tags: [],
            coverImage: 'https://example.com/rublev.jpg',
        });
        const note = Object.values(created)[0];
        expect(note).toContain('cover: "https://example.com/rublev.jpg"');
        expect(note).not.toMatch(/externalRating|source/);
    });
});
