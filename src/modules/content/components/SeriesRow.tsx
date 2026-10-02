import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { resolveCover } from '../services/coverUrl';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { cssUrl } from '../../../core/imageSource';

/**
 * A series' face: the cover of its first part that has one (or its type's
 * mark), with the edges of the parts behind it showing.
 */
export const SeriesArt: React.FC<{
    parts: readonly ContentItem[];
    typeOf: (id: string) => ContentTypeConfig;
    className: string;
    iconSize: number;
    children?: React.ReactNode;
}> = ({ parts, typeOf, className, iconSize, children }) => {
    const { app } = useApp();
    const withCover = parts.find((p) => p.coverImage);
    const cover = withCover ? resolveCover(app, withCover.coverImage) : undefined;
    const type = typeOf((withCover ?? parts[0]).type);
    return (
        <span
            className={`${className} zenith-stack`}
            style={
                cover
                    ? { backgroundImage: cssUrl(cover) }
                    : { background: `linear-gradient(160deg, ${type.color}44, ${type.color}18)`, color: type.color }
            }
        >
            {!cover && <ObsidianIcon name={type.icon} size={iconSize} />}
            {children}
        </span>
    );
};

/** "8 parts · Anime" — the type only when every part is of it. */
export function useSeriesSub(parts: readonly ContentItem[], typeOf: (id: string) => ContentTypeConfig): string {
    const t = useTranslation();
    const types = new Set(parts.map((p) => p.type));
    return [t.plural('content.series.parts', parts.length), types.size === 1 ? typeOf(parts[0].type).label : null]
        .filter(Boolean)
        .join(' · ');
}

interface SeriesRowProps {
    name: string;
    parts: ContentItem[];
    typeOf: (id: string) => ContentTypeConfig;
    expanded: boolean;
    onToggle: () => void;
    onOpen: () => void;
    /** The parts' own rows, shown under the series while it is open. */
    renderPart: (item: ContentItem) => React.ReactNode;
    selectionMode?: boolean;
    /** How many of the parts are picked, in selection mode. */
    picked?: number;
    onPickAll?: () => void;
}

/**
 * A series as one line of the list: its parts folded under it.
 *
 * The name opens the series' own page; the arrow unfolds the parts in place,
 * each an ordinary row with its "+1" and heart. In selection mode the line
 * picks every part it holds.
 */
export const SeriesRow: React.FC<SeriesRowProps> = ({
    name,
    parts,
    typeOf,
    expanded,
    onToggle,
    onOpen,
    renderPart,
    selectionMode,
    picked = 0,
    onPickAll,
}) => {
    const t = useTranslation();
    const sub = useSeriesSub(parts, typeOf);
    const all = picked === parts.length;

    return (
        <div className={`zenith-cseries ${expanded ? 'is-open' : ''}`}>
            <div className={`zenith-crow zenith-cseries__row ${selectionMode && all ? 'is-selected' : ''}`}>
                <button
                    type="button"
                    className="zenith-cseries__open"
                    role={selectionMode ? 'checkbox' : undefined}
                    aria-checked={selectionMode ? all : undefined}
                    onClick={selectionMode ? onPickAll : onOpen}
                >
                    <SeriesArt parts={parts} typeOf={typeOf} className="zenith-crow__art" iconSize={15}>
                        {selectionMode && (
                            <span className={`zenith-poster__check ${all ? 'is-on' : ''}`} aria-hidden="true">
                                {all && <Check size={12} strokeWidth={3} />}
                            </span>
                        )}
                    </SeriesArt>
                    <span className="zenith-crow__main">
                        <span className="zenith-crow__title">{name}</span>
                        <span className="zenith-crow__sub">{sub}</span>
                    </span>
                </button>
                <button
                    type="button"
                    className="zenith-cseries__toggle"
                    aria-expanded={expanded}
                    aria-label={t.plural('content.series.parts', parts.length)}
                    onClick={onToggle}
                >
                    <ChevronRight size={15} />
                </button>
            </div>
            {expanded && <div className="zenith-cseries__parts">{parts.map(renderPart)}</div>}
        </div>
    );
};
