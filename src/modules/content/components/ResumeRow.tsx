import React from 'react';
import { Notice } from 'obsidian';
import { Check, Plus } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { resolveCover } from '../services/coverUrl';
import { useFeature } from '../../../core/useFeature';
import { bumpProgress } from '../services/contentActions';
import { formatProgress, progressPercent } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useContentMenu } from './useContentMenu';

interface ResumeRowProps {
    item: ContentItem;
    type: ContentTypeConfig;
    onOpen: (item: ContentItem) => void;
    /** When set, the row is a selection target rather than a link. */
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: (item: ContentItem) => void;
}

/**
 * ResumeRow — one entry on the "Continue" shelf.
 *
 * The shelf used to be the same poster tiles as the grid below it, which made
 * two different things look identical: a shelf item is something you are in the
 * middle of, and what you need from it is how far in you are and a way to move
 * one step further. A wide row gives that room — cover, title, the count, a
 * meter and "+1" — where a poster could only fit them by stacking them on the
 * artwork.
 */
export const ResumeRow: React.FC<ResumeRowProps> = ({
    item,
    type,
    onOpen,
    selectionMode,
    selected,
    onToggleSelect,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const quickOn = useFeature('content.quickIncrement');
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    // Same menu as a poster tile: one gesture, one meaning, both surfaces.
    const openMenu = useContentMenu(item, type, onOpen);

    const coverUrl = resolveCover(app, item.coverImage);
    const progress = { current: item.progressCurrent ?? 0, total: item.progressTotal };
    const tracksProgress = type.fields.includes('progress');
    const pct = tracksProgress ? progressPercent(progress) : undefined;
    const canBump =
        quickOn &&
        tracksProgress &&
        (!progress.total || progress.current < progress.total) &&
        !selectionMode;

    const bump = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const patch = await bumpProgress(app, item, 1);
            if (patch) patchContentItem(item.id, patch);
        } catch (err) {
            console.error('Zenith: content action failed:', err);
            new Notice(t('content.error.progress'));
        }
    };

    const activate = () => {
        if (selectionMode) onToggleSelect?.(item);
        else onOpen(item);
    };

    // Without a total there is no meter to draw, so the count carries the whole
    // story ("40 ep") and takes the space the bar would have used.
    const count = tracksProgress
        ? formatProgress(progress, type.progressUnit, { short: true })
        : [item.year, item.creator].filter(Boolean).join(' · ');

    return (
        <div
            className={`zenith-resume ${selected ? 'is-selected' : ''}`}
            role={selectionMode ? 'checkbox' : 'button'}
            aria-checked={selectionMode ? !!selected : undefined}
            tabIndex={0}
            title={item.title}
            onClick={activate}
            onContextMenu={openMenu}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            }}
        >
            <div
                className="zenith-resume__art"
                style={
                    coverUrl
                        ? { backgroundImage: `url("${coverUrl}")` }
                        : { background: `linear-gradient(160deg, ${type.color}44, ${type.color}18)` }
                }
            >
                {!coverUrl && (
                    <span style={{ color: type.color }}>
                        <ObsidianIcon name={type.icon} size={16} />
                    </span>
                )}
                {selectionMode && (
                    <span className={`zenith-poster__check ${selected ? 'is-on' : ''}`} aria-hidden="true">
                        {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                )}
            </div>

            <div className="zenith-resume__main">
                <div className="zenith-resume__top">
                    <span className="zenith-resume__title">{item.title}</span>
                    <span className="zenith-resume__count">{count}</span>
                </div>
                {pct != null && (
                    <div className="zenith-resume__meter">
                        <div className="zenith-resume__track">
                            <div className="zenith-resume__fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="zenith-resume__pct">{Math.round(pct)}%</span>
                    </div>
                )}
            </div>

            {canBump && (
                <button
                    type="button"
                    className="zenith-resume__bump"
                    aria-label={t('content.widget.bump', {
                        unit: type.progressUnit ?? '',
                        title: item.title,
                    })}
                    title="+1"
                    onClick={(e) => void bump(e)}
                >
                    <Plus size={14} />
                </button>
            )}
        </div>
    );
};
