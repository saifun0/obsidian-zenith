import { scalarText } from './scalarText';

/**
 * Journal tracker configuration.
 *
 * A "tracker" is one thing a daily note records about the day. Three kinds
 * cover what a journal actually asks:
 *
 * | Kind     | Value      | Example                        |
 * | -------- | ---------- | ------------------------------ |
 * | `check`  | `true`     | Did I exercise?                |
 * | `scale`  | `1`–`5`    | How was my mood?               |
 * | `number` | any number | How many glasses of water?     |
 *
 * Every tracker stores its value under its **own** frontmatter key, so the day
 * reads as ordinary Obsidian properties (`mood: 4`, `sport: true`, `water: 6`)
 * and stays meaningful with the plugin uninstalled. Mood and energy are not
 * special-cased anywhere — they are simply two `scale` trackers that ship by
 * default, and can be renamed or removed like any other.
 */

export type TrackerKind = 'check' | 'scale' | 'number';

/** Kinds offered in settings, in menu order. */
export const TRACKER_KINDS: readonly TrackerKind[] = ['check', 'scale', 'number'] as const;

/** Steps in a `scale` tracker. Five is small enough to pick without thinking. */
export const SCALE_MAX = 5;

/**
 * The score a `scale` day must reach to count as a good day, when the tracker
 * doesn't say otherwise.
 *
 * Four of five: high enough that it means something, low enough that a normal
 * good day clears it. Only the habit grid asks this question — a scale's
 * average doesn't need a threshold, and never had one.
 */
export const DEFAULT_SCALE_GOAL = 4;

/** Over what a goal is counted: each day on its own, or days in a week. */
export type GoalPeriod = 'day' | 'week';

/** Which side of the target is good: reach it, or stay under it. */
export type GoalDirection = 'atLeast' | 'atMost';

/** The fields that make up a tracker's goal — what a goal record keeps. */
export const GOAL_FIELDS = ['goal', 'max', 'goalPeriod', 'goalCount', 'goalDirection'] as const;
export type GoalField = (typeof GOAL_FIELDS)[number];

/**
 * A goal as it was, until a day. Kept when the goal changes so the days before
 * it are still judged by what was asked of them then: raising "three times a
 * week" to five must not quietly turn last month's good weeks into failures.
 */
export interface GoalRecord extends Partial<Pick<JournalTracker, GoalField>> {
    /** The last day this goal was in force, `YYYY-MM-DD`. */
    until: string;
}

export interface JournalTracker {
    /** Frontmatter key. Assigned at creation; see `uniqueTrackerId`. */
    id: string;
    /** Display label. */
    label: string;
    /** Lucide icon name (kebab-case). */
    icon: string;
    /** Accent colour (CSS colour). */
    color: string;
    kind: TrackerKind;
    /** `number` only: unit shown after the value ("glasses", "km"). */
    unit?: string;
    /** `number` only: increment of the −/+ steppers. Defaults to 1. */
    step?: number;
    /** `number` only: the value the statistics bar treats as "full". */
    max?: number;
    /**
     * `scale` only: the score a day must reach to count as done, 1–5.
     * Defaults to {@link DEFAULT_SCALE_GOAL}.
     *
     * A `number` tracker states the same thing through `max` — the value its
     * bar already treats as full — so it needs no second field, and a `check`
     * has nothing to say here: it is done when it is ticked.
     */
    goal?: number;
    /**
     * `week`: the goal is met on `goalCount` days of each week rather than on
     * every day — "sport three times a week". Absent means every day.
     */
    goalPeriod?: GoalPeriod;
    /** Days a week the goal has to be met, 1–7, when the period is a week. */
    goalCount?: number;
    /**
     * `atMost` turns a `number` or `scale` target into a limit: coffee, two
     * cups at most. Absent means at least.
     */
    goalDirection?: GoalDirection;
    /** Earlier goals, oldest first. See {@link GoalRecord}. */
    goalHistory?: GoalRecord[];
    /**
     * `quit`: a habit being given up. A day counts when it is recorded and the
     * habit is not — no tick, a count of zero — and only recorded days count at
     * all: an unwritten day is not a day without smoking, it is a day nobody
     * said anything about.
     */
    mode?: 'quit';
    /**
     * Runtime only, never saved: whether `tracker: rest` in a note marks a day
     * of rest. Set by the journal while its goals feature is on.
     */
    restDays?: boolean;
    /**
     * Left out of the check-in and the habit grid, without being deleted.
     *
     * A tracker you've stopped keeping is not a tracker you want to lose: its
     * id still names a frontmatter key in every note that recorded it, and
     * deleting it would orphan that history. Switching it off takes it out of
     * the way and leaves the record intact — switching it back on finds
     * everything still there.
     */
    disabled?: boolean;
}

