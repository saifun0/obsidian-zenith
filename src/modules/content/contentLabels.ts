import type { Translator } from '../../core/i18n';
import type { ContentStatus } from '../../core/constants';
import { DEFAULT_CONTENT_TYPES, type ContentTypeConfig } from '../../core/contentTypes';

/**
 * What the library calls things: its statuses, in the words each kind of item
 * wants, their colours and order, and the built-in types in the reader's own
 * language.
 *
 * One place, because five components used to carry their own copy of the
 * status table, and adding a status meant finding all five.
 */

/**
 * The order statuses are listed in: what you are on now, what you paused, what
 * is next, then what is behind you.
 */
export const STATUS_ORDER: readonly ContentStatus[] = [
    'in-progress',
    'on-hold',
    'backlog',
    'completed',
    'dropped',
];

/** One colour per status, the same in the list, the statistics and the widget. */
export const STATUS_COLOR: Record<ContentStatus, string> = {
    'in-progress': '#3b82f6',
    'on-hold': '#f59e0b',
    backlog: '#6b7280',
    completed: '#10b981',
    dropped: '#ef4444',
};

/** How a kind of item is taken in, which decides the words for its statuses. */
type Family = 'read' | 'watch' | 'play' | 'listen';

const FAMILY: Readonly<Record<string, Family>> = {
    book: 'read',
    manga: 'read',
    movie: 'watch',
    show: 'watch',
    anime: 'watch',
    game: 'play',
    music: 'listen',
};

/** The key for a status in words, without regard to what it is a status of. */
const GENERIC: Record<ContentStatus, string> = {
    backlog: 'content.status.backlog',
    'in-progress': 'content.status.inProgress',
    'on-hold': 'content.status.onHold',
    completed: 'content.status.completed',
    dropped: 'content.status.dropped',
};

/**
 * A status in words. Given a type, the two statuses that are verbs take its
 * verb — "Reading" for a book, "Watching" for anime, "Played" for a game.
 * Without one (a list of several types, the statistics), they stay general.
 * A type the user made has no verb of its own and stays general too.
 */
export function statusLabel(t: Translator, status: ContentStatus, typeId?: string): string {
    const family = typeId ? FAMILY[typeId] : undefined;
    if (family && (status === 'in-progress' || status === 'completed')) {
        return t(`content.status.${family}.${status === 'in-progress' ? 'inProgress' : 'completed'}`);
    }
    return t(GENERIC[status]);
}

/** The English words a built-in type ships with, and the keys that translate them. */
const UNIT_KEY: Readonly<Record<string, string>> = {
    pages: 'content.unit.pages',
    minutes: 'content.unit.minutes',
    episodes: 'content.unit.episodes',
    chapters: 'content.unit.chapters',
    hours: 'content.unit.hours',
    tracks: 'content.unit.tracks',
    units: 'content.unit.units',
};

/**
 * A type in the reader's language — for as long as its words are the ones it
 * shipped with. Once renamed in settings, a label, a creator label or a unit
 * is the user's own and is shown as they wrote it.
 */
export function localizeType(t: Translator, type: ContentTypeConfig): ContentTypeConfig {
    const builtin = DEFAULT_CONTENT_TYPES.find((d) => d.id === type.id);
    const unitKey = type.progressUnit ? UNIT_KEY[type.progressUnit] : undefined;
    return {
        ...type,
        label: builtin && type.label === builtin.label ? t(`content.type.${type.id}.label`) : type.label,
        creatorLabel:
            builtin && type.creatorLabel === builtin.creatorLabel
                ? t(`content.creator.${type.id}.label`)
                : type.creatorLabel,
        progressUnit: unitKey ? t(unitKey) : type.progressUnit,
    };
}
