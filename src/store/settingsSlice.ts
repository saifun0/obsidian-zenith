import {
    DEFAULT_TASKS_FOLDER,
    DEFAULT_CONTENT_FOLDER,
    DEFAULT_PROJECTS_FOLDER,
    DEFAULT_JOURNAL_FOLDER,
    DEFAULT_JOURNAL_FORMAT,
    LEGACY_JOURNAL_FOLDER,
} from '../core/constants';
import type { ModuleManifest } from '../core/IModule';
import { DEFAULT_TRACKERS, migrateHabits, type JournalTracker } from '../core/journalConfig';
import {
    DEFAULT_GRID_CONFIG,
    normalizeGridConfig,
    type GridConfig,
    type WidgetLayoutItem,
} from '../modules/dashboard/grid/gridTypes';
import type { WidgetBundle } from '../modules/dashboard/grid/bundleTypes';
import { normalizePresets, type DashboardPreset } from '../modules/dashboard/dashboardPresets';
import { normalizeSession, type TimerSession } from '../modules/tasks/services/taskTimer';
import type { ContentTypeConfig } from '../core/contentTypes';
import type { WeatherPlace } from '../modules/weather/weatherTypes';
import type { GeoPlace } from '../services/geocode';
import {
    DEFAULT_METHOD_ID,
    type AsrMadhab,
    type HighLatRule,
    type PrayerSource,
} from '../modules/prayer/prayerConfig';
import type { ApiMidnight } from '../modules/prayer/prayerApi';
import type { DashboardBgFit, DashboardBgSource } from '../modules/dashboard/dashboardBackground';
import type { ModuleSource } from '../core/moduleSources';
import { pinnedFeatures } from '../core/features';
import {
    BEFORE_PROFILES_ID,
    beforeProfilesSnapshot,
    normalizeStoredProfiles,
    type StoredProfile,
} from '../core/profiles/profiles';
import { getTodayString } from '../core/dateUtils';
import type { ZenithSliceCreator } from './types';

// ── Settings Types ───────────────────────────────────

/** UI language for Zenith's own chrome. `auto` follows Obsidian's locale. */
export type ZenithLanguage = 'auto' | 'en' | 'ru';

/** Temperature unit for the weather widget. */
export type WeatherUnit = 'c' | 'f';

/** Which day the journal calendar starts its weeks on. */
export type JournalWeekStart = 'mon' | 'sun';

/**
 * The right-hand label on a Week Ahead row. It used to be the note's filename,
 * which was the same for nearly every task; the deadline countdown is what the
 * card is actually for.
 */
export type CalendarRowLabel = 'countdown' | 'note' | 'both' | 'none';

/** Interface spacing. */
/** Where a task's attached pictures sit in its row. */
export type TaskImageAlign = 'left' | 'center' | 'right';

export type UiDensity = 'compact' | 'comfortable' | 'spacious';

/** How the navigation launcher lays its buttons out. */
export type NavigatorLayout = 'grid' | 'list';

/** A module the installer put on disk, and where it came from. */
export interface InstalledModuleRecord {
    id: string;
    name: string;
    version: string;
    source: ModuleSource;
    installedAt: number;
    updatedAt?: number;
    /** Hash of the main.js we wrote — detects hand edits and sync changes. */
    codeHash: string;
    /** When the user accepted running this module, and the origin they saw. */
    consentedAt: number;
    consentedOrigin: string;
    /** Cleared on a successful load. */
    lastError?: string;
}

/** An OAuth token pair as persisted. `expiresAt` is absolute epoch ms. */
/** See `ZenithSettings.profileUndo`. */
export interface ProfileUndo {
    /** The profile that was applied, for the button's label. */
    name: string;
    at: number;
    before: Partial<ZenithSettings>;
}

export interface StoredTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

export interface ZenithSettings {
    /** Vault-relative path to folder with task .md files */
    tasksFolderPath: string;
    /** Where attached pictures sit in a task row. */
    taskImageAlign: TaskImageAlign;
    /** Thumbnail edge, in px. */
    taskImageSize: number;
    /** Vault-relative path to folder with content .md files */
    contentFolderPath: string;
    /** Vault-relative path to folder with project .md files */
    projectsFolderPath: string;
    /** Vault-relative path to folder with daily notes */
    journalFolderPath: string;
    /**
     * Filename pattern for a daily note (`YYYY-MM-DD`). May contain `/` to nest
     * notes in subfolders; see `journalDates.ts` for the supported tokens.
     */
    journalDateFormat: string;
    /** Vault path to a note used as the body of a freshly created daily note. */
    journalTemplatePath: string;
    /** First column of the journal calendar. */
    journalWeekStart: JournalWeekStart;
    /**
     * What each day records: check-boxes, 1–5 scales and plain numbers.
     *
     * Unlike `contentTypes`, an empty list means **no trackers** rather than
     * "use the defaults" — otherwise deleting the last one in settings would
     * bring all of them straight back, and there would be no way to run a
     * journal that is purely prose.
     */
    journalTrackers: JournalTracker[];
    /** Write newly created tasks into today's daily note instead of the inbox. */
    journalCaptureTasks: boolean;
    /**
     * Heading inside the daily note that captured tasks are filed under (text
     * only, without `#`). Empty = append at the end of the note.
     */
    journalTaskHeading: string;
    /**
     * User-defined content types (label, icon, colour, metadata provider, shown
     * fields). Empty = use the built-in `DEFAULT_CONTENT_TYPES`; editing in
     * settings materializes the full list here.
     */
    contentTypes: ContentTypeConfig[];
    /** What the right-hand label on a Week Ahead row shows. */
    calendarWidgetRowLabel: CalendarRowLabel;
    /** Days on the Week Ahead axis. */
    calendarHorizonDays: number;
    /** Show the red overdue strip above the axis. */
    calendarShowOverdue: boolean;
    /** Give each multi-day task its own stable colour. */
    calendarSpanColors: boolean;
    /**
     * How long a task with a `⏰` but no stated end is drawn as on the hour
     * grid, in minutes.
     *
     * A guess has to be made — a block of zero height can't be clicked — and
     * how long "an appointment" is depends entirely on whose day it is. Blocks
     * using it are drawn with a dashed foot, so the guess is never mistaken for
     * something the note said.
     */
    calendarSlotMinutes: number;