/** The trackers a surface should actually show. */
export function activeTrackers(trackers: readonly JournalTracker[]): JournalTracker[] {
    return trackers.filter((tracker) => !tracker.disabled);
}

/**
 * Words that mark a day of rest when written as a tracker's value
 * (`sport: rest`). A rest day neither breaks a run nor adds to it — the week's
 * planned day off is not a lapse, and not an achievement either.
 */
export const REST_WORDS: readonly string[] = ['rest', 'отдых'] as const;

export function isRestWord(text: string | undefined): boolean {
    return !!text && REST_WORDS.includes(text.trim().toLowerCase());
}

/** A tracker with every goal extension taken off — how it reads while the feature is off. */
export function withoutGoalExtensions(tracker: JournalTracker): JournalTracker {
    const out = { ...tracker };
    delete out.goalPeriod;
    delete out.goalCount;
    delete out.goalDirection;
    delete out.goalHistory;
    delete out.restDays;
    return out;
}

/**
 * The tracker with the goal that was in force on `date`.
 *
 * The first record whose `until` has not passed by that date wins; a date after
 * every record gets the current goal.
 */
export function goalOn(tracker: JournalTracker, date?: string): JournalTracker {
    const history = tracker.goalHistory;
    if (!date || !history?.length) return tracker;
    const record = [...history]
        .sort((a, b) => a.until.localeCompare(b.until))
        .find((r) => date <= r.until);
    if (!record) return tracker;
    const out: JournalTracker = { ...tracker };
    for (const field of GOAL_FIELDS) {
        (out as unknown as Record<string, unknown>)[field] = record[field];
    }
    return out;
}

/** Whether two versions of a tracker ask for different things. */
export function goalChanged(a: JournalTracker, b: JournalTracker): boolean {
    return GOAL_FIELDS.some((field) => a[field] !== b[field]);
}

/**
 * `after`, with `before`'s goal kept as history when the goal changed.
 *
 * The old goal runs until yesterday: today is when the new one starts. Changed
 * twice in one day, the goal before today is already on record and is not
 * recorded again — only the last of the day's edits is what today asks.
 */
export function withGoalHistory(
    before: JournalTracker,
    after: JournalTracker,
    yesterday: string
): JournalTracker {
    if (!goalChanged(before, after)) return after;
    const history = before.goalHistory ?? [];
    if (history.some((r) => r.until >= yesterday)) return after;
    const record: GoalRecord = { until: yesterday };
    for (const field of GOAL_FIELDS) {
        if (before[field] !== undefined) {
            (record as unknown as Record<string, unknown>)[field] = before[field];
        }
    }
    return { ...after, goalHistory: [...history, record] };
}

/** Days a week a weekly goal asks for, kept within 1–7. */
export function weeklyCount(tracker: JournalTracker): number {
    return Math.min(7, Math.max(1, Math.round(tracker.goalCount ?? 3)));
}

