import { createElement } from 'react';
import { Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import type { ContentItem } from '../../store/contentSlice';
import {
    effectiveContentTypes,
    resolveContentType,
    type ContentTypeConfig,
} from '../../core/contentTypes';
import { translateNow } from '../../core/i18n';
import { openDialog } from '../../core/openDialog';
import type { SearchCreator, SearchSource } from '../search/searchSources';
import { ContentWriter } from './services/contentWriter';
import { ContentDetailModal } from './components/ContentDetailModal';
import type ZenithPlugin from '../../main';

/**
 * What Search finds of the content library: every item, finished ones too —
 * a book is looked up after it is read, to rate it — and "книга …", "фильм …"
 * to add one to the backlog.
 *
 * A type is called by its own label, whatever the user named it, and the
 * built-in ones by their name in either language as well.
 */
const TYPE_WORDS: Record<string, readonly string[]> = {
    book: ['книга', 'book'],
    movie: ['фильм', 'кино', 'movie', 'film'],
    show: ['сериал', 'show', 'series'],
    anime: ['аниме', 'anime'],
    manga: ['манга', 'manga'],
};

function open(plugin: ZenithPlugin, item: ContentItem, type: ContentTypeConfig): void {
    // The card the library opens on a click, with the rating and the progress.
    openDialog(plugin, (close) =>
        createElement(ContentDetailModal, { item, type, onClose: close })
    );
}

function creatorFor(plugin: ZenithPlugin, type: ContentTypeConfig): SearchCreator {
    return {
        keywords: [...(TYPE_WORDS[type.id] ?? []), type.label],
        row: (text) => ({
            title: text,
            label: type.label,
            icon: type.icon,
            run: async () => {
                try {
                    const { contentFolderPath } = useZenithStore.getState().settings;
                    await new ContentWriter(plugin.app).createItem(contentFolderPath, {
                        title: text,
                        type: type.id,
                        status: 'backlog',
                        rating: 0,
                        tags: [],
                    });
                    new Notice(translateNow('search.created.content', { title: text }));
                } catch (err) {
                    console.error('Zenith: failed to add to the library from Search:', err);
                    new Notice(translateNow('content.error.create'));
                }
            },
        }),
    };
}

export function contentSearchSource(plugin: ZenithPlugin): SearchSource {
    const types = () => effectiveContentTypes(useZenithStore.getState().settings.contentTypes);
    return {
        id: 'content',
        labelKey: 'module.content.name',
        icon: 'library',
        order: 50,
        items: () => {
            const all = types();
            return useZenithStore.getState().contentItems.map((item) => {
                const type = resolveContentType(all, item.type);
                return {
                    id: `content:${item.filePath}`,
                    title: item.title,
                    aliases: item.creator ? [`${item.title} ${item.creator}`] : undefined,
                    tags: item.tags,
                    detail: type.label,
                    icon: type.icon,
                    run: () => open(plugin, item, type),
                    reveal: () => void plugin.app.workspace.openLinkText(item.filePath, '', false),
                };
            });
        },
        creators: () => types().map((type) => creatorFor(plugin, type)),
    };
}
