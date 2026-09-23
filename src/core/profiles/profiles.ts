import type { ZenithSettings } from '../../store/settingsSlice';
import { FEATURES, featurePatch, getFeature, ownFeatureValue } from '../features';

/**
 * Profiles: the whole shape of how someone uses the plugin — which modules
 * run, which features are on, and the settings that go with them — as one
 * thing that can be saved, applied, undone, and passed to someone else.
 *
 * Pure: settings in, patches and reports out. The store, the files and the
 * dialogs live elsewhere.
 */

export const PROFILE_FORMAT = 'profile';
export const PROFILE_VERSION = 1;

/** The file format. The field names are the contract; see `docs/*\/profiles.md`. */
export interface Profile {
    zenith: typeof PROFILE_FORMAT;
    version: typeof PROFILE_VERSION;
    name: string;
    /** Local `YYYY-MM-DD`. */
    createdAt: string;
    /** Modules that are on. */
    modules: string[];
    /** Every feature's own switch, by id. */
    features: Record<string, boolean>;
    settings: Partial<ZenithSettings>;
}

/** A profile kept in the settings. */
export interface StoredProfile extends Profile {
    id: string;
    /** The one taken on upgrade, named by the interface rather than by the user. */
    kind?: 'before';
}

/** The id of the "before profiles" snapshot — fixed, so two devices keep one. */
export const BEFORE_PROFILES_ID = 'before-profiles';

/**
 * Whether a setting travels in a profile.
 *
 * - `yes` — a preference, safe to hand to anyone.
 * - `path` — a folder or file in this vault. Someone else's vault has other
 *   folders, so only when asked for.
 * - `place` — where the user is. Personal, so only when asked for.
 * - `feature` — the switch of a feature, carried in `features` instead.
 * - `no` — never: credentials, tokens, the encryption password, code the
 *   user approved to run, live state, where things are on this screen.
 *
 * Every key is listed, and the map is typed as total, so a new setting is a
 * build error until somebody decides — the same device `statePolicy` uses.
 * A setting with a secret in it must never be `yes`, and the test for this
 * file checks every credential by name.
 */
export type ProfileKeyPolicy = 'yes' | 'path' | 'place' | 'feature' | 'no';

