import React from 'react';
import { Notice } from 'obsidian';
import { Check, Plus, Star } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { resolveCover } from '../services/coverUrl';
import { bumpProgress } from '../services/contentActions';
import { formatProgress, progressPercent, shortUnit } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useContentMenu } from './useContentMenu';
import { ItemHeart } from './FavoriteHeart';

interface ContentRowProps {
    item: ContentItem;
    type: ContentTypeConfig;
    onOpen: (item: ContentItem) => void;
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: (item: ContentItem) => void;
    /** The title to show, when a series lists the part by what sets it apart. */
    title?: string;
}

/**
 * One item as a line of the list: its cover or its type's mark, the title with
 * what it is, how far in, the score, the favourite heart, and "+1" for what is
 * running.
 *
 * The list is where a library without covers still reads well. A poster wall
 * of a hundred gradients says nothing a line of text does not say in a
 * fraction of the room — and most imports bring no covers at all.
 */
export const ContentRow: React.FC<ContentRowProps> = ({
    item,
    type,
    onOpen,
    selectionMode,
    selected,
    onToggleSelect,
    title,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const quickOn = useFeature('content.quickIncrement');
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const openMenu = useContentMenu(item, type, onOpen);

    const coverUrl = resolveCover(app, item.coverImage);
    const tracksProgress = type.fields.includes('progress');
    const progress = { current: item.progressCurrent ?? 0, total: item.progressTotal };
    const pct = tracksProgress ? progressPercent(progress) : undefined;
    const running = item.status === 'in-progress';
    const sub = [type.label, item.year, item.creator].filter(Boolean).join(' · ');

    // One value on the right, as on a poster: a tick for something finished,
    // how far in, or how long it is.
    const value = (() => {
        if (item.status === 'completed') return null;
        if (tracksProgress && progress.current > 0) {
            return formatProgress(progress, type.progressUnit, { short: true });
        }
        if (tracksProgress && progress.total) return `${progress.total} ${shortUnit(type.progressUnit)}`;
        return '';
    })();

    const canBump =
        quickOn &&
        tracksProgress &&
        running &&
        !selectionMode &&
        (!progress.total || progress.current < progress.total);

    const bump = (e: React.MouseEvent) => {
        e.stopPropagation();
        void (async () => {
            try {
                const patch = await bumpProgress(app, item, 1);
                if (patch) patchContentItem(item.id, patch);
            } catch (err) {
                console.error('Zenith: content action failed:', err);
                new Notice(t('content.error.progress'));
            }
        })();
    };

    const activate = () => {
        if (selectionMode) onToggleSelect?.(item);
        else onOpen(item);
    };

    return (
        <div
            className={`zenith-crow${selected ? ' is-selected' : ''}${running ? ' is-running' : ''}`}
            role={selectionMode ? 'checkbox' : 'button'}
            aria-checked={selectionMode ? !!selected : undefined}
            tabIndex={0}
            onClick={activate}
            onContextMenu={openMenu}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            }}
        >
            <span
                className="zenith-crow__art"
                style={
                    coverUrl
                        ? { backgroundImage: `url("${coverUrl}")` }
                        : { background: `${type.color}24`, color: type.color }
                }
            >
                {selectionMode ? (
                    <span className={`zenith-poster__check ${selected ? 'is-on' : ''}`} aria-hidden="true">
                        {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                ) : (
                    !coverUrl && <ObsidianIcon name={type.icon} size={15} />
                )}
            </span>

            <span className="zenith-crow__main">
                <span className="zenith-crow__title" title={title && title !== item.title ? item.title : undefined}>
                    {title ?? item.title}
                </span>
                <span className="zenith-crow__sub">{sub}</span>
            </span>

            {pct != null && progress.current > 0 && item.status !== 'completed' && (
                <span className="zenith-crow__meter" aria-hidden="true">
                    <span className="zenith-crow__fill" style={{ width: `${pct}%` }} />
                </span>
            )}

            {value === null ? (
                <span className="zenith-crow__value is-done" title={t('content.status.completed')}>
                    <Check size={13} strokeWidth={2.6} />
                </span>
            ) : (
                value && <span className="zenith-crow__value">{value}</span>
            )}

            {item.rating > 0 && (
                <span className="zenith-crow__score" title={t('content.form.rating')}>
                    <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                    {item.rating}
                </span>
            )}

            {!selectionMode && <ItemHeart item={item} quiet className="zenith-crow__heart" />}

            {canBump ? (
                <button
                    type="button"
                    className="zenith-crow__bump"
                    aria-label={t('content.widget.bump', {
                        unit: type.progressUnit ?? '',
                        title: item.title,
                    })}
                    title="+1"
                    onClick={bump}
                >
                    <Plus size={14} />
                </button>
            ) : (
                quickOn && !selectionMode && <span className="zenith-crow__bump-slot" aria-hidden="true" />
            )}
        </div>
    );
};
