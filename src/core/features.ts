import type { ZenithSettings } from '../store/settingsSlice';

/**
 * The feature registry: one list of everything the plugin can do that a person
 * might not want, and whether it is on.
 *
 * The idea the plugin is built around is that anything you do not use can be
 * switched off — and "off" has to mean off. A feature that is switched off
 * draws nothing, writes nothing, fetches nothing and sets no timer. That is
 * the promise each gate in the code keeps; this file only answers the
 * question the gates ask.
 *
 * One list rather than a toggle per page, because three things read it: the
 * settings form draws each module's "Features" group from it, profiles apply
 * and export it, and the gates ask it. A toggle living anywhere else is one
 * of those three that would not know about it.
 *
 * Pure, and free of the store, so the settings migration can read it too; the
 * hooks live in `useFeature.ts`.
 */

/** Settings keys that hold a plain boolean — the only kind a feature can live in. */
export type BooleanSettingKey = {
    [K in keyof ZenithSettings]-?: ZenithSettings[K] extends boolean ? K : never;
}[keyof ZenithSettings];

export interface FeatureDefinition {
    /** `module.feature` — `tasks.heatmap`. */
    id: string;
    /** The module it belongs to — `core` for what no module owns. */
    moduleId: string;
    labelKey: string;
    descKey: string;
    /**
     * The state on a fresh install, and for a feature newer than the user's
     * config. What an existing user already had is pinned by the migration
     * that introduced this registry, so changing a default here never takes
     * anything away from them.
     */
    default: boolean;
    /** Features that must be on for this one to work. */
    requires?: readonly string[];
    /** Modules that must be running as well as its own. */
    requiresModules?: readonly string[];
    /**
     * An existing switch that already stores this feature's state.
     *
     * Those switches predate the registry and are not renamed: a synced
     * config, a profile and the user's own `data.json` all know them by the
     * old name. The registry reads and writes them where they are.
     */
    settingKey?: BooleanSettingKey;
    /**
     * Switched on only by the user's own hand: no template turns it on — not
     * even "Everything" — and applying one leaves it as it was. For features
     * that ask something personal before they can show anything at all.
     */
    manual?: boolean;
}

/** The pseudo-module of what no module owns — always running. */
export const CORE_MODULE = 'core';

/** The notification center's page. Not a module either, and always running. */
export const NOTIFICATIONS_MODULE = 'notifications';

/** Pseudo-modules: pages of settings with no module behind them to switch off. */
const ALWAYS_RUNNING: ReadonlySet<string> = new Set([CORE_MODULE, NOTIFICATIONS_MODULE]);

interface FeatureOptions {
    default?: boolean;
    requires?: readonly string[];
    requiresModules?: readonly string[];
    settingKey?: BooleanSettingKey;
    manual?: boolean;
}

/** One entry; the string keys follow from the id. */
function feature<const I extends string>(
    id: I,
    moduleId: string,
    options: FeatureOptions = {}
): FeatureDefinition & { id: I } {
    return {
        id,
        moduleId,
        labelKey: `feature.${id}`,
        descKey: `feature.${id}.desc`,
        default: options.default ?? true,
        requires: options.requires,
        requiresModules: options.requiresModules,
        settingKey: options.settingKey,
        manual: options.manual,
    };
}

/**
 * Every built-in feature, grouped by module in the order the settings page
 * lists them.
 *
 * A module being switched off switches off everything in it, so nothing here
 * repeats that: a feature is a part of a module someone might want without,
 * not the module itself. Modules that do one thing (the navigator, the
 * picture, the media banner) have no entries — their module switch is the
 * feature switch.
 */