export const PROFILE_POLICY: Record<keyof ZenithSettings, ProfileKeyPolicy> = {
    // ── Where things are in this vault ──
    tasksFolderPath: 'path',
    contentFolderPath: 'path',
    projectsFolderPath: 'path',
    journalFolderPath: 'path',
    journalTemplatePath: 'path',
    dashboardBgPath: 'path',
    folderIcons: 'path',

    // ── Where the user is ──
    location: 'place',
    prayerPlace: 'place',
    weatherPlace: 'place',
    weatherCity: 'place',

    // ── Features stored in settings of their own ──
    journalCaptureTasks: 'feature',
    calendarShowOverdue: 'feature',
    dashboardShowDate: 'feature',
    prayerShowSunrise: 'feature',
    prayerNotify: 'feature',
    weatherShowAir: 'feature',
    weatherShowHourly: 'feature',
    weatherShowSun: 'feature',

    // ── Preferences ──
    taskImageAlign: 'yes',
    taskImageSize: 'yes',
    journalDateFormat: 'yes',
    journalWeekStart: 'yes',
    journalTrackers: 'yes',
    journalTaskHeading: 'yes',
    contentTypes: 'yes',
    calendarWidgetRowLabel: 'yes',
    calendarHorizonDays: 'yes',
    calendarSpanColors: 'yes',
    calendarSlotMinutes: 'yes',
    dashboardHeading: 'yes',
    dashboardHeadingText: 'yes',
    dashboardBgSource: 'yes',
    dashboardBgUrl: 'yes',
    dashboardBgFit: 'yes',
    dashboardBgDim: 'yes',
    dashboardBgBlur: 'yes',
    dashboardCardOpacity: 'yes',
    dashboardBgMobile: 'yes',
    prayerSource: 'yes',
    prayerApiMidnight: 'yes',
    prayerMethod: 'yes',
    prayerFajrAngle: 'yes',
    prayerIshaAngle: 'yes',
    prayerAsrMadhab: 'yes',
    prayerHighLatRule: 'yes',
    prayerRounding: 'yes',
    prayerFallback: 'yes',
    prayerMethodChosen: 'yes',
    prayerAdjustments: 'yes',
    prayerExtras: 'yes',
    prayerHijriOffset: 'yes',
    prayerNotifyBefore: 'yes',
    taskRemindBefore: 'yes',
    taskDigestHour: 'yes',
    notifyQuietFrom: 'yes',
    notifyQuietTo: 'yes',
    notifySystem: 'yes',
    notifyMuted: 'yes',
    navigatorLayout: 'yes',
    navigatorShowLabels: 'yes',
    navigatorHiddenActions: 'yes',
    uiDensity: 'yes',
    uiAnimations: 'yes',
    accentColor: 'yes',
    defaultModuleId: 'yes',
    language: 'yes',
    weatherAllowIpLookup: 'yes',
    weatherUnit: 'yes',
    weatherForecastDays: 'yes',

    // ── Carried separately ──
    activeModuleIds: 'no',
    features: 'no',

    // ── Never ──
    // Profiles do not nest, and undo is about this device's last change.
    profiles: 'no',
    profileUndo: 'no',
    profilesOnboarded: 'no',
    settingsVersion: 'no',
    // Code the user approved to run, and its private settings — a profile is
    // not a way to install or configure a stranger's module.
    moduleSettings: 'no',
    allowThirdPartyModules: 'no',
    installedModules: 'no',
    // Live state, and the arrangement of this screen.
    activeTimer: 'no',
    widgetConfig: 'no',
    widgetOrder: 'no',
    hiddenWidgetIds: 'no',
    dashboardLayout: 'no',
    dashboardBundles: 'no',
    dashboardStackOrder: 'no',
    dashboardPresets: 'no',
    dashboardPresetId: 'no',
    dashboardGrid: 'no',
    mediaSelected: 'no',
    mediaSaved: 'no',
    contentView: 'no',
    taskView: 'no',
    calendarView: 'no',
    // Sync, every part of it: servers, accounts, passwords, tokens, keys.
    syncEnabled: 'no',
    syncPollSeconds: 'no',
    syncFilesEnabled: 'no',
    syncFilesAuto: 'no',
    syncFilesIntervalMinutes: 'no',
    syncRemoteKind: 'no',
    syncRemoteUrl: 'no',
    syncRemoteUser: 'no',
    syncRemotePassword: 'no',
    syncRemoteDir: 'no',
    syncS3Endpoint: 'no',
    syncS3Region: 'no',
    syncS3Bucket: 'no',
    syncS3AccessKey: 'no',
    syncS3Secret: 'no',
    syncS3Prefix: 'no',
    syncS3PathStyle: 'no',
    syncDropboxClientId: 'no',
    syncOnedriveClientId: 'no',
    syncOauthFolder: 'no',
    syncDropboxTokens: 'no',
    syncOnedriveTokens: 'no',
    syncEncryptionEnabled: 'no',
    syncEncryptionPassword: 'no',
    syncLocalRoot: 'no',
    syncIncludeConfigDir: 'no',
    syncExcludes: 'no',
    syncConflictAction: 'no',
    syncProtectPercent: 'no',
    syncMaxFileMb: 'no',
    syncConcurrency: 'no',
};

type SettingsKey = keyof ZenithSettings;
const SETTINGS_KEYS = Object.keys(PROFILE_POLICY) as SettingsKey[];

export interface CaptureOptions {
    /** Folders and files of this vault. */
    paths: boolean;
    /** Where the user is. */
    place: boolean;
}

