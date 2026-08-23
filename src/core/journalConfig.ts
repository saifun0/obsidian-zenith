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
        const text = String(raw).trim().toLowerCase();
        if (['true', 'yes', 'y', '1', 'done', 'x'].includes(text)) return true;
        return undefined;
    }

    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
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

/** Whether a day's recorded value counts as done. */
export function meetsGoal(tracker: JournalTracker, raw: unknown): boolean {
    const value = coerceTrackerValue(tracker.kind, raw);
    if (value === undefined) return false;
    if (typeof value === 'boolean') return value;
    const goal = trackerGoal(tracker);
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