    /** Greet the user by time of day at the top of the dashboard. */
    /** Show today's date under the greeting. */
    /**
     * What stands at the top of the dashboard: nothing, a greeting that follows
     * the hour, or a line the user wrote.
     */
    dashboardHeading: 'none' | 'greeting' | 'custom';
    /** The line itself, when `dashboardHeading` is `custom`. */
    dashboardHeadingText: string;
    dashboardShowDate: boolean;

    /**
     * Where prayer times are computed for. Null falls back to the weather
     * module's place, then to the device — a prayer time is only as right as
     * its coordinates, so an explicit choice is worth asking for.
     */
    prayerPlace: GeoPlace | null;
    /**
     * Where the times come from: a published calendar (`api`) or this device's
     * own arithmetic (`local`).
     *
     * The service is the default because a prayer tracker whose times disagree
     * with the mosque down the road is worse than no tracker, and every
     * muftiate rounds and pads its printed table in its own way. The
     * calculation stays as the floor — offline, or against a service having a
     * bad day, it answers instead.
     */
    prayerSource: PrayerSource;
    /**
     * What the middle of the night — and so the last third — is measured to.
     * Only the service reads it; the local calculation always divides the night
     * that is actually prayed through, sunset to fajr.
     */
    prayerApiMidnight: ApiMidnight;
    /** Calculation method id from `PRAYER_METHODS`. */
    prayerMethod: string;
    /** Twilight angles for the `custom` method; ignored by every other one. */
    prayerFajrAngle: number;
    prayerIshaAngle: number;
    /** Shadow length that starts asr: its own (standard) or twice it (Hanafi). */
    prayerAsrMadhab: AsrMadhab;
    /** What to do where the sun never reaches the fajr/isha angle. */
    prayerHighLatRule: HighLatRule;
    /**
     * ±minutes per time, keyed by `PrayerTimeId`. For matching the mosque you
     * actually pray at, which rounds and adjusts in its own way.
     */
    prayerAdjustments: Record<string, number>;
    /** Show sunrise in the times list — it closes fajr's window. */
    prayerShowSunrise: boolean;
    /** Voluntary prayers to offer alongside the five: `witr`, `tahajjud`, `duha`. */
    prayerExtras: string[];
    /** ±days on the Hijri date, since the month starts by local sighting. */
    prayerHijriOffset: number;
    /** Notify when a prayer comes in (only while Obsidian is open). */
    prayerNotify: boolean;
    /** Minutes of warning before the time itself. */
    prayerNotifyBefore: number;

    /**
     * Quiet hours for the notification center: whole hours, the start taken
     * and the end not, wrapping midnight. Inside them nothing pops up — it
     * waits in the center. `-1` is no quiet hours.
     */
    notifyQuietFrom: number;
    notifyQuietTo: number;
    /**
     * Also raise the operating system's own notification, on a computer.
     * Per device: a phone cannot, and one desktop may want it where another
     * does not.
     */
    notifySystem: boolean;
    /** Sources that only ever go into the center, without popping up. */
    notifyMuted: string[];

    /**
     * The board's wallpaper. `none`, an address on the web, or a picture in
     * the vault. See `dashboardBackground.ts` for why it is a layer rather
     * than a `background` on the board.
     */
    dashboardBgSource: DashboardBgSource;
    /** Used when the source is `url`. Fetched from the web on every open. */
    dashboardBgUrl: string;
    /** Vault-relative path, used when the source is `vault`. */
    dashboardBgPath: string;
    /** Fill the board, fit inside it, or repeat as a tile. */
    dashboardBgFit: DashboardBgFit;
    /** Percent of black over the picture, so the board stays readable. */
    dashboardBgDim: number;
    /** Pixels of blur on the picture. */
    dashboardBgBlur: number;
    /**
     * How solid the widget cards and bundles stay over the wallpaper, 30–100.
     * A hundred is opaque, so the picture shows only between the cards.
     */
    dashboardCardOpacity: number;
    /** Show it on a phone. Off keeps a heavy picture off a metered device. */
    dashboardBgMobile: boolean;

