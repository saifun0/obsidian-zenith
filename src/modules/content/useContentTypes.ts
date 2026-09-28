import { useMemo } from 'react';
import { translatorNow, useTranslation, type Translator } from '../../core/i18n';
import {
    effectiveContentTypes,
    isTypeShown,
    resolveContentType,
    visibleContentTypes,
    type ContentTypeConfig,
} from '../../core/contentTypes';
import { useZenithStore } from '../../store';
import type { ContentItem } from '../../store/contentSlice';
import { localizeType } from './contentLabels';

/**
 * The library's types as every view needs them: in the reader's language, with
 * the switched-off ones set apart, and a lookup that never comes back empty.
 */
export interface LibraryTypes {
    /** Every type, switched off or not — for settings and for resolving items. */
    all: ContentTypeConfig[];
    /** The types switched on, in order: tabs, the add form, the statistics. */
    visible: ContentTypeConfig[];
    /** The config for a type id, falling back as `resolveContentType` does. */
    typeOf: (id: string) => ContentTypeConfig;
    /** Whether items of a type id are shown. */
    shown: (id: string) => boolean;
}

function build(saved: ContentTypeConfig[] | undefined, t: Translator): LibraryTypes {
    const all = effectiveContentTypes(saved).map((type) => localizeType(t, type));
    const cache = new Map<string, ContentTypeConfig>();
    return {
        all,
        visible: visibleContentTypes(all),
        typeOf: (id) => {
            let hit = cache.get(id);
            if (!hit) {
                hit = resolveContentType(all, id);
                cache.set(id, hit);
            }
            return hit;
        },
        shown: (id) => isTypeShown(all, id),
    };
}

export function useContentTypes(): LibraryTypes {
    const t = useTranslation();
    const saved = useZenithStore((s) => s.settings.contentTypes);
    return useMemo(() => build(saved, t), [saved, t]);
}

/** The same, outside React. */
export function contentTypesNow(): LibraryTypes {
    return build(useZenithStore.getState().settings.contentTypes, translatorNow());
}

/**
 * The items the library shows: everything but those of a switched-off type.
 * Their notes are untouched — they are only kept out of sight.
 */
export function useLibraryItems(): { items: ContentItem[]; types: LibraryTypes } {
    const types = useContentTypes();
    const all = useZenithStore((s) => s.contentItems);
    const items = useMemo(() => all.filter((i) => types.shown(i.type)), [all, types]);
    return { items, types };
}
