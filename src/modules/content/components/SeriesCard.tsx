import React from 'react';
import { Check, Layers } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { seriesProgress } from '../services/series';
import { SeriesArt, useSeriesSub } from './SeriesRow';

interface SeriesCardProps {
    name: string;
    parts: ContentItem[];
    typeOf: (id: string) => ContentTypeConfig;
    onOpen: () => void;
    selectionMode?: boolean;
    picked?: number;
    onPickAll?: () => void;
}

/**
 * A series as one poster of the grid: a stack with "×11" on it, opening the
 * series' own page. How many parts are finished sits where a poster keeps its
 * progress.
 */
export const SeriesCard: React.FC<SeriesCardProps> = ({
    name,
    parts,
    typeOf,
    onOpen,
    selectionMode,
    picked = 0,
    onPickAll,
}) => {
    const sub = useSeriesSub(parts, typeOf);
    const { done, total } = seriesProgress(parts);
    const all = picked === parts.length;
    const activate = selectionMode ? onPickAll : onOpen;

    return (
        <div
            className={`zenith-poster zenith-poster--series ${selectionMode && all ? 'is-selected' : ''}`}
            role={selectionMode ? 'checkbox' : 'button'}
            aria-checked={selectionMode ? all : undefined}
            tabIndex={0}
            title={name}
            onClick={activate}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate?.();
                }
            }}
        >
            <SeriesArt parts={parts} typeOf={typeOf} className="zenith-poster__art" iconSize={40}>
                {selectionMode ? (
                    <span className={`zenith-poster__check ${all ? 'is-on' : ''}`} aria-hidden="true">
                        {all && <Check size={12} strokeWidth={3} />}
                    </span>
                ) : (
                    <span className="zenith-poster__count">
                        <Layers size={11} />×{parts.length}
                    </span>
                )}
            </SeriesArt>
            <div className="zenith-poster__body">
                <span className="zenith-poster__title">{name}</span>
                <div className="zenith-poster__meta">
                    <span className="zenith-poster__sub">
                        <span className="zenith-poster__sub-text">{sub}</span>
                    </span>
                    <span className={`zenith-poster__slot ${done === total ? 'is-done' : 'is-muted'}`}>
                        {done}/{total}
                    </span>
                </div>
            </div>
        </div>
    );
};