/**
 * Notes-section headings, in every language Zenith ships, lower-cased.
 *
 * The word counter counts what you *wrote*, which is the section under this
 * heading — not the task list or the template's own scaffolding. A note is
 * written under whatever language was active at the time and read back under
 * whatever is active now, so every translation has to be recognised, not just
 * the current one.
 *
 * Kept here rather than read from the dictionaries because the parser has no
 * business importing the i18n layer (and the store behind it); a test asserts
 * this list stays in step with `journal.template.notes`.
 */
export const NOTES_HEADINGS: readonly string[] = ['notes', 'заметки'] as const;

export const DEFAULT_TRACKERS: readonly JournalTracker[] = [
    { id: 'mood', label: 'Mood', icon: 'smile', color: '#eab308', kind: 'scale' },
    { id: 'energy', label: 'Energy', icon: 'zap', color: '#84cc16', kind: 'scale' },
    { id: 'sport', label: 'Exercise', icon: 'dumbbell', color: '#ef4444', kind: 'check' },
    { id: 'reading', label: 'Reading', icon: 'book-open', color: '#8b5cf6', kind: 'check' },
    {
        id: 'water',
        label: 'Water',
        icon: 'droplet',
        color: '#3b82f6',
        kind: 'number',
        unit: 'glasses',
        step: 1,
        max: 8,
    },
    { id: 'walk', label: 'Walk', icon: 'footprints', color: '#10b981', kind: 'check' },
    { id: 'meditation', label: 'Meditation', icon: 'flower-2', color: '#f59e0b', kind: 'check' },
] as const;

/**
 * Frontmatter keys a tracker may not claim.
 *
 * `date` and `tags` are the journal's own; the rest are Obsidian's, and a
 * tracker writing `true` into `aliases` would break the note in ways that have
 * nothing to do with journalling. `habits` is the legacy list this model
 * replaced — see `migrateHabits`.
 */
export const RESERVED_TRACKER_IDS: readonly string[] = [
    'date',
    'tags',
    'aliases',
    'cssclasses',
    'cssclass',
    'habits',
    'position',
] as const;

/**
 * Colours for a 1–5 scale, running red → green so a month of them reads as a
 * heat strip. Index 0 is unused, so the array can be indexed by the score.
 */
export const SCALE_COLORS: readonly string[] = [
    'transparent',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#84cc16',
    '#10b981',
];

/** The colour a value should be drawn in for its tracker. */
export function trackerColor(tracker: JournalTracker, value: number | boolean | undefined): string {
    if (tracker.kind === 'scale' && typeof value === 'number') {
        return SCALE_COLORS[Math.min(SCALE_MAX, Math.max(1, Math.round(value)))];
    }
    return tracker.color;
}

/**
 * Coerce a stored value into the shape its kind expects.
 *
 * Values come from YAML the user can edit by hand, so `mood: "4"` and
 * `sport: yes` have to survive the trip. Returns undefined when there's nothing
 * usable — which is different from a zero, and stays different all the way
 * through the statistics.
 */
export function coerceTrackerValue(
    kind: TrackerKind,
    raw: unknown
): number | boolean | undefined {
    if (raw === null || raw === undefined || raw === '') return undefined;

    if (kind === 'check') {
        if (typeof raw === 'boolean') return raw || undefined;
        const text = scalarText(raw).trim().toLowerCase();
        if (['true', 'yes', 'y', '1', 'done', 'x'].includes(text)) return true;
        return undefined;
    }

    const text = scalarText(raw).trim();
    const n = typeof raw === 'number' ? raw : text ? Number(text) : NaN;
    if (!Number.isFinite(n)) return undefined;

    if (kind === 'scale') {
        if (n <= 0) return undefined;
        return Math.min(SCALE_MAX, Math.max(1, Math.round(n)));
    }
    return n;
}

/**
 * The value a day has to reach for the tracker to count as done that day.
 *
 * Zero means "the tracker states no target" — which only a `number` without a
 * `max` can do, and there anything above nothing counts. That distinction is
 * why this returns a number rather than a predicate: the grid also draws how
 * FULL a day was, and a target of zero has no fraction to draw.
 */
