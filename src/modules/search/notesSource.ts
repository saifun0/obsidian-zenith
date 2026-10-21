import { getAllTags, parseFrontMatterAliases, TFile } from 'obsidian';
import { openFileAtLine } from '../../core/openInVault';
import { PER_GROUP } from './rank';
import { searchSources, type OwnNote, type SearchItem, type SearchSource } from './searchSources';
import type { NoteIndex } from './noteIndex';
import type ZenithPlugin from '../../main';

/**
 * The vault's notes, as one group under everything Zenith keeps: found by
 * name, by their aliases and tags, and by what they say.
 *
 * A note another module keeps and finds its own way — a day's note, by its
 * date — is not found here by name, and is shown under that module's title
 * for it when found by what it says.
 */

/** Hits asked of the index: a group's worth, and some to spare for those shown above. */
const ASKED = PER_GROUP * 3;

function folderOf(file: TFile): string | undefined {
    return file.parent && !file.parent.isRoot() ? file.parent.path : undefined;
}

export function notesSource(plugin: ZenithPlugin, index: NoteIndex): SearchSource {
    const { app } = plugin;

    const ownerOf = (path: string): OwnNote | null => {
        for (const source of searchSources.getSnapshot()) {
            const own = source.ownNote?.(path);
            if (own) return own;
        }
        return null;
    };

    const opener = (path: string, line?: number, select?: { ch: number; length: number }) => ({
        run: () => void openFileAtLine(app, path, line, { select }),
        openInTab: () => void openFileAtLine(app, path, line, { select, newTab: true }),
    });

    return {
        id: 'notes',
        labelKey: 'search.group.notes',
        icon: 'file-text',
        order: 90,
        trailing: true,
        items: () => {
            index.warm();
            const items: SearchItem[] = [];
            for (const file of app.vault.getMarkdownFiles()) {
                if (index.skipped(file.path) || ownerOf(file.path)) continue;
                const cache = app.metadataCache.getFileCache(file);
                items.push({
                    id: `notes:${file.path}`,
                    title: file.basename,
                    aliases: parseFrontMatterAliases(cache?.frontmatter ?? null) ?? [],
                    tags: (cache ? (getAllTags(cache) ?? []) : []).map((tag) =>
                        tag.replace(/^#/, '')
                    ),
                    folder: folderOf(file),
                    note: file.path,
                    ...opener(file.path),
                });
            }
            return items;
        },
        inText: (query) => {
            const items: SearchItem[] = [];
            for (const hit of index.search(query, ASKED)) {
                const file = app.vault.getAbstractFileByPath(hit.path);
                if (!(file instanceof TFile)) continue;
                const own = ownerOf(hit.path);
                items.push({
                    id: `notes:${hit.path}`,
                    title: own?.title ?? file.basename,
                    icon: own?.icon,
                    folder: folderOf(file),
                    note: hit.path,
                    snippet: hit.snippet,
                    ...opener(
                        hit.path,
                        hit.line,
                        hit.length ? { ch: hit.ch, length: hit.length } : undefined
                    ),
                });
            }
            return items;
        },
        changes: (listener) => index.subscribe(listener),
    };
}