    /**
     * Settings that belong to one copy of a widget, keyed by its layout id.
     *
     * Opaque here on purpose: the shape is the widget's business, and a widget
     * that arrives with a third-party module has a shape this file cannot know.
     * Each widget normalises its own bucket on read — see `widgetConfig.ts`.
     *
     * Keyed by layout id rather than by widget id because that is the only
     * thing that tells two copies of the same widget apart, and two pictures
     * forced to show the same photograph would be one picture rendered twice.
     */
    widgetConfig: Record<string, Record<string, unknown>>;

    /** Navigation launcher: button grid, or a labelled list. */
    navigatorLayout: NavigatorLayout;
    /** Show the label under each button in the grid layout. */
    navigatorShowLabels: boolean;
    /**
     * Nav action ids the user has switched off. A hide list rather than a show
     * list, so a button contributed by a newly installed module appears instead
     * of waiting to be found in settings.
     */
    navigatorHiddenActions: string[];

    /** How much breathing room the interface uses. */
    uiDensity: UiDensity;
    /** Motion. Forced off anyway when the OS asks for reduced motion. */
    uiAnimations: boolean;

    /** IDs of currently active modules */
    activeModuleIds: string[];
    /**
     * Features switched on or off, by id — see `core/features.ts`.
     *
     * Only what somebody chose, or what the migration pinned: a feature with
     * no entry follows its registry default. Features that predate the
     * registry keep their own setting (`weatherShowAir`…) and never appear
     * here.
     */
    features: Record<string, boolean>;
    /**
     * Profiles the user saved, and the snapshot taken when profiles arrived.
     * Shared: a profile is the user's, wherever it was saved.
     */
    profiles: StoredProfile[];
    /**
     * What the last profile applied on this device changed, as it was before
     * — "put it back" restores exactly that. Per device, like the change it
     * undoes is from here.
     */
    profileUndo: ProfileUndo | null;
    /**
     * This device has been past the first-run choice of a template, or never
     * needed it. A fresh install is the only config that starts false.
     */
    profilesOnboarded: boolean;
    /** Custom accent color (CSS color value); empty = use Obsidian's accent */
    accentColor: string;
    /** The module to open when clicking the ribbon icon */
    defaultModuleId: string;
    /** UI language for Zenith's own interface */
    language: ZenithLanguage;
    /**
     * Where the user is, once, for the whole plugin.
     *
     * Weather and prayer both need coordinates and both need the *same* ones,
     * and asking per module meant setting the same city twice and keeping the
     * two in step by hand. Each module keeps an override for the case that is
     * genuinely different — watching a forecast somewhere you are not, while
     * praying where you are — but nothing has to be set twice to agree.
     *
     * Null means "work it out": the device's own position, then, only with
     * consent, the IP.
     */
    location: GeoPlace | null;
    /**
     * Legacy free-text city. Superseded by `weatherPlace`, and kept only so a
     * config written before the picker existed can be geocoded once and
     * upgraded; nothing writes to it any more.
     */
    weatherCity: string;
    /**
     * The chosen location, resolved to coordinates. Null = work it out from the
     * device (and, with consent, the IP).
     */
    weatherPlace: WeatherPlace | null;
    /**
     * Let the weather widget ask ipapi.co where the user is when the device
     * won't say. Off by default: it sends the user's IP to a third party, which
     * is not a thing to do silently for a city-level guess.
     */
    weatherAllowIpLookup: boolean;
    /** Fetch pollutants and pollen alongside the forecast (a second request). */
    weatherShowAir: boolean;
    /**
     * Settings owned by third-party modules, bucketed by module id.
     *
     * They cannot add keys to `ZenithSettings`, and namespacing everything else
     * would mean migrating ~100 existing keys for tidiness alone — so this is
     * the one namespaced corner. A module owns its bucket outright: it is
     * replaced wholesale on load rather than deep-merged.
     */
    moduleSettings: Record<string, Record<string, unknown>>;
    /**
     * Master switch for running third-party module code. Off by default.
     *
     * A module is plain JavaScript with the same reach as Obsidian itself, and
     * Zenith cannot sandbox it. Discovery still lists what is installed when
     * this is off — seeing what is there is safe; running it is the part that
     * needs a deliberate yes.
     */
    allowThirdPartyModules: boolean;
    /**
     * What the installer put on disk, so Update / Reinstall / Uninstall know
     * where each module came from.
     *
     * Kept in settings rather than in a sidecar file beside the modules: it
     * rides the existing debounced `data.json` write with no new plumbing, and
     * it syncs across devices — which is what makes "installed on the desktop,
     * appears on the phone" work. Module CODE never goes in here; that lives on
     * disk like any other file.
     */
    installedModules: InstalledModuleRecord[];
    /**
     * Schema version of this settings object, for ordered migrations.
     *
     * The five migrations below identify an old config by "this key did not
     * exist yet". That worked while keys were added a few at a time; with
     * dozens arriving it becomes a trap, because a later migration could pick
     * one of the new keys as its sentinel. Absent means "written before
     * versioning" — see `loadSettings`.
     */
    settingsVersion: number;
    /** Temperature unit for the weather widget */
    weatherUnit: WeatherUnit;
    /** Show the hourly forecast section in the weather widget */
    weatherShowHourly: boolean;
    /** Show sunrise/sunset in the weather widget details */
    weatherShowSun: boolean;
    /** How many days of multi-day forecast to show (0 = hide the section) */
    weatherForecastDays: number;
    /**
     * Dashboard widget order (widget ids). Superseded by `dashboardLayout`;
     * still used to order widgets that haven't been placed on the grid yet.
     */
    widgetOrder: string[];
    /** Dashboard widget ids the user has removed from the grid */
    hiddenWidgetIds: string[];
    /** Grid placement of dashboard widgets. Empty = auto-place everything. */
    dashboardLayout: WidgetLayoutItem[];
    /**
     * Widgets grouped into bundles — several sharing one cell. Membership only;
     * a bundle's position and size live in `dashboardLayout` like any widget's,
     * under the same `bundle:…` id.
     */
    dashboardBundles: WidgetBundle[];
    /**
     * Widget order for the single-column (narrow/mobile) layout. Kept separate
     * from `dashboardLayout` so rearranging on a phone doesn't rewrite the grid
     * you arranged on desktop. Empty = derive from the grid's reading order.
     */
    dashboardStackOrder: string[];
    /**
     * Saved arrangements of the whole dashboard — placement, bundles, stack
     * order, hidden widgets and grid geometry together. Managed from the
     * dashboard itself, so it has no field in the settings schema.
     */
    dashboardPresets: DashboardPreset[];
    /**
     * The task timer currently running, if any — one at a time, by design.
     * Persisted so it survives closing the tab or restarting Obsidian, which is
     * the whole point of a timer you start and walk away from.
     */
    activeTimer: TimerSession | null;
    /** The saved arrangement currently on screen, if any. */
    dashboardPresetId: string;
    /** Custom icons for file-explorer paths: vault path → Obsidian/lucide icon id. */
    folderIcons: Record<string, string>;
    /** Media module: currently displayed image/GIF (URL or vault path) */
    mediaSelected: string;
    /** Media module: saved/pinned image references (URLs or vault paths) */
    mediaSaved: string[];
    /** Dashboard grid geometry (columns, row height, gap). */
    dashboardGrid: GridConfig;
    /** Content library: where you left the view. */
    contentView: ContentViewState;
    /** Tasks: where you left the view. */
    taskView: TaskViewState;
    /** Tasks calendar: where you left the view. */
    calendarView: CalendarViewState;

