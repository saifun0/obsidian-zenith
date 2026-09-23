import type { Translator } from '../../core/i18n';
import { countLine } from './progressFormat';
import { relativeTime } from './relativeTime';
import type { FileSyncStatus } from './services/fileSync';

/**
 * What the status bar says about vault sync, decided without any DOM.
 *
 * Pure so the order of the states can be tested, because the order IS the
 * design: several of them can be true at once — a held plan left over from an
 * hour ago while a new check runs, an error from the last run while the
 * network is down — and the bar has room for exactly one.
 */

/** How loud the item is. `quiet` is faint, `held` and `error` are coloured. */
export type SyncBarTone = 'quiet' | 'normal' | 'held' | 'error';

/** Which glyph; the component maps these to icons. */
export type SyncBarIcon = 'cloud' | 'offline' | 'sync' | 'held' | 'error';

export interface SyncBarState {
    tone: SyncBarTone;
    icon: SyncBarIcon;
    spinning: boolean;
    /** The few characters beside the icon. Empty for the icon alone. */
    text: string;
    /** The whole sentence, for the tooltip. */
    tooltip: string;
}

/**
 * The bar for a status, or null when there is nothing to report on.
 *
 * Null when file sync is not configured: an item saying "sync is off" on every
 * vault that never wanted sync is a permanent fixture about nothing.
 */
export function syncBarState(
    status: FileSyncStatus,
    online: boolean,
    t: Translator
): SyncBarState | null {
    if (!status.configured) return null;

    // A transfer outranks everything: it is the one state that changes by the
    // second, and the count is what someone glancing down wants to see.
    if (status.running && status.progress) {
        const count = countLine(status.progress);
        return {
            tone: 'normal',
            icon: 'sync',
            spinning: true,
            text: count,
            tooltip: `${t('sync.progress.title')} · ${count}`,
        };
    }

    if (status.error) {
        return {
            tone: 'error',
            icon: 'error',
            spinning: false,
            text: t('sync.bar.error'),
            tooltip: `${t('sync.progress.failed')}: ${status.error}`,
        };
    }

    // Waiting on a person, so it says so until they look — the notice that
    // announced it was on screen for fifteen seconds; this stays.
    if (status.plan && !status.running) {
        return {
            tone: 'held',
            icon: 'held',
            spinning: false,
            text: t('sync.bar.held'),
            tooltip: t('sync.auto.held'),
        };
    }

    // The last run finished but left files behind, and nothing has confirmed
    // the two sides agree since.
    const failed = status.lastResult?.failed ?? [];
    if (failed.length > 0 && status.lastRunAt > status.checkedAt) {
        return {
            tone: 'error',
            icon: 'error',
            spinning: false,
            text: t('sync.bar.failed', { count: failed.length }),
            tooltip: t('sync.bar.failedTip', { key: failed[0].key, error: failed[0].error }),
        };
    }

    const when = status.checkedAt ? relativeTime(t, status.checkedAt) : '';

    // Checking is not worth a different label: it happens on every focus and
    // is over in a second or two, and a label that changes width each time
    // shoves every other item in the bar sideways. The icon turns; the words
    // stay.
    if (status.running) {
        return {
            tone: 'normal',
            icon: 'sync',
            spinning: true,
            text: when,
            tooltip: t('sync.bar.checking'),
        };
    }

    if (!online) {
        return {
            tone: 'quiet',
            icon: 'offline',
            spinning: false,
            text: when,
            tooltip: t('sync.bar.offline'),
        };
    }

    if (!status.checkedAt) {
        return {
            tone: 'quiet',
            icon: 'cloud',
            spinning: false,
            text: '',
            tooltip: t('sync.bar.notYet'),
        };
    }

    return {
        tone: 'normal',
        icon: 'cloud',
        spinning: false,
        text: when,
        tooltip: t('sync.bar.synced', { when }),
    };
}
