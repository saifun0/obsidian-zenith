import type { ZenithSettings } from '../../store/settingsSlice';

/**
 * Which settings travel between devices, and how they merge.
 *
 * Every key of `ZenithSettings` is listed. That is the point of the file, not
 * an accident of it: the map is typed as a total `Record<keyof ZenithSettings,
 * …>`, so adding a setting without deciding whether it syncs is a BUILD ERROR
 * rather than a key that quietly does the wrong thing on someone's phone. Same
 * trick as `coreSchema` in `settings/schema/types.ts`, which forces the same
 * check on settings-form keys.
 */

/** Whether a setting is shared between devices, local to one, or excluded. */
export type SyncScope =
    /** Travels. One value, agreed across every device. */
    | 'shared'
    /** Stays put. Each device keeps its own value, in `data.json`. */
    | 'device'
    /** Never leaves and never merges — local bookkeeping. */
    | 'never';

/**
 * How two competing values for one shared key are reconciled.
 *
 * `lww` is the default and is right for anything the user sets as a single
 * choice. The others exist because last-writer-wins is actively wrong for
 * collections: two devices each adding a different item is not a conflict, it
 * is two additions, and LWW would throw one away.
 */
export type MergeStrategy =
    /** Last writer wins, by HLC. Scalars and single objects. */
    | 'lww'
    /** Array of `{id}` objects, merged element-wise with tombstones. */
    | 'byId'
    /** `Record<string, …>`, merged key-by-key. */
    | 'record'
    /** Array of plain strings, merged as a set with tombstones. */
    | 'set'
    /** The running task timer — a handoff, not a merge. See `stateMerge`. */
    | 'timer';

export interface KeyPolicy {
    scope: SyncScope;
    /** Only consulted for `shared` keys. Defaults to `lww`. */
    merge?: MergeStrategy;
}

/**
 * The classification.
 *
 * `device` covers two families. Layout and chrome, because a phone genuinely
 * wants `compact` and one column where a desktop wants `spacious` and a grid —
 * syncing those means every device fights over the same value and the smaller
 * screen always loses. And view state, because "where you left off" is a
 * property of the screen in front of you, not of the vault.
 *
 * Everything else is shared, including location: `weatherPlace` and
 * `prayerPlace` describe where the user is, and a prayer time computed from the
 * wrong coordinates is simply wrong, not merely inconvenient.
 */
