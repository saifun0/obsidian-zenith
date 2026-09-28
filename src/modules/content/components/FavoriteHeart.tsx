import React from 'react';
import { Notice } from 'obsidian';
import { Heart } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import type { ContentItem } from '../../../store/contentSlice';
import { setItemFavorite } from '../services/contentActions';

/**
 * The favourite mark: a heart, filled when it is one. Pressing it toggles.
 *
 * `quiet` hides an empty heart until the row or card is hovered — a list of a
 * hundred items with a hundred outline hearts would be a pattern, not a mark.
 */
export const FavoriteHeart: React.FC<{
    on: boolean;
    onToggle: () => void;
    size?: number;
    quiet?: boolean;
    className?: string;
}> = ({ on, onToggle, size = 14, quiet, className }) => {
    const t = useTranslation();
    const label = t(on ? 'content.favorite.remove' : 'content.favorite.add');
    return (
        <button
            type="button"
            className={`zenith-heart${on ? ' is-on' : ''}${quiet ? ' is-quiet' : ''}${
                className ? ` ${className}` : ''
            }`}
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
            }}
        >
            <Heart size={size} fill={on ? 'currentColor' : 'none'} />
        </button>
    );
};

/** A library item's heart, writing its note when pressed. */
export const ItemHeart: React.FC<{
    item: ContentItem;
    size?: number;
    quiet?: boolean;
    className?: string;
}> = ({ item, ...rest }) => {
    const { app } = useApp();
    const t = useTranslation();
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    return (
        <FavoriteHeart
            {...rest}
            on={!!item.favorite}
            onToggle={() =>
                void (async () => {
                    try {
                        patchContentItem(item.id, await setItemFavorite(app, item, !item.favorite));
                    } catch (err) {
                        console.error('Zenith: content action failed:', err);
                        new Notice(t('content.error.status'));
                    }
                })()
            }
        />
    );
};