    /**
     * Run the cross-device settings merge on THIS device.
     *
     * Deliberately device-scoped rather than shared: a shared switch could be
     * turned off from another device, and once off there is no channel left to
     * turn it back on — the setting would have disabled the only thing that
     * could restore it.
     */
    syncEnabled: boolean;
    /** Seconds between checks for other devices' changes. */
    syncPollSeconds: number;

    /**
     * Sync note files to a remote as well as settings.
     *
     * Off by default, and separate from `syncEnabled`: merging settings is
     * something everyone benefits from, whereas moving every file in the vault
     * to a server is a decision with its own consequences.
     */
    syncFilesEnabled: boolean;
    /**
     * Run file sync by itself, instead of waiting to be asked.
     *
     * On by default, but only meaningful once `syncFilesEnabled` is on and a
     * server is configured — both of which are deliberate acts. What it
     * automates is the pressing of the button, not the judgement behind it: a
     * run that wants review still stops and waits. See `autoPolicy`.
     */
    syncFilesAuto: boolean;
    /** Minutes between automatic file runs. Also runs on focus and after edits. */
    syncFilesIntervalMinutes: number;
    /** Which backend the file engine talks to. */
    syncRemoteKind: 'webdav' | 's3' | 'dropbox' | 'onedrive';
    /** WebDAV endpoint, e.g. `https://host/remote.php/dav/files/me`. */
    syncRemoteUrl: string;
    syncRemoteUser: string;
    /**
     * Stored in plain text in `data.json`, like every other Obsidian plugin
     * credential — the app offers no keychain. Said out loud in the settings UI
     * rather than left for the user to assume otherwise.
     */
    syncRemotePassword: string;
    /** Folder on the server holding this vault. */
    syncRemoteDir: string;
    /** S3 service endpoint, e.g. `https://s3.eu-central-1.amazonaws.com`. */
    syncS3Endpoint: string;
    syncS3Region: string;
    syncS3Bucket: string;
    syncS3AccessKey: string;
    /** Plain text in `data.json`, like every Obsidian plugin credential. */
    syncS3Secret: string;
    /** Folder inside the bucket. */
    syncS3Prefix: string;
    /**
     * Address the bucket as `endpoint/bucket` rather than `bucket.endpoint`.
     * Nearly every S3-compatible server that is not AWS needs this.
     */
    syncS3PathStyle: boolean;

    /**
     * App registration for the OAuth providers.
     *
     * The user's own, not one shipped with the plugin: baking in a client id
     * would mean registering apps under someone's identity and distributing the
     * result, which the providers ask people not to do.
     */
    syncDropboxClientId: string;
    syncOnedriveClientId: string;
    /** Folder in the provider account holding this vault. Empty = the root. */
    syncOauthFolder: string;
    /**
     * Tokens for each provider.
     *
     * Device-scoped like every other credential here, which also means each
     * device authorizes itself — the more conservative arrangement, and the one
     * that lets a single device be revoked without touching the others.
     */
    syncDropboxTokens: StoredTokens | null;
    syncOnedriveTokens: StoredTokens | null;

