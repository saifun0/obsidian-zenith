import { CHECKBOX_RE } from '../../../services/vaultService';

/**
 * Merge two versions of one Markdown note by what they mean, not by their lines.
 *
 * This is the part a general file-sync tool cannot do. Remotely Save resolves a
 * conflict with `diff3` over raw lines, which is right for arbitrary text and
 * wrong for these notes: ticking a habit on the phone and logging a mood on the
 * desktop touch two different frontmatter keys and are not in conflict at all,
 * but they land on adjacent lines and read to a line differ as one contested
 * hunk. Understanding that the note is frontmatter plus task lines turns most
 * "conflicts" back into what they are — two independent edits.
 *
 * ── Two-way, not three ──
 *
 * There is no common ancestor available. The previous-sync record stores sizes
 * and timestamps, not contents, and keeping a copy of every synced file just to
 * enable this would cost more than the feature is worth. So this reasons from
 * the two versions alone, which sets a hard limit: where both sides could
 * plausibly have written the same thing, it refuses rather than guesses.
 *
 * Refusing is cheap — the caller falls back to keeping both copies, and the user
 * sorts it out with everything still in front of them. Guessing wrong destroys
 * writing. So every rule below leans the same way.
 */

export type UnmergeableReason =
    /** The text outside frontmatter and task lines differs on both sides. */
    | 'prose_diverged'
    /** Not a note this merger understands. */
    | 'not_markdown'
    /** A `.canvas` file that would not parse on one of the two sides. */
    | 'not_canvas';

export interface MergeNote {
    kind: 'frontmatter' | 'task' | 'status' | 'node' | 'edge';
    key: string;
    detail: string;
}

export type MergeOutcome =
    | { kind: 'identical' }
    | { kind: 'merged'; text: string; notes: MergeNote[] }
    | { kind: 'unmergeable'; reason: UnmergeableReason };

export interface MergeOptions {
    /**
     * Which side wins a genuine same-key disagreement.
     *
     * Only consulted where the two values cannot both be kept — a scalar
     * frontmatter value, say. Anything that can hold both does.
     */
    prefer: 'local' | 'remote';
}

// ── Document shape ───────────────────────────────────

interface Doc {
    /** Frontmatter lines in order, parsed where they are `key: value`. */
    front: FrontLine[];
    /** True when the note actually opened with a `---` block. */
    hasFront: boolean;
    body: string[];
}

interface FrontLine {
    raw: string;
    key: string | null;
    value: string;
}

/**
 * Split a note into frontmatter and body.
 *
 * Line-based rather than through a YAML parser, because the result has to be
 * written back: parsing to an object and re-serialising would reformat lists,
 * quote strings that were bare, and generally rewrite parts of the note nobody
 * touched. The same reasoning as `withDate` in `journalWriter`.
 */
export function splitDoc(text: string): Doc {
    const lines = text.split('\n');
    if (lines[0]?.trim() !== '---') {
        return { front: [], hasFront: false, body: lines };
    }

    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end === -1) return { front: [], hasFront: false, body: lines };

    const front = lines.slice(1, end).map(toFrontLine);
    return { front, hasFront: true, body: lines.slice(end + 1) };
}

function toFrontLine(raw: string): FrontLine {
    // Only flat `key: value` is recognised. An indented continuation or a list
    // item has no key, travels as raw text, and is compared verbatim — which is
    // what keeps a hand-written YAML list from being silently reformatted.
    const match = /^([A-Za-z0-9_][\w-]*)\s*:\s*(.*)$/.exec(raw);
    if (!match || /^\s/.test(raw)) return { raw, key: null, value: '' };
    return { raw, key: match[1], value: match[2].trim() };
}

function joinDoc(doc: Doc): string {
    if (!doc.hasFront) return doc.body.join('\n');
    return ['---', ...doc.front.map((f) => f.raw), '---', ...doc.body].join('\n');
}

// ── Task lines ───────────────────────────────────────

/**
 * A stable name for a task line, so the same task can be recognised across two
 * devices that both touched it.
 *
 * The checkbox character is excluded because ticking a task must not change its
 * identity — that is the single most common edit here. Completion and
 * cancellation stamps go too, for the same reason: they are written
 * automatically when the box is ticked, so leaving them in would make every
 * tick look like a different task.
 */
