import { apiVersion, Notice, requestUrl } from 'obsidian';
import { translateNow } from './i18n';
import { isFeatureOn } from './useFeature';

/**
 * Telling you, once Obsidian has started, that a newer Zenith is out.
 *
 * Obsidian checks for plugin updates by itself only every few days. This asks
 * the same place it does — the plugin's `manifest.json` at the head of its
 * repository, which is what the community directory reads — and when the
 * version there is newer, says so. The notice opens Zenith's page in
 * Obsidian's own plugin browser, where the update is one button: Zenith never
 * downloads or installs anything itself.
 *
 * A version that needs a newer Obsidian than this one is not offered, since
 * Obsidian would not install it either. Nothing is remembered: the check is
 * one small request per start, and it stops the moment you have updated.
 */

const REPOSITORY = 'saifun0/obsidian-zenith';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPOSITORY}/HEAD/manifest.json`;

/** Long enough for Obsidian to open its notes before a notice arrives over them. */
const DELAY_MS = 5000;

export interface LatestRelease {
    version: string;
    minAppVersion: string;
}

/** Start the check once the workspace is ready. Returns what cancels it. */
export function scheduleUpdateCheck(pluginId: string, current: string): () => void {
    const timer = window.setTimeout(() => void checkForUpdate(pluginId, current), DELAY_MS);
    return () => window.clearTimeout(timer);
}

async function checkForUpdate(pluginId: string, current: string): Promise<void> {
    if (!isFeatureOn('core.updateCheck')) return;
    // Offline, or GitHub not answering: there is nothing to say, and saying
    // that the check failed would be a notice about nothing.
    let latest: LatestRelease | null = null;
    try {
        const res = await requestUrl({ url: MANIFEST_URL, throw: false });
        if (res.status === 200) latest = parseLatest(res.json);
    } catch {
        return;
    }
    if (!latest || !isNewer(latest.version, current)) return;
    if (isNewer(latest.minAppVersion, apiVersion)) return;
    showNotice(pluginId, latest.version);
}

/** The two fields read from the published manifest; anything else is no answer. */
export function parseLatest(raw: unknown): LatestRelease | null {
    if (!raw || typeof raw !== 'object') return null;
    const { version, minAppVersion } = raw as Record<string, unknown>;
    if (typeof version !== 'string' || !parseVersion(version)) return null;
    return {
        version,
        minAppVersion: typeof minAppVersion === 'string' ? minAppVersion : '0.0.0',
    };
}

/** Whether `candidate` is a later `x.y.z` than `current`. Anything unreadable is not. */
export function isNewer(candidate: string, current: string): boolean {
    const a = parseVersion(candidate);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

function parseVersion(version: string): [number, number, number] | null {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function showNotice(pluginId: string, version: string): void {
    const fragment = createFragment();
    const root = fragment.createDiv({ cls: 'zenith-update-notice' });
    root.createDiv({
        cls: 'zenith-update-notice__title',
        text: translateNow('update.available', { version }),
    });
    const link = root.createDiv({
        cls: 'zenith-update-notice__link',
        text: translateNow('update.open'),
    });

    // Until it is dealt with: pressed, it opens the update; anywhere else on
    // the notice, Obsidian closes it until the next start.
    const notice = new Notice(fragment, 0);
    notice.containerEl.addClass('zenith-notice');
    link.addEventListener('click', (e) => {
        e.stopPropagation();
        notice.hide();
        // Obsidian's own link for a plugin's page in its browser, opened the
        // way Obsidian opens one found in a note.
        window.open(`obsidian://show-plugin?id=${encodeURIComponent(pluginId)}`);
    });
}