    /**
     * Encrypt everything before it leaves the device.
     *
     * Contents and filenames both. Off by default: switching it on for an
     * existing remote means starting again in an empty folder, which is not a
     * thing to do to somebody quietly.
     */
    syncEncryptionEnabled: boolean;
    /**
     * The password the encryption key is derived from.
     *
     * Never sent anywhere, and not recoverable — there is no copy of it on the
     * remote, which is the entire point. Stored in `data.json` in plain text
     * like every other credential here, because Obsidian offers plugins no
     * keychain; the settings UI says so rather than letting anyone assume
     * otherwise.
     */
    syncEncryptionPassword: string;

    /** Vault folder to sync. Empty means the whole vault. */
    syncLocalRoot: string;
    /** Include `.obsidian` — themes, other plugins, workspace layout. */
    syncIncludeConfigDir: boolean;
    /** Vault-relative prefixes to leave alone. */
    syncExcludes: string[];
    /**
     * How a file edited on both sides is settled.
     *
     * `smart` reads the two notes as frontmatter plus task lines and reconciles
     * them by meaning, falling back to keeping both when it cannot prove the
     * merge is safe — so unlike `keep_newer` it never discards a version.
     */
    syncConflictAction: 'keep_newer' | 'keep_larger' | 'keep_both' | 'smart';
    /** Refuse a run that would delete more than this percentage of known files. */
    syncProtectPercent: number;
    /** Skip files larger than this, in megabytes. 0 disables the limit. */
    syncMaxFileMb: number;
    /** Parallel transfers. */
    syncConcurrency: number;
}

/**
 * Persisted view state.
 *
 * Fields are plain strings rather than the components' union types: these come
 * back from `data.json`, so they're untrusted input and each view validates
 * what it reads. Search boxes are deliberately absent — a search is a transient
 * lookup, and restoring one would look like the library had lost items.
 */
export interface ContentViewState {
    /** Content type id, or `all`. */
    type: string;
    /** Content status, or `all`. */
    status: string;
    sort: string;
    desc: boolean;
}

export interface TaskViewState {
    tab: string;
    priority: string;
    tag: string;
    sort: string;
    group: string;
}

/**
 * Tasks calendar. The three booleans are the calendar's own controls rather
 * than plugin settings: they change what the grid in front of you means, so
 * they live in its toolbar and persist from there.
 */
export interface CalendarViewState {
    /** `month`, `week`, `day` or `list`. */
    view: string;
    /** Hide done and cancelled entries. */
    hideDone: boolean;
    /** Draw a task with a start *and* a due date on every day in between. */
    spanDays: boolean;
    /** Place undated tasks on the day of the daily note they live in. */
    showDailyNotes: boolean;
    /** Draw all 24 hour rows instead of the waking-hours window. */
    allHours: boolean;
    /**
     * Days across the month grid: 7, or 3 where a week will not fit.
     *
     * Unset until someone chooses, so the device decides — a phone opens on 3
     * and everything else on 7. It has no entry in `DEFAULT_SETTINGS` for that
     * reason: a default here would be a default for every device, and this one
     * is about how wide the screen is. `calendarView` is device-scoped, so a
     * choice made on the phone stays on the phone.
     */
    columns?: number;
}

// ── Settings Slice ───────────────────────────────────

export interface SettingsSlice {
    settings: ZenithSettings;
    availableModules: ModuleManifest[];
    loadedModuleIds: string[];
    updateSettings: (partial: Partial<ZenithSettings>) => void;
    loadSettings: (saved: Partial<ZenithSettings>) => void;
    setAvailableModules: (modules: ModuleManifest[]) => void;
    setLoadedModules: (moduleIds: string[]) => void;
    /** Merge a patch into one third-party module's settings bucket. */
    updateModuleSettings: (moduleId: string, patch: Record<string, unknown>) => void;
    /** Empty a module's bucket, so schema defaults apply again. */
    resetModuleSettings: (moduleId: string) => void;
    /** Drop a module's bucket entirely (uninstall with "forget settings"). */
    forgetModuleSettings: (moduleId: string) => void;
}

/**
 * Bump when a migration is added, and gate that migration on the value below.
 * Version 1 is "everything written before versioning existed".
 */
export const CURRENT_SETTINGS_VERSION = 11;

/**
 * Object-valued settings that must be merged field-by-field rather than
 * replaced.
 *
 * A config saved before one of their fields existed would otherwise overwrite
 * the whole default with a partial object, leaving that field `undefined`.
 * Listed rather than detected, because ARRAY-valued settings must NOT be merged
 * — `journalTrackers: []` means "no trackers", not "use the defaults".
 */
const NESTED_KEYS = [
    'contentView',
    'taskView',
    'calendarView',
    'moduleSettings',
    'widgetConfig',
    'features',
] as const;

