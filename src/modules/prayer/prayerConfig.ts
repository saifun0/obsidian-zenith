/**
 * Prayer tracker — what a day records, and how it is written down.
 *
 * A day's prayers live in the daily note's frontmatter, one plain property per
 * prayer:
 *
 * ```yaml
 * fajr: ontime
 * dhuhr: ontime
 * asr: late
 * witr: true
 * ```
 *
 * Plain keys and readable values, for the same reason the journal's trackers
 * use them: the note has to still mean something with Zenith uninstalled, and
 * has to survive being edited by hand. Reading is therefore deliberately
 * forgiving — `true`, `done` and `x` all mean "prayed on time".
 */

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerId = (typeof PRAYERS)[number];

/**
 * Voluntary prayers a user may also want to tick. Off by default except witr —
 * these are personal practice, not obligations, so the list is opt-in.
 */
export const EXTRA_PRAYERS = ['witr', 'tahajjud', 'duha'] as const;
export type ExtraPrayerId = (typeof EXTRA_PRAYERS)[number];

/**
 * What was recorded for one prayer. **Absence of a key is not a status** — an
 * unrecorded prayer and one deliberately marked missed are different things,
 * and the statistics keep them apart.
 */
export type PrayerStatus = 'ontime' | 'late' | 'missed';

/** Menu order: best to worst, which is also the order they're offered in. */
export const PRAYER_STATUSES: readonly PrayerStatus[] = ['ontime', 'late', 'missed'] as const;

/** Lucide icon per prayer — the sun's position through the day. */
export const PRAYER_ICONS: Record<PrayerId, string> = {
    fajr: 'sunrise',
    dhuhr: 'sun',
    asr: 'cloud-sun',
    maghrib: 'sunset',
    isha: 'moon',
};

export const EXTRA_PRAYER_ICONS: Record<ExtraPrayerId, string> = {
    witr: 'moon-star',
    tahajjud: 'stars',
    duha: 'sun-medium',
};

/**
 * An icon for anything a day can show, prayer or not — sunrise closes fajr's
 * window and the last third opens tahajjud's, so both appear in the same lists
 * the five do. Keyed loosely on purpose: `PrayerTimeId` is declared next to the
 * arithmetic that produces it, and importing it here would tie the two files
 * into a cycle for the sake of a lookup table.
 */
export const TIME_ICONS: Record<string, string> = {
    ...PRAYER_ICONS,
    ...EXTRA_PRAYER_ICONS,
    sunrise: 'sunrise',
    sunset: 'sunset',
    midnight: 'moon-star',
    lastThird: 'stars',
};

/**
 * Values accepted for each status when reading a note.
 *
 * Both languages are listed because the point of a plain-text log is that
 * someone can type into it. `x` and `+` are there because a person filling a
 * table by hand reaches for them long before they reach for `ontime`.
 */
const STATUS_ALIASES: Record<PrayerStatus, readonly string[]> = {
    ontime: [
        'ontime',
        'on-time',
        'on time',
        'done',
        'prayed',
        'true',
        'yes',
        'y',
        'x',
        '+',
        'вовремя',
        'совершен',
        'совершён',
        'да',
        // Congregation used to be a status of its own. Notes written back then
        // still say so, and those prayers were performed on time — reading the
        // old words as `ontime` keeps that history rather than voiding it.
        'jamaah',
        'jamaat',
        'jama',
        'congregation',
        'mosque',
        'джамаат',
        'мечеть',
    ],
    late: ['late', 'qada', 'qadha', 'qaza', 'kaza', 'позже', 'поздно', 'када', 'каза'],
    missed: ['missed', 'miss', 'skipped', 'no', 'false', 'пропущен', 'пропущено', 'нет'],
};

/**
 * Read a frontmatter value as a status, or undefined when it says nothing.
 *
 * `false` reads as "not recorded" rather than "missed": the journal's writer
 * deletes a key instead of writing `false`, so a literal `false` in a note is
 * far more likely to be a leftover than a deliberate confession.
 */
export function parsePrayerStatus(raw: unknown): PrayerStatus | undefined {
    if (raw === null || raw === undefined || raw === '') return undefined;
    if (typeof raw === 'boolean') return raw ? 'ontime' : undefined;

    const text = String(raw).trim().toLowerCase();
    if (!text) return undefined;
    for (const status of PRAYER_STATUSES) {
        if (STATUS_ALIASES[status].includes(text)) return status;
    }
    return undefined;
}