export const STATE_POLICY: Record<keyof ZenithSettings, KeyPolicy> = {
    // ── Storage paths — the vault is shared, so these must be ──
    tasksFolderPath: { scope: 'shared' },
    projectsFolderPath: { scope: 'shared' },
    contentFolderPath: { scope: 'shared' },
    journalFolderPath: { scope: 'shared' },
    journalDateFormat: { scope: 'shared' },
    journalTemplatePath: { scope: 'shared' },

    // ── Journal ──
    journalWeekStart: { scope: 'shared' },
    journalTrackers: { scope: 'shared', merge: 'byId' },
    journalCaptureTasks: { scope: 'shared' },
    journalTaskHeading: { scope: 'shared' },

    // ── Tasks ──
    taskImageAlign: { scope: 'shared' },
    taskImageSize: { scope: 'shared' },

    // ── Content library ──
    contentTypes: { scope: 'shared', merge: 'byId' },
    cacheCovers: { scope: 'shared' },

    // ── Calendar behaviour (config, not view state) ──
    calendarWidgetRowLabel: { scope: 'shared' },
    calendarHorizonDays: { scope: 'shared' },
    calendarShowOverdue: { scope: 'shared' },
    calendarSpanColors: { scope: 'shared' },
    calendarSlotMinutes: { scope: 'shared' },

    // ── Dashboard content (not placement) ──
    dashboardHeading: { scope: 'shared' },
    dashboardHeadingText: { scope: 'shared' },
    dashboardShowDate: { scope: 'shared' },
    dashboardPresets: { scope: 'shared', merge: 'byId' },

    // ── Dashboard wallpaper ──
    // Shared, the mobile switch included: "don't load this on a phone" is a
    // decision about the picture, and the phone is the device that would never
    // get to make it.
    dashboardBgSource: { scope: 'shared' },
    dashboardBgUrl: { scope: 'shared' },
    dashboardBgPath: { scope: 'shared' },
    dashboardBgFit: { scope: 'shared' },
    dashboardBgDim: { scope: 'shared' },
    dashboardBgBlur: { scope: 'shared' },
    dashboardCardOpacity: { scope: 'shared' },
    dashboardBgMobile: { scope: 'shared' },

    // ── Per-copy widget settings ──
    // Merged key by key, like every other bag of buckets: two devices each
    // configuring a different card must not overwrite one another, and a
    // last-writer-wins whole-object copy is exactly how they would.
    widgetConfig: { scope: 'shared', merge: 'record' },

    // ── Prayer ──
    location: { scope: 'shared' },
    prayerPlace: { scope: 'shared' },
    prayerSource: { scope: 'shared' },
    prayerApiMidnight: { scope: 'shared' },
    prayerMethod: { scope: 'shared' },
    prayerFajrAngle: { scope: 'shared' },
    prayerIshaAngle: { scope: 'shared' },
    prayerAsrMadhab: { scope: 'shared' },
    prayerHighLatRule: { scope: 'shared' },
    prayerAdjustments: { scope: 'shared', merge: 'record' },
    prayerShowSunrise: { scope: 'shared' },
    prayerExtras: { scope: 'shared' },
    prayerHijriOffset: { scope: 'shared' },
    // Notification preferences are shared: wanting to be told a prayer has come
    // in is about the person, not the machine. A device that cannot notify
    // simply does nothing with it.
    prayerNotify: { scope: 'shared' },
    prayerNotifyBefore: { scope: 'shared' },

    // ── Notification center ──
    // When not to be disturbed, and by what, is about the person. Whether this
    // machine also raises its own system notification is about the machine —
    // and a phone cannot at all. The records themselves are not settings and
    // are not here: each device keeps its own, beside `data.json`'s settings.
    notifyQuietFrom: { scope: 'shared' },
    notifyQuietTo: { scope: 'shared' },
    notifyMuted: { scope: 'shared' },
    notifySystem: { scope: 'device' },

    // ── Weather ──
    weatherPlace: { scope: 'shared' },
    // Legacy free-text city. Nothing writes it any more, but it still has to
    // travel — a device that has not yet run the one-time geocode migration
    // needs to see the same starting value.
    weatherCity: { scope: 'shared' },
    weatherAllowIpLookup: { scope: 'shared' },
    weatherShowAir: { scope: 'shared' },
    weatherUnit: { scope: 'shared' },
    weatherShowHourly: { scope: 'shared' },
    weatherShowSun: { scope: 'shared' },
    weatherForecastDays: { scope: 'shared' },

    // ── Navigator ──
    navigatorLayout: { scope: 'shared' },
    navigatorShowLabels: { scope: 'shared' },
    // A hide-list, merged as LWW rather than as a set: union would make hiding
    // a button anywhere hide it everywhere with no way to bring it back.
    navigatorHiddenActions: { scope: 'shared' },

    // ── Which features are on ──
    // Shared, because a feature is part of how the person uses the plugin, not
    // of the screen in front of them — and merged key by key, so switching
    // off the heatmap on the phone and the timer on the desktop is two
    // changes, not one that overwrites the other. Whether the MODULE runs is
    // still `activeModuleIds`, which stays per device.
    features: { scope: 'shared', merge: 'record' },

    // ── Identity and chrome that is not layout ──
    // The accent is a personal choice, not a per-screen accommodation, so
    // unlike density it belongs everywhere.
    accentColor: { scope: 'shared' },
    language: { scope: 'shared' },

    // ── Vault decoration ──
    folderIcons: { scope: 'shared', merge: 'record' },

    // ── Media: the collection travels, the current pick does not ──
    mediaSaved: { scope: 'shared', merge: 'set' },

    // ── Third-party modules ──
    // `installedModules` syncing is what makes "installed on the desktop,
    // appears on the phone" work — see the note on the field itself.
    installedModules: { scope: 'shared', merge: 'byId' },
    moduleSettings: { scope: 'shared', merge: 'record' },
    // Consent to run third-party code is deliberately shared: the user made a
    // considered decision once and should not have to repeat it per device.
    allowThirdPartyModules: { scope: 'shared' },

    // ── Live state ──
    activeTimer: { scope: 'shared', merge: 'timer' },

    // ── Device-local: layout and chrome ──
    uiDensity: { scope: 'device' },
    uiAnimations: { scope: 'device' },
    dashboardGrid: { scope: 'device' },
    dashboardLayout: { scope: 'device' },
    dashboardStackOrder: { scope: 'device' },
    // Bundle membership is meaningless without the placement that carries it,
    // and placement is device-local — so these travel together or not at all.
    dashboardBundles: { scope: 'device' },
    dashboardPresetId: { scope: 'device' },
    widgetOrder: { scope: 'device' },
    hiddenWidgetIds: { scope: 'device' },
    // Which image this device shows above its own file explorer. The library it
    // was picked from (`mediaSaved`) is shared.
    mediaSelected: { scope: 'device' },

    // ── Device-local: which modules run here ──
    activeModuleIds: { scope: 'device' },
    defaultModuleId: { scope: 'device' },

    // ── Device-local: where you left off ──
    contentView: { scope: 'device' },
    taskView: { scope: 'device' },
    calendarView: { scope: 'device' },

    // ── Device-local: sync itself ──
    // Whether and how often this device syncs is a property of the device. A
    // shared switch could be flipped off remotely, and there would then be no
    // channel left to flip it back on.
    syncEnabled: { scope: 'device' },
    syncPollSeconds: { scope: 'device' },

    // The whole file-engine configuration is device-local, for two reasons.
    // It describes how THIS machine reaches a server — a phone on a mobile
    // connection may want a different scope, or none at all. And the credentials
    // must not travel: the shared document is plain JSON sitting in the vault,
    // and putting a server password in it would spread the secret to every
    // device and every backup of the vault rather than keeping it where it was
    // entered.
    syncFilesEnabled: { scope: 'device' },
    syncFilesAuto: { scope: 'device' },
    syncFilesIntervalMinutes: { scope: 'device' },
    syncRemoteKind: { scope: 'device' },
    syncRemoteUrl: { scope: 'device' },
    syncS3Endpoint: { scope: 'device' },
    syncS3Region: { scope: 'device' },
    syncS3Bucket: { scope: 'device' },
    syncS3AccessKey: { scope: 'device' },
    syncS3Secret: { scope: 'device' },
    syncS3Prefix: { scope: 'device' },
    syncS3PathStyle: { scope: 'device' },
    syncDropboxClientId: { scope: 'device' },
    syncOnedriveClientId: { scope: 'device' },
    syncOauthFolder: { scope: 'device' },
    // Tokens must never travel. A refresh token in the shared document would be
    // copied to every device and into every backup of the vault, and revoking
    // one device would mean revoking all of them.
    syncDropboxTokens: { scope: 'device' },
    syncOnedriveTokens: { scope: 'device' },
    syncRemoteUser: { scope: 'device' },
    syncRemotePassword: { scope: 'device' },
    syncRemoteDir: { scope: 'device' },
    syncEncryptionEnabled: { scope: 'device' },
    syncEncryptionPassword: { scope: 'device' },
    syncLocalRoot: { scope: 'device' },
    syncIncludeConfigDir: { scope: 'device' },
    syncExcludes: { scope: 'device' },
    syncConflictAction: { scope: 'device' },
    syncProtectPercent: { scope: 'device' },
    syncMaxFileMb: { scope: 'device' },
    syncConcurrency: { scope: 'device' },

    // ── Never ──
    // Each device runs its own migrations against its own stored config; a
    // version number arriving from elsewhere would claim migrations had run
    // here that have not.
    settingsVersion: { scope: 'never' },
};