/**
 * Drop keys explicitly set to `undefined` before merging.
 *
 * `data.json` never contains `undefined`, but `resetZenithStore` calls
 * `loadSettings({})` and callers may pass partials — and an explicit
 * `undefined` beats a default in a spread, silently blanking the setting.
 */
function stripUndefined<T extends object>(source: T): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (value !== undefined) out[key] = value;
    }
    return out as Partial<T>;
}

export const DEFAULT_SETTINGS: ZenithSettings = {
    tasksFolderPath: DEFAULT_TASKS_FOLDER,
    taskImageAlign: 'left',
    taskImageSize: 56,
    contentFolderPath: DEFAULT_CONTENT_FOLDER,
    projectsFolderPath: DEFAULT_PROJECTS_FOLDER,
    journalFolderPath: DEFAULT_JOURNAL_FOLDER,
    journalDateFormat: DEFAULT_JOURNAL_FORMAT,
    journalTemplatePath: '',
    journalWeekStart: 'mon',
    journalTrackers: DEFAULT_TRACKERS.map((t) => ({ ...t })),
    journalCaptureTasks: true,
    journalTaskHeading: '',
    contentTypes: [],
    calendarWidgetRowLabel: 'countdown',
    calendarHorizonDays: 7,
    calendarShowOverdue: true,
    calendarSpanColors: true,
    calendarSlotMinutes: 60,
    dashboardHeading: 'none',
    dashboardHeadingText: '',
    // Off unless asked for. The date is on the clock card, on the calendar and
    // in Obsidian's own status bar; a dashboard that opens with a bare wall of
    // cards is the point of it.
    dashboardShowDate: false,
    dashboardBgSource: 'none',
    dashboardBgUrl: '',
    dashboardBgPath: '',
    dashboardBgFit: 'cover',
    // Enough to read white-on-anything without hiding the picture. A wallpaper
    // nobody can see is the same as no wallpaper; a board nobody can read is
    // worse than one.
    dashboardBgDim: 45,
    dashboardBgBlur: 0,
    dashboardCardOpacity: 72,
    dashboardBgMobile: true,
    widgetConfig: {},
    prayerPlace: null,
    prayerSource: 'api',
    prayerApiMidnight: 'toFajr',
    prayerMethod: DEFAULT_METHOD_ID,
    prayerFajrAngle: 16,
    prayerIshaAngle: 15,
    prayerAsrMadhab: 'hanafi',
    prayerHighLatRule: 'angleBased',
    prayerAdjustments: {},
    prayerShowSunrise: true,
    prayerExtras: ['witr'],
    prayerHijriOffset: 0,
    prayerNotify: false,
    prayerNotifyBefore: 10,
    notifyQuietFrom: -1,
    notifyQuietTo: 7,
    notifySystem: false,
    notifyMuted: [],
    navigatorLayout: 'grid',
    navigatorShowLabels: true,
    navigatorHiddenActions: [],
    uiDensity: 'comfortable',
    uiAnimations: true,
    activeModuleIds: [
        'dashboard',
        'navigator',
        'weather',
        'tasks',
        'tasks-calendar',
        'projects',
        'content',
        'journal',
        'prayer',
        'media',
        'sync',
        'picture',
    ],
    features: {},
    profiles: [],
    profileUndo: null,
    profilesOnboarded: false,
    accentColor: '',
    defaultModuleId: 'dashboard',
    language: 'auto',
    location: null,
    weatherCity: '',
    weatherPlace: null,
    weatherAllowIpLookup: false,
    weatherShowAir: true,
    moduleSettings: {},
    allowThirdPartyModules: false,
    installedModules: [],
    settingsVersion: CURRENT_SETTINGS_VERSION,
    weatherUnit: 'c',
    weatherShowHourly: true,
    weatherShowSun: true,
    weatherForecastDays: 10,
    widgetOrder: [],
    hiddenWidgetIds: [],
    dashboardLayout: [],
    dashboardBundles: [],
    dashboardStackOrder: [],
    dashboardPresets: [],
    activeTimer: null,
    dashboardPresetId: '',
    folderIcons: {},
    mediaSelected: '',
    mediaSaved: [],
    dashboardGrid: { ...DEFAULT_GRID_CONFIG },
    contentView: { type: 'all', status: 'all', sort: 'title', desc: false },
    taskView: { tab: 'all', priority: 'all', tag: '', sort: 'manual', group: 'smart' },
    calendarView: {
        view: 'month',
        hideDone: false,
        spanDays: true,
        showDailyNotes: true,
        allHours: false,
    },
    syncEnabled: true,
    syncPollSeconds: 20,
    syncFilesEnabled: false,
    syncFilesAuto: true,
    syncFilesIntervalMinutes: 15,
    syncRemoteKind: 'webdav',
    syncRemoteUrl: '',
    syncRemoteUser: '',
    syncRemotePassword: '',
    syncRemoteDir: '',
    syncS3Endpoint: '',
    syncS3Region: '',
    syncS3Bucket: '',
    syncS3AccessKey: '',
    syncS3Secret: '',
    syncS3Prefix: '',
    syncS3PathStyle: false,
    syncDropboxClientId: '',
    syncOnedriveClientId: '',
    syncOauthFolder: '',
    syncDropboxTokens: null,
    syncOnedriveTokens: null,
    syncEncryptionEnabled: false,
    syncEncryptionPassword: '',
    syncLocalRoot: '',
    syncIncludeConfigDir: false,
    syncExcludes: [],
    syncConflictAction: 'smart',
    syncProtectPercent: 25,
    syncMaxFileMb: 100,
    syncConcurrency: 4,
};