export const FEATURES = [
    // ── Outside any module ──
    feature('core.folderIcons', CORE_MODULE),
    feature('core.vaultScaffold', CORE_MODULE),
    feature('notify.center', NOTIFICATIONS_MODULE),

    // ── Dashboard ──
    feature('dashboard.date', 'dashboard', { settingKey: 'dashboardShowDate', default: false }),
    feature('dashboard.background', 'dashboard'),
    feature('dashboard.presets', 'dashboard'),
    feature('dashboard.openOnStartup', 'dashboard'),
    feature('dashboard.periodProgress', 'dashboard'),
    feature('dashboard.countdowns', 'dashboard'),
    feature('dashboard.lifeWeeks', 'dashboard', { default: false, manual: true }),

    // ── Tasks ──
    feature('tasks.captureDaily', 'tasks', {
        settingKey: 'journalCaptureTasks',
        requiresModules: ['journal'],
    }),
    feature('tasks.naturalInput', 'tasks'),
    // Off by default: any web page can open an `obsidian://` link.
    feature('tasks.uriCapture', 'tasks', { default: false }),
    // Off by default, like prayer reminders: a plugin that starts interrupting
    // after an update has not been asked to.
    feature('tasks.reminders', 'tasks', { default: false }),
    feature('tasks.subtasks', 'tasks'),
    feature('tasks.attachments', 'tasks'),
    feature('tasks.timer', 'tasks'),
    feature('tasks.dragDrop', 'tasks'),
    feature('tasks.smartGroups', 'tasks'),
    feature('tasks.fileGroups', 'tasks'),
    feature('tasks.stats', 'tasks'),
    feature('tasks.heatmap', 'tasks', { requires: ['tasks.stats'] }),
    feature('tasks.widget', 'tasks'),

    // ── Calendar ──
    feature('calendar.timeViews', 'tasks-calendar'),
    feature('calendar.allHours', 'tasks-calendar', { requires: ['calendar.timeViews'] }),
    feature('calendar.dragSchedule', 'tasks-calendar', { requires: ['calendar.timeViews'] }),
    feature('calendar.agenda', 'tasks-calendar'),
    feature('calendar.spans', 'tasks-calendar'),
    feature('calendar.dailyNotes', 'tasks-calendar', { requiresModules: ['journal'] }),
    feature('calendar.spotlight', 'tasks-calendar'),
    feature('calendar.widget', 'tasks-calendar'),
    feature('calendar.overdue', 'tasks-calendar', {
        settingKey: 'calendarShowOverdue',
        requires: ['calendar.widget'],
    }),

    // ── Projects ──
    feature('projects.taskLinks', 'projects', { requiresModules: ['tasks'] }),
    feature('projects.widget', 'projects'),

    // ── Journal ──
    feature('journal.dailyBlock', 'journal'),
    feature('journal.moodColors', 'journal'),
    feature('journal.habitMonth', 'journal'),
    feature('journal.goals', 'journal'),
    feature('journal.quitHabits', 'journal'),
    feature('journal.yearPixels', 'journal'),
    // Off by default: a line in every day's note is not something to add unasked.
    feature('journal.dailyPrompt', 'journal', { default: false }),
    feature('journal.rituals', 'journal'),
    feature('journal.reviews', 'journal'),
    feature('journal.yearInReview', 'journal'),
    feature('journal.wordCount', 'journal'),
    feature('journal.stats', 'journal'),
    feature('journal.widget', 'journal'),

    // ── Content ──
    feature('content.resume', 'content'),
    feature('content.quickIncrement', 'content'),
    feature('content.multiSelect', 'content'),
    feature('content.genreFilter', 'content'),
    feature('content.import', 'content'),
    feature('content.readings', 'content'),
    feature('content.challenge', 'content'),
    feature('content.stats', 'content'),
    feature('content.widget', 'content'),

    // ── Prayer ──
    feature('prayer.sunrise', 'prayer', { settingKey: 'prayerShowSunrise' }),
    feature('prayer.extras', 'prayer'),
    feature('prayer.hijri', 'prayer'),
    feature('prayer.weekStrip', 'prayer'),
    feature('prayer.stats', 'prayer'),
    feature('prayer.reminders', 'prayer', { settingKey: 'prayerNotify', default: false }),
    feature('prayer.fasting', 'prayer'),
    feature('prayer.fastingHints', 'prayer', { requires: ['prayer.fasting'] }),
    feature('prayer.iftarSuhoor', 'prayer'),
    feature('prayer.widget', 'prayer'),

    // ── Weather ──
    feature('weather.hourly', 'weather', { settingKey: 'weatherShowHourly' }),
    feature('weather.sun', 'weather', { settingKey: 'weatherShowSun' }),
    feature('weather.air', 'weather', { settingKey: 'weatherShowAir' }),
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];