/** May a key with this policy travel, given what was asked for? */
function travels(policy: ProfileKeyPolicy, opts: CaptureOptions): boolean {
    return policy === 'yes' || (policy === 'path' && opts.paths) || (policy === 'place' && opts.place);
}

/** The current state as a profile. */
export function captureProfile(
    settings: ZenithSettings,
    name: string,
    today: string,
    opts: CaptureOptions
): Profile {
    const picked: Record<string, unknown> = {};
    for (const key of SETTINGS_KEYS) {
        if (travels(PROFILE_POLICY[key], opts) && settings[key] !== undefined) {
            picked[key] = structuredCopy(settings[key]);
        }
    }
    const features: Record<string, boolean> = {};
    for (const def of FEATURES) features[def.id] = ownFeatureValue(settings, def);
    return {
        zenith: PROFILE_FORMAT,
        version: PROFILE_VERSION,
        name,
        createdAt: today,
        modules: [...settings.activeModuleIds],
        features,
        settings: picked,
    };
}

/** A profile narrowed to what may be handed on — for an export. */
export function exportableProfile(profile: Profile, opts: CaptureOptions): Profile {
    const settings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profile.settings)) {
        const policy = PROFILE_POLICY[key as SettingsKey];
        if (policy && travels(policy, opts)) settings[key] = value;
    }
    return {
        zenith: PROFILE_FORMAT,
        version: PROFILE_VERSION,
        name: profile.name,
        createdAt: profile.createdAt,
        modules: [...profile.modules],
        features: { ...profile.features },
        settings,
    };
}

export function serializeProfile(profile: Profile): string {
    return `${JSON.stringify(profile, null, 2)}\n`;
}

function structuredCopy<T>(value: T): T {
    return value === null || typeof value !== 'object'
        ? value
        : (JSON.parse(JSON.stringify(value)) as T);
}

// ── Reading one ──────────────────────────────────────

/** What was left out of an import, and why — shown before anything is applied. */
export interface ImportReport {
    /** Settings this build does not have. */
    unknownSettings: string[];
    /** Settings of the wrong type, or ones a profile may never carry. */
    rejectedSettings: string[];
    /** Features this build does not have. */
    unknownFeatures: string[];
}

export type ParseResult =
    | { ok: true; profile: Profile; report: ImportReport }
    | { ok: false; error: 'json' | 'format' | 'version' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Settings whose value is more than a scalar, checked for shape. Everything
 * else is checked against the type of its default.
 */
const SHAPES: Partial<Record<SettingsKey, (v: unknown) => boolean>> = {
    journalTrackers: (v) =>
        Array.isArray(v) &&
        v.every(
            (t) =>
                isRecord(t) &&
                typeof t.id === 'string' &&
                typeof t.label === 'string' &&
                typeof t.icon === 'string' &&
                typeof t.color === 'string' &&
                (t.kind === 'check' || t.kind === 'scale' || t.kind === 'number')
        ),
    contentTypes: (v) =>
        Array.isArray(v) &&
        v.every(
            (t) =>
                isRecord(t) &&
                typeof t.id === 'string' &&
                typeof t.label === 'string' &&
                typeof t.icon === 'string' &&
                typeof t.color === 'string' &&
                isStringArray(t.fields)
        ),
    prayerAdjustments: (v) =>
        isRecord(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n)),
    folderIcons: (v) => isRecord(v) && Object.values(v).every((s) => typeof s === 'string'),
    location: isPlaceOrNull,
    prayerPlace: isPlaceOrNull,
    weatherPlace: isPlaceOrNull,
};

function isPlaceOrNull(v: unknown): boolean {
    return (
        v === null ||
        (isRecord(v) &&
            typeof v.lat === 'number' &&
            typeof v.lon === 'number' &&
            Number.isFinite(v.lat) &&
            Number.isFinite(v.lon) &&
            typeof v.name === 'string')
    );
}

