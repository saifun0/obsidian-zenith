/**
 * Shapes for the file sync engine.
 *
 * The decision names are deliberately long and deliberately verbatim from
 * Remotely Save, whose bundle was read to confirm them rather than recalled.
 * They read as sentences because that is what makes a plan reviewable: the user
 * about to approve a run that deletes forty notes should be able to see the
 * word `delete_local` next to each one, not a code they have to look up.
 */

/** A file as seen on one side of the comparison. */
export interface FileEntity {
    /** Path relative to the sync root, forward slashes, no leading slash. */
    key: string;
    size: number;
    /**
     * When the user last edited the file.
     *
     * Kept separate from the server's own timestamp because they answer
     * different questions: a server sets its clock when the upload lands, which
     * says when the file was *transferred*, not when it was *written*. Sorting
     * an edit made on a plane behind one uploaded later that day is exactly the
     * kind of wrong that costs someone their work.
     */
    mtimeCli: number;
    /** The server's own last-modified. Remote entities only. */
    mtimeSvr?: number;
    /** Opaque server version, when the remote offers one. */
    etag?: string;
}

/**
 * What to do about one path.
 *
 * Every decision that removes data names both the cause and the effect
 * (`remote_is_deleted_thus_also_delete_local`), so the reason a file is about to
 * disappear is legible in the plan without cross-referencing anything.
 */
export type SyncDecision =
    /** Nothing to do — including "gone from both sides". */
    | 'equal'
    | 'local_is_created_then_push'
    | 'local_is_modified_then_push'
    | 'local_is_deleted_thus_also_delete_remote'
    | 'remote_is_created_then_pull'
    | 'remote_is_modified_then_pull'
    | 'remote_is_deleted_thus_also_delete_local'
    /** Both sides moved and disagree; the suffix is how it was settled. */
    | 'conflict_created_then_keep_local'
    | 'conflict_created_then_keep_remote'
    | 'conflict_created_then_keep_both'
    /** Both sides moved; Zenith will try to reconcile the note's meaning. */
    | 'conflict_created_then_smart_merge'
    /** Over the size limit — left completely alone, on both sides. */
    | 'skipped_too_large'
    /** Outside the configured scope, or a file the engine owns. */
    | 'skipped_excluded';

/** Decisions that move or remove bytes. Everything else is a no-op. */
export const ACTIONABLE_DECISIONS: ReadonlySet<SyncDecision> = new Set<SyncDecision>([
    'local_is_created_then_push',
    'local_is_modified_then_push',
    'local_is_deleted_thus_also_delete_remote',
    'remote_is_created_then_pull',
    'remote_is_modified_then_pull',
    'remote_is_deleted_thus_also_delete_local',
    'conflict_created_then_keep_local',
    'conflict_created_then_keep_remote',
    'conflict_created_then_keep_both',
    'conflict_created_then_smart_merge',
]);

/** Decisions that destroy a copy of something. Counted separately, on purpose. */
export const DESTRUCTIVE_DECISIONS: ReadonlySet<SyncDecision> = new Set<SyncDecision>([
    'local_is_deleted_thus_also_delete_remote',
    'remote_is_deleted_thus_also_delete_local',
]);

/**
 * One side of a path as it stood at the end of the last successful sync.
 *
 * Recorded per side rather than once, because the two sides do not agree on
 * what a timestamp means. A WebDAV server stamps an object when the upload
 * lands, so a file we pushed comes back with a time we never wrote; comparing
 * that against the LOCAL mtime we remembered would mark it modified on every
 * run and ship the vault back and forth forever. Each side is therefore
 * compared only against its own past.
 */
export interface PrevSide {
    size: number;
    /** `mtimeCli` for the local side, the server's own time for the remote. */
    mtime: number;
    /** Preferred over size and time when the remote offers one. */
    etag?: string;
}

/** What both sides looked like when they last agreed. */
export interface PrevSyncRecord {
    key: string;
    local: PrevSide;
    remote: PrevSide;
}

export interface SyncPlanItem {
    key: string;
    decision: SyncDecision;
    local?: FileEntity;
    remote?: FileEntity;
    prev?: PrevSyncRecord;
    /**
     * Where the losing copy goes under `keep_both`. Named after the device and
     * the date so two conflicts on one file do not overwrite each other, which
     * would defeat the point of keeping both.
     */
    conflictCopyKey?: string;
    /** Short plain-language justification, shown in the preview. */
    reason: string;
}

export type SyncPlanBlockKind =
    /** The plan touches more of the vault than the safety limit allows. */
    | 'too_many_changes'
    /** Nothing has ever been synced against this remote. */
    | 'first_run_requires_review';

export interface SyncPlanBlock {
    kind: SyncPlanBlockKind;
    /** Share of known files the plan would act on, 0–1. */
    ratio?: number;
    limit?: number;
    actionable?: number;
    known?: number;
}

export interface SyncPlanStats {
    push: number;
    pull: number;
    deleteLocal: number;
    deleteRemote: number;
    conflict: number;
    skipped: number;
    equal: number;
}

export interface SyncPlan {
    items: SyncPlanItem[];
    stats: SyncPlanStats;
    /** How many items would move or remove bytes. */
    actionable: number;
    /**
     * Why this plan must not run unreviewed, or null.
     *
     * Advisory rather than fatal: the plan is still fully computed and shown, so
     * the user can look at what it wanted to do and decide. The engine is what
     * refuses to execute a blocked plan without an explicit override.
     */
    blocked: SyncPlanBlock | null;
}

/**
 * `smart` is Zenith's own: it reads the two notes as frontmatter plus task lines
 * and reconciles them by meaning, falling back to keeping both when it cannot
 * prove a merge is safe. See `conflictResolve`.
 */
export type ConflictAction = 'keep_newer' | 'keep_larger' | 'keep_both' | 'smart';

export interface PlanOptions {
    conflictAction: ConflictAction;
    /**
     * Reject the plan when it would act on more than this share of known files.
     *
     * The rail that matters most. A bug in the comparison — a remote that
     * returns an empty listing after an auth failure, a clock that moves every
     * mtime — presents as "delete everything", and a percentage catches that
     * shape of failure whatever caused it.
     */
    protectModifyRatio: number;
    /**
     * Below this many known files, the ratio rail is not applied.
     *
     * With three files in the vault every single change is 33% and the rail
     * would fire constantly, training the user to click through it — which is
     * worse than not having it.
     */
    protectMinFiles: number;
    /** Bytes; 0 disables the limit. */
    maxFileSize: number;
    /**
     * Slack when comparing timestamps.
     *
     * FAT and several WebDAV servers store seconds, some round to two; without
     * slack every file looks modified on every run and the engine copies the
     * whole vault back and forth forever.
     */
    mtimeToleranceMs: number;
    /** Paths the engine must never touch. Returns true to skip. */
    isExcluded: (key: string) => boolean;
    /**
     * Whether `smart` may be attempted for this path.
     *
     * Only Markdown qualifies: the merger reasons about frontmatter and task
     * lines, and running it over a PDF would produce plausible-looking rubbish.
     */
    isMergeable: (key: string) => boolean;
    /** Used in conflict-copy filenames. */
    deviceLabel: string;
    /** Injected so plans are reproducible in tests. */
    now: number;
    /** True when there is no previous sync record at all. */
    firstRun: boolean;
}