export function taskIdentity(line: string): string | null {
    const match = CHECKBOX_RE.exec(line);
    if (!match) return null;
    const identity = match[2]
        .replace(/[✅❌]\s*\d{4}-\d{2}-\d{2}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // `- [ ]` on its own is scaffolding, not a task. It reaches here because the
    // checkbox pattern's trailing `\s*` backtracks and hands the separating
    // space to the text group — the same trap `withoutBlanks` documents in
    // `taskParser`. An empty identity would match every other blank checkbox in
    // the note and merge them all into one.
    return identity || null;
}

/** How far along a task is, for settling two different checkbox characters. */
function statusRank(char: string): number {
    switch (char.toLowerCase()) {
        case 'x':
            return 3;
        case '-':
            return 3; // cancelled is as terminal as done
        case '/':
            return 2;
        default:
            return 1;
    }
}

function statusChar(line: string): string {
    return CHECKBOX_RE.exec(line)?.[1] ?? ' ';
}

interface TaskIndex {
    /** Identity → the line, in order of first appearance. */
    byIdentity: Map<string, string>;
    /** Body with every task line removed, for comparing the prose around them. */
    skeleton: string[];
}

function indexTasks(body: string[]): TaskIndex {
    const byIdentity = new Map<string, string>();
    const skeleton: string[] = [];

    for (const line of body) {
        const identity = taskIdentity(line);
        if (identity === null) {
            // A checkbox with no text at all is scaffolding, not a task, and it
            // belongs to the prose so an empty template line is not lost.
            skeleton.push(line);
            continue;
        }
        // A duplicate identity keeps the first: two identical task lines in one
        // note cannot be told apart, and merging them would silently delete one.
        if (!byIdentity.has(identity)) byIdentity.set(identity, line);
        else skeleton.push(line);
    }

    return { byIdentity, skeleton };
}

// ── The merge ────────────────────────────────────────

export function mergeMarkdown(local: string, remote: string, opts: MergeOptions): MergeOutcome {
    if (local === remote) return { kind: 'identical' };

    const l = splitDoc(local);
    const r = splitDoc(remote);
    const notes: MergeNote[] = [];

    const front = mergeFrontmatter(l, r, opts, notes);
    const body = mergeBody(l.body, r.body, opts, notes);
    if ('reason' in body) return { kind: 'unmergeable', reason: body.reason };

    const merged: Doc = {
        front,
        hasFront: l.hasFront || r.hasFront,
        body: body.lines,
    };

    const text = joinDoc(merged);
    if (text === local && text === remote) return { kind: 'identical' };
    return { kind: 'merged', text, notes };
}

/**
 * Merge frontmatter key by key.
 *
 * The case this exists for: a daily note whose frontmatter carries the day's
 * trackers. Ticking `fajr` on the phone and setting `mood` on the desktop are
 * two additions to one block, and any line-based merger sees one contested
 * region. Here they are two keys, and both survive.
 */
function mergeFrontmatter(
    l: Doc,
    r: Doc,
    opts: MergeOptions,
    notes: MergeNote[]
): FrontLine[] {
    const out: FrontLine[] = [];
    const seen = new Set<string>();

    const remoteByKey = new Map<string, FrontLine>();
    for (const line of r.front) if (line.key) remoteByKey.set(line.key, line);

    // Local order first — the file on this device is the one the user is looking
    // at, and reordering their frontmatter is a change they did not ask for.
    for (const line of l.front) {
        if (!line.key) {
            out.push(line);
            continue;
        }
        seen.add(line.key);

        const theirs = remoteByKey.get(line.key);
        if (!theirs || theirs.value === line.value) {
            out.push(line);
            continue;
        }

        const winner = opts.prefer === 'local' ? line : theirs;
        out.push(winner);
        notes.push({
            kind: 'frontmatter',
            key: line.key,
            detail: `${line.value} / ${theirs.value} — kept ${winner.value}`,
        });
    }

    // Keys only the other side has are additions, not conflicts.
    for (const line of r.front) {
        if (!line.key || seen.has(line.key)) continue;
        out.push(line);
        notes.push({ kind: 'frontmatter', key: line.key, detail: `added ${line.value}` });
    }

    // Unkeyed remote lines (a YAML list, a comment) are only carried when the
    // local side had no frontmatter at all. Interleaving them blind would
    // reassign a list item to the wrong key.
    if (!l.hasFront) {
        for (const line of r.front) if (!line.key) out.push(line);
    }

    return out;
}

function mergeBody(
    localBody: string[],
    remoteBody: string[],
    opts: MergeOptions,
    notes: MergeNote[]
): { lines: string[] } | { reason: UnmergeableReason } {
    const l = indexTasks(localBody);
    const r = indexTasks(remoteBody);

    // The prose has to agree. Without a common ancestor there is no way to tell
    // which side changed it, and picking one silently discards someone's
    // writing — the one outcome worth refusing over.
    //
    // The exception is a side with no prose at all: an empty note, or one that
    // is nothing but a task list. There is nothing of theirs to lose by taking
    // the other's, so a note created independently on both devices still merges.
    let canvas = localBody;
    let other = r;

    if (!sameLines(l.skeleton, r.skeleton)) {
        if (isBlank(l.skeleton) && !isBlank(r.skeleton)) {
            canvas = remoteBody;
            other = l;
        } else if (!isBlank(r.skeleton)) {
            return { reason: 'prose_diverged' };
        }
    }

    // Walk the canvas so its lines — prose and tasks alike — stay where they
    // are. Reordering a note nobody reordered is a change the user did not ask
    // for, and on the local side it is a change they would watch happen.
    const out: string[] = [];
    const emitted = new Set<string>();

    for (const line of canvas) {
        const identity = taskIdentity(line);
        if (identity === null) {
            out.push(line);
            continue;
        }
        // A repeated identity was already pushed to the skeleton by `indexTasks`
        // and travels as prose; only the first occurrence merges.
        if (emitted.has(identity)) {
            out.push(line);
            continue;
        }
        emitted.add(identity);

        const theirs = other.byIdentity.get(identity);
        if (!theirs) {
            out.push(line);
            continue;
        }

        out.push(mergeTaskLine(line, theirs, opts, notes, identity, canvas === localBody));
    }

    // Tasks only the other side has are appended. Placement is crude on purpose:
    // working out which section a remote task belonged to would be a guess, and
    // a task in the wrong place is still a task the user can see and move —
    // whereas a task quietly dropped is one they never learn about.
    const extra = [...other.byIdentity.entries()].filter(([id]) => !emitted.has(id));
    if (extra.length > 0) {
        while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
        out.push('');
        for (const [id, line] of extra) {
            out.push(line);
            notes.push({ kind: 'task', key: id, detail: 'added from the other device' });
        }
        out.push('');
    }

    return { lines: out };
}

/**
 * Settle one task line present on both sides.
 *
 * Only the checkbox can differ here, and that is not an accident: two lines with
 * the same identity have the same text by construction, since identity is the
 * text with the status and its completion stamp removed. So this decides a
 * status and returns that side's line verbatim — which carries the matching
 * stamp, so a `[x]` never arrives without its ✅ date.
 */
function mergeTaskLine(
    onCanvas: string,
    onOther: string,
    opts: MergeOptions,
    notes: MergeNote[],
    identity: string,
    canvasIsLocal: boolean
): string {
    if (onCanvas === onOther) return onCanvas;

    // The canvas is whichever side's prose survived, which is not always the
    // local one — so `prefer` is resolved against the real sides, not against
    // whichever happened to be walked.
    const local = canvasIsLocal ? onCanvas : onOther;
    const remote = canvasIsLocal ? onOther : onCanvas;

    const lc = statusChar(local);
    const rc = statusChar(remote);
    const lr = statusRank(lc);
    const rr = statusRank(rc);

    if (lr === rr) {
        // Equally far along but written differently — done here, cancelled
        // there, or the same box with a stamp on one side only. Neither is more
        // true than the other, so the configured preference decides and the note
        // says so rather than the choice happening silently.
        if (lc !== rc) notes.push({ kind: 'status', key: identity, detail: `[${lc}] / [${rc}]` });
        return opts.prefer === 'local' ? local : remote;
    }

    // A task someone finished is not un-finished by the other device's stale
    // copy: the further-along status wins whichever side it is on.
    return lr > rr ? local : remote;
}

function sameLines(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((line, i) => line === b[i]);
}

function isBlank(lines: string[]): boolean {
    return lines.every((line) => line.trim() === '');
}