/** Does `value` have the type `fallback` has? */
function sameType(value: unknown, fallback: unknown): boolean {
    if (Array.isArray(fallback)) {
        return fallback.every((x) => typeof x === 'string') ? isStringArray(value) : false;
    }
    if (typeof fallback === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (fallback === null || typeof fallback === 'object') return false;
    return typeof value === typeof fallback;
}

/**
 * Read a profile from text, trusting none of it.
 *
 * Every setting is checked against what this build has and what its default
 * looks like, and every feature against the registry. What does not fit is
 * left out and listed, so the preview can say so before anything changes —
 * a profile from a newer build is still usable for everything this one
 * understands.
 */
export function parseProfile(text: string, defaults: ZenithSettings): ParseResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, error: 'json' };
    }
    if (!isRecord(raw) || raw.zenith !== PROFILE_FORMAT) return { ok: false, error: 'format' };
    if (raw.version !== PROFILE_VERSION) return { ok: false, error: 'version' };

    const report: ImportReport = { unknownSettings: [], rejectedSettings: [], unknownFeatures: [] };

    const settings: Record<string, unknown> = {};
    if (isRecord(raw.settings)) {
        for (const [key, value] of Object.entries(raw.settings)) {
            const policy = PROFILE_POLICY[key as SettingsKey];
            if (!policy) {
                report.unknownSettings.push(key);
                continue;
            }
            const shape = SHAPES[key as SettingsKey];
            const fits = shape ? shape(value) : sameType(value, defaults[key as SettingsKey]);
            if (policy === 'no' || policy === 'feature' || !fits) {
                report.rejectedSettings.push(key);
                continue;
            }
            settings[key] = value;
        }
    }

    const features: Record<string, boolean> = {};
    if (isRecord(raw.features)) {
        for (const [id, on] of Object.entries(raw.features)) {
            if (!getFeature(id) || typeof on !== 'boolean') report.unknownFeatures.push(id);
            else features[id] = on;
        }
    }

    const profile: Profile = {
        zenith: PROFILE_FORMAT,
        version: PROFILE_VERSION,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '',
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
        modules: isStringArray(raw.modules) ? raw.modules : [],
        features,
        settings,
    };
    return { ok: true, profile, report };
}

// ── Applying one ─────────────────────────────────────

/**
 * `replace` makes everything the profile speaks for match it. `add` only ever
 * switches things on — modules and features the profile has on — and leaves
 * every setting as it is.
 */
export type ApplyMode = 'replace' | 'add';

export interface ModuleContext {
    /** Ids of the modules that ship with Zenith. */
    builtIn: readonly string[];
    /** Ids of every module present — built in or installed. */
    available: readonly string[];
}

/**
 * The settings change a profile makes. Pure: apply it with `updateSettings`.
 *
 * Modules: a built-in module is on exactly when the profile says so. A
 * third-party module the profile lists is switched on if it is installed; one
 * it does not list is left alone — a profile never switches off a module it
 * knows nothing about, which a template never does.
 *
 * Features: the ones the profile names. A feature newer than the profile is
 * left as it is.
 */