export function trackerGoal(tracker: JournalTracker): number {
    if (tracker.kind === 'check') return 1;
    if (tracker.kind === 'scale') {
        const goal = tracker.goal ?? DEFAULT_SCALE_GOAL;
        return Math.min(SCALE_MAX, Math.max(1, Math.round(goal)));
    }
    return tracker.max && tracker.max > 0 ? tracker.max : 0;
}

/**
 * Whether a day's recorded value counts as done — by the goal in force on
 * `date`, when a date is given.
 *
 * A limit (`atMost`) is met by staying under it, zero included; a check box
 * has no amount to stay under, so it only ever reads "at least".
 */
export function meetsGoal(tracker: JournalTracker, raw: unknown, date?: string): boolean {
    const t = goalOn(tracker, date);
    const value = coerceTrackerValue(t.kind, raw);
    if (value === undefined) return false;
    if (typeof value === 'boolean') return value;
    const goal = trackerGoal(t);
    if (t.goalDirection === 'atMost') return value <= goal;
    return goal > 0 ? value >= goal : value > 0;
}

/**
 * How full a day's mark should be drawn, 0–1.
 *
 * Zero is reserved for "nothing recorded", so any recorded value keeps a floor
 * — a glass of water on a two-litre goal has to stay visible as a mark, not
 * fade into the empty days around it.
 */
export function trackerFill(tracker: JournalTracker, raw: unknown): number {
    const value = coerceTrackerValue(tracker.kind, raw);
    if (value === undefined) return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    // A limit is full when kept, not when approached: two coffees of a
    // two-coffee limit is a kept day, not a nearly-full one.
    if (tracker.goalDirection === 'atMost') return meetsGoal(tracker, raw) ? 1 : 0.2;

    const goal = trackerGoal(tracker);
    if (goal <= 0) return value > 0 ? 1 : 0;
    return Math.max(0.2, Math.min(1, value / goal));
}

/** Turn a label into a frontmatter-safe key. */
export function slugifyTracker(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * A tracker id that is free, safe and not reserved.
 *
 * An id is what past notes wrote into their frontmatter, so it is assigned once
 * at creation and only ever changed deliberately — renaming a tracker's label
 * must not touch it, or every day already recorded is orphaned.
 */
export function uniqueTrackerId(base: string, existing: readonly JournalTracker[]): string {
    const seed = slugifyTracker(base) || 'tracker';
    const taken = new Set([...existing.map((t) => t.id), ...RESERVED_TRACKER_IDS]);
    if (!taken.has(seed)) return seed;
    let n = 2;
    while (taken.has(`${seed}-${n}`)) n++;
    return `${seed}-${n}`;
}

/** Why a tracker id is unusable, or null when it's fine. */
export function trackerIdProblem(
    id: string,
    self: JournalTracker,
    all: readonly JournalTracker[]
): 'empty' | 'reserved' | 'duplicate' | 'charset' | null {
    const trimmed = id.trim();
    if (!trimmed) return 'empty';
    if (RESERVED_TRACKER_IDS.includes(trimmed)) return 'reserved';
    if (trimmed !== slugifyTracker(trimmed)) return 'charset';
    if (all.some((t) => t !== self && t.id === trimmed)) return 'duplicate';
    return null;
}

/**
 * Convert the pre-tracker settings shape (a list of habits plus hard-coded mood
 * and energy) into trackers, so a config written by the first version of the
 * journal keeps its habits instead of silently reverting to the defaults.
 */
export function migrateHabits(
    habits: Array<{ id: string; label: string; icon: string; color: string }>
): JournalTracker[] {
    const scales = DEFAULT_TRACKERS.filter((t) => t.kind === 'scale').map((t) => ({ ...t }));
    return [...scales, ...habits.map((h) => ({ ...h, kind: 'check' as const }))];
}