/** Whether a status means the prayer was performed at all. */
export function isPerformed(status: PrayerStatus | undefined): boolean {
    return status !== undefined && status !== 'missed';
}

// ── Calculation methods ──────────────────────────────

/**
 * How isha is defined. Most authorities use a sun angle; the Gulf methods use a
 * fixed interval after maghrib instead, which is why this is a union rather
 * than a number — a single "angle" field would have no honest value for them.
 */
export type IshaRule = { kind: 'angle'; angle: number } | { kind: 'minutes'; minutes: number; ramadan?: number };

export interface PrayerMethod {
    id: string;
    /** How far below the horizon the sun is at fajr, in degrees. */
    fajrAngle: number;
    isha: IshaRule;
    /**
     * Degrees below the horizon for maghrib. Absent = at sunset (the standard
     * 0.833° refraction figure); the Shia methods wait for deeper twilight.
     */
    maghribAngle?: number;
}

/**
 * The methods offered in settings.
 *
 * `russia` is first and is the default: the angles published by the Russian
 * muftiate are what the local calendars and mosques here print, and a tracker
 * whose times disagree with the mosque down the road is worse than no tracker.
 * Everything else is the standard set, so a user anywhere can match their own.
 */
export const PRAYER_METHODS: readonly PrayerMethod[] = [
    { id: 'russia', fajrAngle: 16, isha: { kind: 'angle', angle: 15 } },
    { id: 'mwl', fajrAngle: 18, isha: { kind: 'angle', angle: 17 } },
    { id: 'isna', fajrAngle: 15, isha: { kind: 'angle', angle: 15 } },
    { id: 'egypt', fajrAngle: 19.5, isha: { kind: 'angle', angle: 17.5 } },
    { id: 'makkah', fajrAngle: 18.5, isha: { kind: 'minutes', minutes: 90, ramadan: 120 } },
    { id: 'karachi', fajrAngle: 18, isha: { kind: 'angle', angle: 18 } },
    { id: 'dubai', fajrAngle: 18.2, isha: { kind: 'angle', angle: 18.2 } },
    { id: 'kuwait', fajrAngle: 18, isha: { kind: 'angle', angle: 17.5 } },
    { id: 'qatar', fajrAngle: 18, isha: { kind: 'minutes', minutes: 90 } },
    { id: 'singapore', fajrAngle: 20, isha: { kind: 'angle', angle: 18 } },
    { id: 'turkey', fajrAngle: 18, isha: { kind: 'angle', angle: 17 } },
    { id: 'tehran', fajrAngle: 17.7, isha: { kind: 'angle', angle: 14 }, maghribAngle: 4.5 },
    { id: 'jafari', fajrAngle: 16, isha: { kind: 'angle', angle: 14 }, maghribAngle: 4 },
    // Angles come from the user's own settings; the values here are only the
    // starting point the form shows before they change them.
    { id: 'custom', fajrAngle: 18, isha: { kind: 'angle', angle: 17 } },
] as const;

export const DEFAULT_METHOD_ID = 'russia';

export function findMethod(id: string): PrayerMethod {
    return PRAYER_METHODS.find((m) => m.id === id) ?? PRAYER_METHODS[0];
}

/**
 * Which shadow length marks the start of asr: its object's own length
 * (Shafi'i, Maliki, Hanbali) or twice it (Hanafi).
 */
export type AsrMadhab = 'standard' | 'hanafi';

export const ASR_SHADOW_FACTOR: Record<AsrMadhab, number> = { standard: 1, hanafi: 2 };

/**
 * What to do where the sun never dips far enough for fajr or isha to exist.
 *
 * Above roughly 48° this stops being exotic — a Petersburg summer has no
 * astronomical night at all — so the fallback is a first-class setting rather
 * than a hidden constant.
 */
export type HighLatRule = 'none' | 'middleOfNight' | 'seventhOfNight' | 'angleBased';

export const HIGH_LAT_RULES: readonly HighLatRule[] = [
    'angleBased',
    'middleOfNight',
    'seventhOfNight',
    'none',
] as const;
