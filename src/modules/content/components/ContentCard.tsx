import React from 'react';
import { Notice } from 'obsidian';
import { Check, Plus, Star } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { resolveCover } from '../services/coverUrl';
import { bumpProgress } from '../services/contentActions';
import { formatProgress, progressPercent, shortUnit } from '../services/progress';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useContentMenu } from './useContentMenu';

interface ContentCardProps {
    item: ContentItem;
    type: ContentTypeConfig;
    onOpen: (item: ContentItem) => void;
    /** When set, the card is a selection target rather than a link. */
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: (item: ContentItem) => void;
}

/**
 * ContentCard — a poster tile: clean 2:3 artwork with the text set beneath it.
 *
 * The artwork used to carry seven stacked overlays (type badge, score, a
 * gradient scrim, title, subtitle, status pill and a progress bar), which meant
 * every cover was read through its own chrome. Two survive on the art — the
 * score and a hairline progress line along the bottom edge — and everything
 * textual moved below, where it sits on a solid surface instead of a gradient.
 *
 * The status pill went with them: it only ever restated what the progress line
 * already showed. The meta row's right slot carries one fact instead, chosen by
 * status — how far in, a tick, or how long the thing is.
 *
 * The card is not a pure preview: a right-click menu changes status, advances
 * progress, opens the note or deletes the item, and an in-progress card gets a
 * "+1" on hover. Opening the detail modal for every "I watched one more
 * episode" was the single most repeated action in the library.
 */
export const ContentCard: React.FC<ContentCardProps> = ({
    item,
    type,
    onOpen,
    selectionMode,
    selected,
    onToggleSelect,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const patchContentItem = useZenithStore((s) => s.patchContentItem);
    const coverUrl = resolveCover(app, item.coverImage);
    const sub = [item.year, item.creator].filter(Boolean).join(' · ');

    const tracksProgress = type.fields.includes('progress');
    const progress = { current: item.progressCurrent ?? 0, total: item.progressTotal };
    const pct = tracksProgress ? progressPercent(progress) : undefined;

    // A bar pinned at zero is decoration. Until something is actually begun the
    // useful fact is the length ("13 ep"), not an empty track.
    const showBar = pct != null && progress.current > 0 && item.status !== 'completed';

    /**
     * The meta row's right slot — one value, whichever one this item's status
     * makes worth knowing. Three separate elements (progress label, status pill
     * and length hint) used to compete for the same corner.
     *
     * Anything not actively running reads muted, which is what carries the
     * distinction the status pill used to spell out: a shelved item with 5 of 13
     * episodes behind it must not look like one you're in the middle of.
     */
    const running = item.status === 'in-progress';
    const slot: { text?: string; done?: boolean; muted?: boolean } | undefined = (() => {
        if (item.status === 'completed') return { done: true };
        if (tracksProgress && progress.current > 0) {
            return {
                text: formatProgress(progress, type.progressUnit, { short: true }),
                muted: !running,
            };
        }
        if (tracksProgress && progress.total) {
            return { text: `${progress.total} ${shortUnit(type.progressUnit)}`, muted: true };
        }
        return undefined;
    })();

    const canBump =
        tracksProgress && item.status === 'in-progress' && (!progress.total || progress.current < progress.total);

    const openMenu = useContentMenu(item, type, onOpen);

    const bump = (delta: number) =>
        void (async () => {
            try {
                const patch = await bumpProgress(app, item, delta);
                if (patch) patchContentItem(item.id, patch);
            } catch (err) {
                console.error('Zenith: content action failed:', err);
                new Notice(t('content.error.progress'));
            }
        })();

    const activate = () => {
        if (selectionMode) onToggleSelect?.(item);
        else onOpen(item);
    };

    return (
        <div
            className={`zenith-poster ${selected ? 'is-selected' : ''}`}
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
                className="zenith-poster__art"
                style={
                    coverUrl
                        ? { backgroundImage: `url("${coverUrl}")` }
                        : { background: `linear-gradient(160deg, ${type.color}44, ${type.color}18)` }
                }
            >
                {!coverUrl && (
                    <span className="zenith-poster__placeholder" style={{ color: type.color }}>
                        <ObsidianIcon name={type.icon} size={40} />
                    </span>
                )}

                {selectionMode ? (
                    <span className={`zenith-poster__check ${selected ? 'is-on' : ''}`} aria-hidden="true">
                        {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                ) : (
                    item.rating > 0 && (
                        <span className="zenith-poster__score" title={t('content.form.rating')}>
                            <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                            {item.rating}
                        </span>
                    )
                )}

                {/* The only mark left on the artwork besides the score: how far
                    in this is, as a hairline along the bottom edge. It carries
                    the status in its colour — live for something running, grey
                    for something parked — so dropping the status pill didn't
                    drop the distinction with it. */}
                {showBar && (
                    <div
                        className={`zenith-poster__line ${running ? 'is-running' : ''}`}
                        aria-hidden="true"
                    >
                        <div className="zenith-poster__line-fill" style={{ width: `${pct}%` }} />
                    </div>
                )}

                {canBump && !selectionMode && (
                    <button
                        type="button"
                        className="zenith-poster__bump"
                        aria-label={t('content.widget.bump', {
                            unit: type.progressUnit ?? '',
                            title: item.title,
                        })}
                        title="+1"
                        onClick={(e) => {
                            e.stopPropagation();
                            bump(1);
                        }}
                    >
                        <Plus size={14} />
                    </button>
                )}

            </div>

            {/* Text below the artwork, not over it: a solid surface reads at a
                glance where a gradient needs the eye to work for it. */}
            <div className="zenith-poster__body">
                <span className="zenith-poster__title">{item.title}</span>
                <div className="zenith-poster__meta">
                    <span className="zenith-poster__sub">
                        <span className="zenith-poster__type" style={{ color: type.color }}>
                            <ObsidianIcon name={type.icon} size={11} />
                        </span>
                        <span className="zenith-poster__sub-text">{sub || type.label}</span>
                    </span>
                    {slot &&
                        (slot.done ? (
                            <span className="zenith-poster__slot is-done" title={t('status.completed')}>
                                <Check size={12} strokeWidth={2.6} />
                            </span>
                        ) : (
                            <span
                                className={`zenith-poster__slot ${slot.muted ? 'is-muted' : ''}`}
                                title={slot.text}
                            >
                                {slot.text}
                            </span>
                        ))}
                </div>
            </div>
        </div>
    );
};