export function profilePatch(
    settings: ZenithSettings,
    profile: Profile,
    mode: ApplyMode,
    modules: ModuleContext
): Partial<ZenithSettings> {
    const builtIn = new Set(modules.builtIn);
    const available = new Set(modules.available);
    const wanted = new Set(profile.modules.filter((id) => available.has(id)));

    const current = settings.activeModuleIds;
    const nextModules =
        mode === 'add'
            ? [...current, ...[...wanted].filter((id) => !current.includes(id))]
            : [
                  ...current.filter((id) => !builtIn.has(id) || wanted.has(id)),
                  ...[...wanted].filter((id) => !current.includes(id)),
              ];

    let patch: Partial<ZenithSettings> = {};
    if (!sameList(nextModules, current)) patch.activeModuleIds = nextModules;

    // Features go through `featurePatch`, so a feature that lives in a
    // setting of its own is written there. Each step reads the settings as
    // the previous steps left them, or the `features` map would be rebuilt
    // from the stale one every time.
    let working: ZenithSettings = { ...settings, ...patch };
    for (const def of FEATURES) {
        const want = profile.features[def.id];
        if (typeof want !== 'boolean') continue;
        if (mode === 'add' && !want) continue;
        if (ownFeatureValue(working, def) === want) continue;
        const step = featurePatch(working, def.id, want);
        patch = { ...patch, ...step };
        working = { ...working, ...step };
    }

    if (mode === 'replace') {
        for (const [key, value] of Object.entries(profile.settings)) {
            const k = key as SettingsKey;
            const policy = PROFILE_POLICY[k];
            if (!policy || policy === 'no' || policy === 'feature') continue;
            if (JSON.stringify(settings[k]) === JSON.stringify(value)) continue;
            (patch as Record<string, unknown>)[k] = structuredCopy(value);
        }
    }
    return patch;
}

/** The previous values of everything a patch changes — what "undo" puts back. */
export function undoFor(
    settings: ZenithSettings,
    patch: Partial<ZenithSettings>
): Partial<ZenithSettings> {
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as SettingsKey[]) {
        before[key] = structuredCopy(settings[key]);
    }
    return before;
}

/** What a patch would do, for the preview. */
export interface ProfileDiff {
    modulesOn: string[];
    modulesOff: string[];
    /** Features of modules that stay on — a module going off takes its own with it. */
    featuresOn: string[];
    featuresOff: string[];
    /** Settings that change, besides modules and features. */
    settingsChanged: string[];
}

export function diffProfile(
    settings: ZenithSettings,
    patch: Partial<ZenithSettings>
): ProfileDiff {
    const after: ZenithSettings = { ...settings, ...patch };
    const before = new Set(settings.activeModuleIds);
    const now = new Set(after.activeModuleIds);
    const running = (moduleId: string) =>
        moduleId === 'core' || moduleId === 'notifications' || now.has(moduleId);

    const featuresOn: string[] = [];
    const featuresOff: string[] = [];
    for (const def of FEATURES) {
        if (!running(def.moduleId)) continue;
        const was = ownFeatureValue(settings, def);
        const will = ownFeatureValue(after, def);
        if (was !== will) (will ? featuresOn : featuresOff).push(def.id);
    }

    const featureKeys = new Set(FEATURES.map((f) => f.settingKey).filter(Boolean) as string[]);
    const settingsChanged = Object.keys(patch).filter(
        (key) => key !== 'activeModuleIds' && key !== 'features' && !featureKeys.has(key)
    );

    return {
        modulesOn: [...now].filter((id) => !before.has(id)),
        modulesOff: [...before].filter((id) => !now.has(id)),
        featuresOn,
        featuresOff,
        settingsChanged,
    };
}

export const isEmptyDiff = (d: ProfileDiff): boolean =>
    !d.modulesOn.length &&
    !d.modulesOff.length &&
    !d.featuresOn.length &&
    !d.featuresOff.length &&
    !d.settingsChanged.length;

function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A file name for a profile: its name, stripped of what a file system refuses. */
export function profileFileName(name: string): string {
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    return `${clean || 'profile'}.json`;
}

/**
 * Stored profiles as `data.json` holds them — checked, since a hand edit or a
 * merge from an older build can have left anything there.
 */
export function normalizeStoredProfiles(raw: unknown): StoredProfile[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (p): p is StoredProfile =>
            isRecord(p) &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            isStringArray(p.modules) &&
            isRecord(p.features) &&
            isRecord(p.settings)
    );
}

/** The snapshot taken on upgrade: everything as it was, paths and place included. */
export function beforeProfilesSnapshot(settings: ZenithSettings, today: string): StoredProfile {
    return {
        ...captureProfile(settings, '', today, { paths: true, place: true }),
        id: BEFORE_PROFILES_ID,
        kind: 'before',
    };
}