export const createSettingsSlice: ZenithSliceCreator<SettingsSlice> = (set) => ({
    settings: { ...DEFAULT_SETTINGS },
    availableModules: [],
    loadedModuleIds: [],

    updateSettings: (partial) =>
        set((state) => ({
            settings: { ...state.settings, ...partial },
        })),

    loadSettings: (rawSaved) =>
        set(() => {
            const saved = stripUndefined(rawSaved);
            const merged: ZenithSettings = { ...DEFAULT_SETTINGS, ...saved };

            // Nested objects need their own merge: a config written before a
            // field existed would otherwise replace the whole default with a
            // partial object, leaving that field undefined. Driven by a list so
            // a future object-valued setting is covered by construction.
            merged.dashboardGrid = normalizeGridConfig(saved.dashboardGrid);
            // Saved arrangements come back from a file the user can edit, so
            // they are re-checked rather than trusted; a preset the check
            // discards also loses its claim to being the active one.
            merged.dashboardPresets = normalizePresets(saved.dashboardPresets);
            merged.activeTimer = normalizeSession(saved.activeTimer);
            merged.profiles = normalizeStoredProfiles(saved.profiles);
            if (!merged.dashboardPresets.some((p) => p.id === merged.dashboardPresetId)) {
                merged.dashboardPresetId = '';
            }
            for (const key of NESTED_KEYS) {
                Object.assign(merged, {
                    [key]: { ...DEFAULT_SETTINGS[key], ...(saved[key] ?? {}) },
                });
            }

            // No version means a config written before versioning existed, so
            // the five sentinel-based migrations below still apply to it — they
            // are deliberately left exactly as written. Anything newer skips
            // them and takes ordered `from < N` migrations instead.
            const from = saved.settingsVersion ?? 1;
            merged.settingsVersion = CURRENT_SETTINGS_VERSION;
            if (from <= 1) applyLegacyMigrations(saved, merged);

            // ── v2 → v3 ──
            // The navigation launcher arrived as its own module. Switch it on
            // once, so an existing dashboard gets the new widget rather than a
            // built-in module the user never sees.
            if (from < 3 && !merged.activeModuleIds.includes('navigator')) {
                merged.activeModuleIds = [...merged.activeModuleIds, 'navigator'];
            }

            // ── v3 → v4 ──
            // The prayer tracker arrived. Same reasoning as above: a built-in
            // module nobody can see is a module nobody switches on.
            if (from < 4 && !merged.activeModuleIds.includes('prayer')) {
                merged.activeModuleIds = [...merged.activeModuleIds, 'prayer'];
            }

            // ── v4 → v5 ──
            // Cross-device sync arrived. Switched on for existing configs
            // because it exists to fix a bug they already have: until now the
            // last device to save overwrote every setting the others had
            // changed, and nobody opted into that.
            if (from < 5 && !merged.activeModuleIds.includes('sync')) {
                merged.activeModuleIds = [...merged.activeModuleIds, 'sync'];
            }

            // ── v5 → v6 ──
            // Location became one plugin-wide setting. Whichever module had a
            // place set is promoted to it, and that module's own copy is
            // cleared — left behind it would be an override that shadows the
            // global one for ever, so changing the city in the obvious place
            // would silently do nothing.
            if (from < 6 && !merged.location) {
                const adopted = merged.weatherPlace ?? merged.prayerPlace;
                if (adopted) {
                    merged.location = adopted;
                    if (merged.weatherPlace === adopted) merged.weatherPlace = null;
                    if (merged.prayerPlace === adopted) merged.prayerPlace = null;
                }
            }

            // ── v6 → v7 ──
            // The picture widget arrived as its own module. Switched on for the
            // same reason the navigator was — a built-in module nobody can see
            // is a module nobody switches on — and it costs an existing board
            // nothing, because it only adds an entry to the widget gallery and
            // shows nothing at all until a picture is chosen for it.
            if (from < 7 && !merged.activeModuleIds.includes('picture')) {
                merged.activeModuleIds = [...merged.activeModuleIds, 'picture'];
            }

            // ── v7 → v8 ──
            // The canvas module is gone, and its id has to leave the active
            // list rather than sit there inertly: `canvas` was never a reserved
            // id, so a third-party module that later takes it would start up on
            // its own, never having been switched on. Its three settings are
            // left where they are, like any other key we no longer read — see
            // the merge above: forgetting them would cost the user their layout
            // choices if they ever went back to a build that still has it.
            if (from < 8) {
                merged.activeModuleIds = merged.activeModuleIds.filter((id) => id !== 'canvas');
            }

            // ── v8 → v9 ──
            // Features became switches. Everything a config written before
            // then had, it keeps: each feature on by default is pinned on, so
            // no later change to a default can take it away. An empty object
            // is not a config anybody wrote — it is a fresh install or a reset
            // — and gets the defaults instead.
            if (from < 9 && Object.keys(saved).length > 0) {
                merged.features = pinnedFeatures(merged.features);
            }

            // ── v9 → v10 ──
            // Profiles arrived. A config written before them keeps a snapshot
            // of itself, so that whatever profile is tried first, "as it was"
            // is one click away — and it never sees the first-run choice of a
            // template, which is for people starting from nothing.
            if (from < 10 && Object.keys(saved).length > 0) {
                merged.profilesOnboarded = true;
                if (!merged.profiles.some((p) => p.id === BEFORE_PROFILES_ID)) {
                    merged.profiles = [
                        ...merged.profiles,
                        beforeProfilesSnapshot(merged, getTodayString()),
                    ];
                }
            }

            // ── v10 → v11 ──
            // The content library stopped going online: no auto-fill, no
            // covers downloaded into the vault. Unlike the canvas settings
            // above, there is nothing here to go back to — the switch and each
            // type's catalogue name only described network access that is gone
            // — so both are dropped rather than carried in data.json, and in
            // every profile saved from now on, for ever.
            if (from < 11) {
                Reflect.deleteProperty(merged, 'cacheCovers');
                merged.contentTypes = merged.contentTypes.map((type) => {
                    if (!('provider' in type)) return type;
                    const copy: Record<string, unknown> = { ...type };
                    delete copy.provider;
                    return copy as unknown as ContentTypeConfig;
                });
            }

            return { settings: merged };
        }),

    setAvailableModules: (modules) => set(() => ({ availableModules: modules })),

    setLoadedModules: (moduleIds) => set(() => ({ loadedModuleIds: moduleIds })),

    // All three write THROUGH `settings`, so the existing subscription in
    // main.ts persists them with no extra plumbing — a module's settings ride
    // the same debounced `data.json` write as everything else, and sync to the
    // user's other devices for free.
    updateModuleSettings: (moduleId, patch) =>
        set((state) => ({
            settings: {
                ...state.settings,
                moduleSettings: {
                    ...state.settings.moduleSettings,
                    [moduleId]: { ...(state.settings.moduleSettings[moduleId] ?? {}), ...patch },
                },
            },
        })),

    resetModuleSettings: (moduleId) =>
        set((state) => ({
            settings: {
                ...state.settings,
                moduleSettings: { ...state.settings.moduleSettings, [moduleId]: {} },
            },
        })),

    forgetModuleSettings: (moduleId) =>
        set((state) => {
            const next = { ...state.settings.moduleSettings };
            delete next[moduleId];
            return { settings: { ...state.settings, moduleSettings: next } };
        }),
});

