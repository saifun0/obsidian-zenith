import type { App } from 'obsidian';
import { DEFAULT_JOURNAL_FORMAT } from '../../../core/constants';
import { normalizeFolder } from './journalDates';

/**
 * Obsidian ships its own **Daily notes** core plugin, and Zenith's journal is
 * deliberately independent of it: its own folder, its own pattern, its own
 * template. That independence has one failure mode worth naming — with both
 * enabled and pointed at different places, "today's note" means two different
 * files and half the entries quietly land in the one you're not looking at.
 *
 * So we read the core plugin's own config off disk and, when the two disagree,
 * say so in settings. We never write to it and never silently adopt it.
 *
 * The config files are read through the vault adapter rather than the
 * `app.internalPlugins` object, which is undocumented and unstable; a missing
 * or malformed file simply means "no conflict to report".
 */

export interface DailyNotesConfig {
    /** Whether Obsidian's core Daily notes plugin is switched on. */
    enabled: boolean;
    /** Its folder (empty = vault root). */
    folder: string;
    /** Its filename pattern. */
    format: string;
}

async function readJson(app: App, name: string): Promise<unknown> {
    const path = `${app.vault.configDir}/${name}`;
    try {
        if (!(await app.vault.adapter.exists(path))) return null;
        return JSON.parse(await app.vault.adapter.read(path));
    } catch {
        return null;
    }
}

/** Read the core Daily notes plugin's state, or null if it can't be determined. */
export async function readDailyNotesConfig(app: App): Promise<DailyNotesConfig | null> {
    const core = await readJson(app, 'core-plugins.json');
    if (core === null) return null;

    // Older Obsidian wrote a plain array of enabled ids; newer writes a map.
    const enabled = Array.isArray(core)
        ? core.includes('daily-notes')
        : (core as Record<string, boolean>)['daily-notes'] === true;

    const config = ((await readJson(app, 'daily-notes.json')) ?? {}) as Record<string, unknown>;
    return {
        enabled,
        folder: typeof config.folder === 'string' ? config.folder : '',
        format: typeof config.format === 'string' && config.format ? config.format : DEFAULT_JOURNAL_FORMAT,
    };
}

/**
 * Whether the core plugin is enabled and would write today's note somewhere
 * other than Zenith does. Same folder *and* same pattern means the two agree —
 * both open the same file, and there is nothing to warn about.
 */
export function dailyNotesConflict(
    core: DailyNotesConfig | null,
    journalFolder: string,
    journalFormat: string
): DailyNotesConfig | null {
    if (!core || !core.enabled) return null;
    const sameFolder = normalizeFolder(core.folder) === normalizeFolder(journalFolder);
    const sameFormat = core.format === (journalFormat || DEFAULT_JOURNAL_FORMAT);
    return sameFolder && sameFormat ? null : core;
}