const BY_ID = new Map<string, FeatureDefinition>(FEATURES.map((def) => [def.id, def]));

export function getFeature(id: string): FeatureDefinition | undefined {
    return BY_ID.get(id);
}

/** A module's features, in registry order. */
export function featuresOf(moduleId: string): FeatureDefinition[] {
    return FEATURES.filter((def) => def.moduleId === moduleId);
}

/** What a feature's state is read from: the settings, or a slice of them. */
export type FeatureSettings = Pick<ZenithSettings, 'features' | 'activeModuleIds'> &
    Partial<Pick<ZenithSettings, BooleanSettingKey>>;

/** The feature's own switch, before anything it depends on is asked. */
export function ownFeatureValue(settings: FeatureSettings, def: FeatureDefinition): boolean {
    const stored = def.settingKey ? settings[def.settingKey] : settings.features?.[def.id];
    return typeof stored === 'boolean' ? stored : def.default;
}

/** Why a feature whose own switch is on still does not run. */
export type FeatureBlock =
    { kind: 'module'; moduleId: string } | { kind: 'feature'; featureId: string };

/**
 * The first thing standing in a feature's way, or null when nothing is.
 *
 * Its own module comes first: a feature of a module switched off on this
 * device is off here, whatever the shared switch says. Then the modules and
 * features it needs. A cycle in `requires` is a mistake in this file, and
 * the registry test catches one; `seen` only keeps a mistake from hanging.
 */
export function featureBlock(
    settings: FeatureSettings,
    id: string,
    seen: Set<string> = new Set()
): FeatureBlock | null {
    const def = BY_ID.get(id);
    if (!def) return null;
    for (const moduleId of [def.moduleId, ...(def.requiresModules ?? [])]) {
        if (!ALWAYS_RUNNING.has(moduleId) && !settings.activeModuleIds.includes(moduleId)) {
            return { kind: 'module', moduleId };
        }
    }
    seen.add(id);
    for (const required of def.requires ?? []) {
        if (seen.has(required)) continue;
        if (!featureEnabled(settings, required, seen))
            return { kind: 'feature', featureId: required };
    }
    return null;
}

/**
 * Whether a feature runs: its own switch is on and nothing it needs is off.
 * An id nobody registered is off — there is nothing to run.
 */
export function featureEnabled(
    settings: FeatureSettings,
    id: string,
    seen: Set<string> = new Set()
): boolean {
    const def = BY_ID.get(id);
    if (!def) return false;
    return ownFeatureValue(settings, def) && featureBlock(settings, id, seen) === null;
}

/** The settings change that turns a feature on or off. */
export function featurePatch(
    settings: FeatureSettings,
    id: string,
    on: boolean
): Partial<ZenithSettings> {
    const def = BY_ID.get(id);
    if (!def) return {};
    if (def.settingKey) return { [def.settingKey]: on };
    return { features: { ...settings.features, [id]: on } };
}

/**
 * Pin every feature that is on by default, for a config written before the
 * registry existed.
 *
 * Its owner is using all of these today, and "what works now stays on" should
 * not depend on the defaults above never changing. Features stored in their
 * own setting need nothing: their value is already in the config.
 */
export function pinnedFeatures(existing: Record<string, boolean>): Record<string, boolean> {
    const out = { ...existing };
    for (const def of FEATURES) {
        if (!def.settingKey && def.default && typeof out[def.id] !== 'boolean') out[def.id] = true;
    }
    return out;
}