/**
 * Migrations for a config written before settings were versioned.
 *
 * Each recognises an old config by "this key did not exist yet" and is left
 * exactly as it was written — a sentinel that was safe when it was added stays
 * safe here, whereas re-checking it against a modern config would fire on keys
 * that now legitimately exist. Everything newer is an ordered `from < N` step
 * in `loadSettings` instead. Mutates `merged` in place.
 */
function applyLegacyMigrations(saved: Partial<ZenithSettings>, merged: ZenithSettings): void {
    // One-time migration: the weather widget moved into its own module.
    // Configs saved before this (no `weatherUnit` key) won't list it in
    // `activeModuleIds`, so inject it once to keep the widget visible.
    if (saved.weatherUnit === undefined && !merged.activeModuleIds.includes('weather')) {
        merged.activeModuleIds = [...merged.activeModuleIds, 'weather'];
    }
    // Same for the journal: a config written before the module existed
    // has no `journalDateFormat`, so activate it once rather than
    // leaving a new built-in module invisible until someone finds it.
    if (saved.journalDateFormat === undefined && !merged.activeModuleIds.includes('journal')) {
        merged.activeModuleIds = [...merged.activeModuleIds, 'journal'];
    }
    // And for the tasks calendar, which arrived later still: a config
    // written before it has no `calendarView`, so switch it on once
    // instead of leaving a built-in module the user never sees.
    if (saved.calendarView === undefined && !merged.activeModuleIds.includes('tasks-calendar')) {
        merged.activeModuleIds = [...merged.activeModuleIds, 'tasks-calendar'];
    }
    // Journal habits became trackers (which also cover 1–5 scales and
    // plain numbers). Carry a habit list across as check trackers so a
    // config from the first version keeps what it configured.
    const preTrackers = saved.journalTrackers === undefined;
    const legacyHabits = (saved as { journalHabits?: unknown }).journalHabits;
    if (preTrackers && Array.isArray(legacyHabits) && legacyHabits.length) {
        merged.journalTrackers = migrateHabits(
            legacyHabits as Array<{ id: string; label: string; icon: string; color: string }>
        );
    }
    // Daily notes moved into their own subfolder, and the folder was
    // later renumbered to `15 Journal`. A config still holding the very
    // first default never chose it — the journal saved it on first load
    // — so follow the current one. A folder the user actually picked is
    // left alone, and the `preTrackers` guard means this can only ever
    // fire for a config written before trackers existed.
    if (preTrackers && merged.journalFolderPath === LEGACY_JOURNAL_FOLDER) {
        merged.journalFolderPath = DEFAULT_JOURNAL_FOLDER;
    }
}