export type SettingsKey = keyof ZenithSettings;

const ALL_KEYS = Object.keys(STATE_POLICY) as SettingsKey[];

function keysWithScope(scope: SyncScope): SettingsKey[] {
    return ALL_KEYS.filter((k) => STATE_POLICY[k].scope === scope);
}

/** Keys that travel between devices. */
export const SHARED_KEYS: SettingsKey[] = keysWithScope('shared');

/** Keys each device keeps to itself. */
export const DEVICE_KEYS: SettingsKey[] = keysWithScope('device');

export function scopeOf(key: SettingsKey): SyncScope {
    return STATE_POLICY[key]?.scope ?? 'never';
}

export function mergeStrategyOf(key: SettingsKey): MergeStrategy {
    return STATE_POLICY[key]?.merge ?? 'lww';
}

/**
 * Split a full settings object into the part that travels and the part that
 * stays. Keys scoped `never` appear in neither — they are not "device state",
 * they are simply not part of this system.
 */
export function partition(settings: ZenithSettings): {
    shared: Partial<ZenithSettings>;
    device: Partial<ZenithSettings>;
} {
    const shared: Record<string, unknown> = {};
    const device: Record<string, unknown> = {};
    for (const key of ALL_KEYS) {
        const value = settings[key];
        if (value === undefined) continue;
        if (STATE_POLICY[key].scope === 'shared') shared[key] = value;
        else if (STATE_POLICY[key].scope === 'device') device[key] = value;
    }
    return {
        shared: shared as Partial<ZenithSettings>,
        device: device as Partial<ZenithSettings>,
    };
}
