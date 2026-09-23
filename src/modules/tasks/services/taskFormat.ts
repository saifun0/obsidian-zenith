import type { Priority, TaskStatus } from '../../../core/constants';

/**
 * Pure, Obsidian-free helpers for the Zenith task line format. Shared by the
 * writer (change a line) and the parser (read a line) so the two agree, and
 * unit-testable in isolation.
 *
 * Uses the widely-adopted Tasks-plugin emoji convention:
 *   `- [ ] <title> <priority> 🔁 <recurrence> 🛫 <start> ⏳ <scheduled> 📅 <due> ✅ <done> #tags`
 * The status lives in the checkbox itself (`[ ] [/] [x] [-]`), handled by the
 * writer; the body carries everything else.
 *
 * A line is read into items that, joined, give back the line byte for byte,
 * and it is edited by changing items — never by building it again from what
 * was understood. A line carries more than this plugin reads: Tasks-plugin
 * markers there is no field for, a block link, somebody's own emoji. Rebuilt
 * from parsed fields, all of that goes on the first save, and it did: `➕` was
 * stripped from every task anybody edited here.
 */

// Inline priority markers — the ones written.
export const PRIORITY_EMOJI: Record<Priority, string> = {
    none: '',
    low: '🔽',
    medium: '',
    high: '🔼',
    urgent: '⏫',
};

/**
 * Every priority glyph a line may carry, and the level it reads as.
 *
 * The Tasks plugin has two more levels than this plugin does. 🔺 (highest)
 * and ⏬ (lowest) read as the extreme ones for sorting, and are never written
 * back unless the user picks a different priority: a form that cannot tell 🔺
 * from ⏫ must not demote it on a save that did not touch it.
 */
const PRIORITY_BY_GLYPH: Record<string, Priority> = {
    '🔺': 'urgent',
    '⏫': 'urgent',
    '🔼': 'high',
    '🔽': 'low',
    '⏬': 'low',
};

// ── The marker table ─────────────────────────────────

type FieldKind =
    | 'id'
    | 'dependsOn'
    | 'priority'
    | 'recurrence'
    | 'onCompletion'
    | 'createdDate'
    | 'startDate'
    | 'scheduledDate'
    | 'dueDate'
    | 'time'
    | 'spent'
    | 'timer'
    | 'doneDate'
    | 'cancelledDate';

interface MarkerDef {
    kind: FieldKind;
    /** Every glyph that means this field. The first is the one written. */
    glyphs: readonly string[];
    /** What follows the glyph, as regex source; `null` for a glyph on its own. */
    value: string | null;
}

const ISO = '\\d{4}-\\d{2}-\\d{2}';
const DURATION = '\\d+(?:h\\d*)?m?';
const TASK_ID = '[\\w-]+';

/**
 * When a task happens, as opposed to the day `📅` gives it: `⏰ 09:00`, or
 * `⏰ 09:00-10:30` when it also ends at a known hour.
 *
 * A separate marker rather than a time appended to `📅 2026-09-01`: other
 * readers of this convention parse that date with a fixed pattern, and a
 * trailing time would either be ignored or break them. On its own, `⏰` is one
 * more marker they skip — and so is the `-10:30` hanging off it.
 *
 * The dash may be a hyphen, an en dash or an em dash, because a note typed by
 * hand (or autocorrected by the editor) uses whichever it feels like.
 */
const HOURS = '\\d{1,2}:\\d{2}(?:\\s*[-–—]\\s*\\d{1,2}:\\d{2})?';
const HOURS_RE = /^(\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?$/;

/**
 * A recurrence rule runs until the next marker — and "marker" means any emoji,
 * not a list of the ones known here. A hand-written list is how
 * `🔁 every week 🏁 delete` came to read as the rule "every week 🏁 delete":
 * 🏁 was not on it. `#` starts a tag and `[` a Dataview field; neither is ever
 * part of a rule.
 */
const RULE = '[^\\p{Extended_Pictographic}#\\[\\n]*[^\\p{Extended_Pictographic}#\\[\\s]';

/**
 * Every marker, in the order they are written. The order is also where a
 * marker the line did not have yet goes: after the nearest one before it.
 *
 * 🆔 ⛔ 🏁 ➕ come from the Tasks plugin. There are no fields for them, but
 * they are here all the same — so the title does not swallow them, a rule
 * does not run into them, and a new occurrence knows which of them to leave
 * behind. The order around them is the Tasks plugin's.
 */
const MARKERS: readonly MarkerDef[] = [
    { kind: 'id', glyphs: ['🆔'], value: TASK_ID },
    { kind: 'dependsOn', glyphs: ['⛔'], value: `${TASK_ID}(?:\\s*,\\s*${TASK_ID})*` },
    { kind: 'priority', glyphs: ['⏫', '🔼', '🔽', '🔺', '⏬'], value: null },
    { kind: 'recurrence', glyphs: ['🔁'], value: RULE },
    { kind: 'onCompletion', glyphs: ['🏁'], value: '[a-zA-Z]+' },
    { kind: 'createdDate', glyphs: ['➕'], value: ISO },
    { kind: 'startDate', glyphs: ['🛫'], value: ISO },
    { kind: 'scheduledDate', glyphs: ['⏳', '⌛'], value: ISO },
    { kind: 'dueDate', glyphs: ['📅', '📆', '🗓'], value: ISO },
    { kind: 'time', glyphs: ['⏰'], value: HOURS },
    // Time already spent on the task, accumulated across sessions.
    { kind: 'spent', glyphs: ['⏱'], value: DURATION },
    // The countdown the user set, in case they want the same one again.
    { kind: 'timer', glyphs: ['⏲'], value: DURATION },
    { kind: 'doneDate', glyphs: ['✅'], value: ISO },
    // When a task was given up on. `❌` is the Tasks convention, as `✅` is for done.
    { kind: 'cancelledDate', glyphs: ['❌'], value: ISO },
];

const RANK = new Map<string, number>(MARKERS.map((def, i) => [def.kind, i]));
const rankOf = (kind: ItemKind): number => RANK.get(kind) ?? -1;

/**
 * Tag characters, by Obsidian's rules rather than ASCII's: `#работа` is a tag.
 * The other two rules — whitespace before it, and not all digits — are checked
 * in `itemOf`, since neither fits a regex without a lookbehind.
 */
const TAG = '#[\\p{L}\\p{N}\\p{M}_/-]+';

/**
 * Every marker and tag in one pattern, built from the table so that there is
 * one list of glyphs and not several that drift apart. U+FE0F is the
 * variation selector some keyboards put after an emoji.
 */
const ITEM_RE = new RegExp(
    [
        ...MARKERS.map((def, i) => {
            const glyph = `(?<g${i}>${def.glyphs.join('|')})\\uFE0F?`;
            return def.value ? `${glyph}\\s*(?<v${i}>${def.value})` : glyph;
        }),
        `(?<tag>${TAG})`,
    ].join('|'),
    'gu'
);

/** `^block-id`, which Obsidian only recognizes at the very end of the line. */
const BLOCK_LINK_RE = /\s+\^[A-Za-z0-9-]+\s*$/;

// ── Reading a line into items ────────────────────────

type ItemKind = FieldKind | 'tag' | 'text';

interface Item {
    kind: ItemKind;
    /** The whitespace before it, kept so an untouched line stays as it was. */
    lead: string;
    raw: string;
    /** The date, the rule, the tag's name — or a priority's glyph. */
    value: string;
}

interface Line {
    items: Item[];
    /** Whitespace after the last item. */
    end: string;
    /** ` ^abc123` when the line has one, kept apart so it always stays last. */
    blockLink: string;
}

function itemOf(m: RegExpExecArray, head: string): Omit<Item, 'lead'> | null {
    const groups: Record<string, string | undefined> = m.groups ?? {};
    const tag = groups.tag;
    if (tag !== undefined) {
        // `C#`, `page#anchor` and `#1` are not tags to Obsidian, so not to us.
        const spaced = m.index === 0 || /\s/.test(head[m.index - 1]);
        return spaced && /[^\p{N}]/u.test(tag.slice(1))
            ? { kind: 'tag', raw: m[0], value: tag.slice(1) }
            : null;
    }
    for (let i = 0; i < MARKERS.length; i++) {
        const glyph = groups[`g${i}`];
        if (glyph === undefined) continue;
        const def = MARKERS[i];
        return { kind: def.kind, raw: m[0], value: def.value ? (groups[`v${i}`] ?? '') : glyph };
    }
    return null;
}

function readLine(body: string): Line {
    const link = body.match(BLOCK_LINK_RE);
    const head = link ? body.slice(0, link.index) : body;
    const items: Item[] = [];
    let pending = '';

    // Text between markers becomes one item, its outer whitespace the leads.
    const gap = (text: string) => {
        const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/) as RegExpMatchArray;
        if (!m[2]) {
            pending += text;
            return;
        }
        items.push({ kind: 'text', lead: pending + m[1], raw: m[2], value: m[2] });
        pending = m[3];
    };

    let last = 0;
    ITEM_RE.lastIndex = 0;
    for (let m = ITEM_RE.exec(head); m; m = ITEM_RE.exec(head)) {
        const item = itemOf(m, head);
        if (!item) continue;
        gap(head.slice(last, m.index));
        items.push({ ...item, lead: pending });
        pending = '';
        last = m.index + m[0].length;
    }
    gap(head.slice(last));

    return { items, end: pending, blockLink: link ? link[0] : '' };
}

function writeLine(line: Line, keepBlockLink: boolean): string {
    const head = line.items.map((item) => item.lead + item.raw).join('') + line.end;
    return keepBlockLink ? head + line.blockLink : head;
}

function titleOf(items: Item[]): string {
    return items
        .filter((item) => item.kind === 'text')
        .map((item) => item.raw)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Take an item out, and the separator that went with it.
 *
 * The first item's lead is whatever sat between the checkbox and the text, so
 * it passes to whatever is first now. Anywhere else the removed item's own
 * lead goes with it — unless the next one had none, and would be glued to the
 * word before.
 */
function removeItem(items: Item[], at: number): void {
    const [gone] = items.splice(at, 1);
    const next = items[at];
    if (!next) return;
    if (at === 0) next.lead = gone.lead;
    else if (!next.lead) next.lead = gone.lead || ' ';
}

function insertItem(items: Item[], at: number, kind: ItemKind, raw: string): void {
    const next = items[at];
    const item: Item = { kind, raw, value: '', lead: at === 0 ? (next?.lead ?? '') : ' ' };
    if (next) next.lead = at === 0 ? ' ' : next.lead || ' ';
    items.splice(at, 0, item);
}

/**
 * Where a marker the line does not have yet goes: after the highest-ranked
 * marker below it, else before the lowest above it, else at the end of the
 * text — ahead of any trailing tags, which by convention end the line and
 * would otherwise read as `#work ⏱ 25m`, a tag with something stuck to it.
 */
function insertionPoint(items: Item[], kind: FieldKind): number {
    const rank = rankOf(kind);
    let after = -1;
    let afterRank = -1;
    let before = -1;
    items.forEach((item, i) => {
        const r = rankOf(item.kind);
        if (r < 0) return;
        if (r < rank && r >= afterRank) {
            after = i;
            afterRank = r;
        } else if (r > rank && before < 0) {
            before = i;
        }
    });
    if (after >= 0) return after + 1;
    if (before >= 0) return before;

    let at = items.length;
    while (at > 0 && items[at - 1].kind === 'tag') at--;
    return at;
}

function indicesOf(items: Item[], kind: ItemKind): number[] {
    const out: number[] = [];
    items.forEach((item, i) => {
        if (item.kind === kind) out.push(i);
    });
    return out;
}

/** Write a marker's new text in place, remove it (`null`), or add it where it belongs. */
function setField(items: Item[], kind: FieldKind, raw: string | null): void {
    const found = indicesOf(items, kind);
    if (raw !== null && found.length) {
        items[found[0]].raw = raw;
        found.shift();
    } else if (raw !== null) {
        insertItem(items, insertionPoint(items, kind), kind, raw);
    }
    // A second copy of a marker is a typo the reader never looked at — the
    // first one is the value — so a change settles it.
    for (const i of found.reverse()) removeItem(items, i);
}

// ── Values ───────────────────────────────────────────

/**
 * Read a duration like `90m`, `2h`, `1h25m` as whole minutes.
 *
 * Written the way a person would write it rather than as a raw count of
 * seconds: the line is meant to be read and edited by hand, and `⏱ 5100` says
 * nothing to the eye that `⏱ 1h25m` doesn't say better.
 */
export function parseDuration(raw: string): number | undefined {
    const m = raw.trim().match(/^(?:(\d+)h)?(?:(\d+)m?)?$/);
    if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
    const hours = m[1] ? parseInt(m[1], 10) : 0;
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const total = hours * 60 + minutes;
    return total > 0 ? total : undefined;
}

/** The inverse: 85 → `1h25m`, 120 → `2h`, 45 → `45m`. */
export function formatDuration(minutes: number): string {
    const whole = Math.max(0, Math.round(minutes));
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** `9:5` → `09:05`; anything that isn't a time of day → undefined. */
export function normalizeTimeOfDay(raw: string): string | undefined {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return undefined;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * The end of a `⏰` range, kept only when it is a real time *after* the start.
 *
 * Both zero-length and backwards ranges are dropped rather than repaired: they
 * come from a typo or from an edit that moved the start past the end, and a
 * calendar block of negative height is not a thing that can be drawn. An end
 * that would cross midnight goes the same way — the task then simply has a
 * start, which every reader of the marker already handles.
 *
 * Normalized `HH:MM` compares correctly as a string, which is why this can be a
 * `>` and not a parse.
 */
function endAfter(start: string, raw: string | null | undefined): string | undefined {
    const end = normalizeTimeOfDay(raw ?? '');
    return end && end > start ? end : undefined;
}

function readHours(raw: string | undefined): { start?: string; end?: string } {
    const m = raw?.match(HOURS_RE);
    const start = normalizeTimeOfDay(m?.[1] ?? '');
    return { start, end: start ? endAfter(start, m?.[2]) : undefined };
}

const cleanTag = (tag: string): string => tag.replace(/^#/, '').trim();

// ── Types ────────────────────────────────────────────

export interface TaskInput {
    title: string;
    /** Checkbox status — used by the writer for the `[ ]` char; ignored by the body. */
    status?: TaskStatus;
    priority: Priority;
    tags: string[];
    dueDate?: string;
    startDate?: string;
    scheduledDate?: string;
    doneDate?: string;
    cancelledDate?: string;
    /** Hour of the day the task is due, `HH:MM`. Needs `dueDate` to mean anything. */
    dueTime?: string;
    /** Hour it ends at, `HH:MM`. Written only when it is after `dueTime`. */
    dueEndTime?: string;
    /** Minutes already spent on it. */
    spentMinutes?: number;
    /** Minutes the countdown was last set to. */
    timerMinutes?: number;
    recurrence?: string;
    /** Subtask titles (only consumed by `addTask` when creating). */
    subtasks?: string[];
}

/** The fields a form shows and can change. */
export type TaskFields = Partial<Omit<TaskInput, 'status' | 'subtasks'>>;

/**
 * A change to some of a line's fields.
 *
 * A key left out — or `undefined` — is not touched; `null` removes the marker.
 * Whatever the patch does not name stays on the line exactly as it was,
 * including markers this plugin has no field for.
 */
export interface TaskPatch {
    title?: string;
    priority?: Priority;
    addTags?: string[];
    removeTags?: string[];
    recurrence?: string | null;
    createdDate?: string | null;
    startDate?: string | null;
    scheduledDate?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
    dueEndTime?: string | null;
    spentMinutes?: number | null;
    timerMinutes?: number | null;
    doneDate?: string | null;
    cancelledDate?: string | null;
    /** Removing is all a patch can do to these three: Zenith never makes them. */
    id?: null;
    dependsOn?: null;
    blockLink?: null;
}

export interface TaskDefaults {
    priority: Priority;
    dueDate?: string;
    tags: string[];
}

export interface ParsedTaskText {
    title: string;
    priority: Priority;
    tags: string[];
    dueDate?: string;
    startDate?: string;
    scheduledDate?: string;
    doneDate?: string;
    cancelledDate?: string;
    /** `➕` — when the Tasks plugin says the task was made. Read, never edited. */
    createdDate?: string;
    /** Hour of the day the task is due, `HH:MM`. Needs `dueDate` to mean anything. */
    dueTime?: string;
    /** Hour it ends at, `HH:MM`. Only set when the line stated one after the start. */
    dueEndTime?: string;
    /** Minutes already spent on it. */
    spentMinutes?: number;
    /** Minutes the countdown was last set to. */
    timerMinutes?: number;
    recurrence?: string;
    /** `🏁 delete` / `🏁 keep` — what to do with the line once it is done, lowercased. */
    onCompletion?: string;
}

// ── Reading ──────────────────────────────────────────

/** Extract inline `#tags` (nested `#a/b` allowed) without the leading `#`. */
export function parseInlineTags(text: string): string[] {
    return readLine(text)
        .items.filter((item) => item.kind === 'tag')
        .map((item) => item.value);
}

/**
 * Parse a task's text (the part after the checkbox) into structured fields,
 * layering the file-level defaults underneath any inline markers.
 */
export function parseTaskText(text: string, defaults: TaskDefaults): ParsedTaskText {
    const { items } = readLine(text);
    const value = (kind: FieldKind) => items.find((item) => item.kind === kind)?.value;
    const glyph = value('priority');
    const hours = readHours(value('time'));
    const inlineTags = items.filter((item) => item.kind === 'tag').map((item) => item.value);

    return {
        title: titleOf(items) || text.trim(),
        priority: glyph ? PRIORITY_BY_GLYPH[glyph] : defaults.priority,
        tags: [...new Set([...defaults.tags, ...inlineTags])],
        dueDate: value('dueDate') ?? defaults.dueDate,
        dueTime: hours.start,
        dueEndTime: hours.end,
        spentMinutes: parseDuration(value('spent') ?? ''),
        timerMinutes: parseDuration(value('timer') ?? ''),
        startDate: value('startDate'),
        scheduledDate: value('scheduledDate'),
        doneDate: value('doneDate'),
        cancelledDate: value('cancelledDate'),
        createdDate: value('createdDate'),
        recurrence: value('recurrence')?.trim(),
        onCompletion: value('onCompletion')?.toLowerCase(),
    };
}

// ── Writing ──────────────────────────────────────────

/**
 * The text one field should have after the patch: a string to write, `null`
 * to remove it, `undefined` to leave it alone.
 *
 * A value equal to what the line already says is left alone too, so that the
 * way it was written survives — `📆` rather than `📅`, `⏰ 9:05` rather than
 * `⏰ 09:05`, 🔺 rather than the ⏫ it reads as.
 */
function fieldEdit(def: MarkerDef, patch: TaskPatch, items: Item[]): string | null | undefined {
    const current = items.find((item) => item.kind === def.kind)?.value;
    const glyph = def.glyphs[0];

    switch (def.kind) {
        case 'priority': {
            if (patch.priority === undefined) return undefined;
            const now = current ? PRIORITY_BY_GLYPH[current] : 'none';
            if (now === patch.priority) return undefined;
            return PRIORITY_EMOJI[patch.priority] || null;
        }
        case 'recurrence': {
            if (patch.recurrence === undefined) return undefined;
            const rule = patch.recurrence?.trim() || null;
            if (rule === (current?.trim() ?? null)) return undefined;
            return rule ? `${glyph} ${rule}` : null;
        }
        case 'time': {
            if (patch.dueTime === undefined && patch.dueEndTime === undefined) return undefined;
            const was = readHours(current);
            const rawStart = patch.dueTime !== undefined ? patch.dueTime : was.start;
            // An end without a start is an hour of nothing in particular.
            if (!rawStart) return null;
            // The end is normalized and re-checked here rather than trusted from
            // the form: this is the single door every write goes through, and it
            // is the only place that can guarantee no line is ever written with
            // a backwards range.
            const start = normalizeTimeOfDay(rawStart) ?? rawStart;
            const end = endAfter(
                start,
                patch.dueEndTime !== undefined ? patch.dueEndTime : was.end
            );
            if (start === was.start && end === was.end) return undefined;
            return `${glyph} ${start}${end ? `-${end}` : ''}`;
        }
        case 'spent':
        case 'timer': {
            const minutes = def.kind === 'spent' ? patch.spentMinutes : patch.timerMinutes;
            if (minutes === undefined) return undefined;
            const want = minutes && minutes > 0 ? Math.round(minutes) : null;
            if (want === (parseDuration(current ?? '') ?? null)) return undefined;
            return want ? `${glyph} ${formatDuration(want)}` : null;
        }
        case 'id':
        case 'dependsOn':
            return patch[def.kind] === null ? null : undefined;
        case 'onCompletion':
            return undefined;
        default: {
            const date = patch[def.kind];
            if (date === undefined) return undefined;
            const want = date || null;
            if (want === (current ?? null)) return undefined;
            return want ? `${glyph} ${want}` : null;
        }
    }
}

/**
 * Change the fields a patch names and nothing else.
 *
 * Unknown markers, the order the user wrote things in, the spacing, a glyph
 * variant — all of it is kept, because none of it is rebuilt. A marker the
 * line did not have yet goes where this plugin would have written it.
 */
export function applyTaskPatch(body: string, patch: TaskPatch): string {
    const line = readLine(body);
    const { items } = line;

    for (const def of MARKERS) {
        const raw = fieldEdit(def, patch, items);
        if (raw !== undefined) setField(items, def.kind, raw);
    }

    const drop = new Set((patch.removeTags ?? []).map(cleanTag));
    for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].kind === 'tag' && drop.has(items[i].value)) removeItem(items, i);
    }
    const present = new Set(items.filter((item) => item.kind === 'tag').map((item) => item.value));
    for (const tag of patch.addTags ?? []) {
        const clean = cleanTag(tag);
        if (!clean || present.has(clean)) continue;
        present.add(clean);
        insertItem(items, items.length, 'tag', `#${clean}`);
    }

    const title = patch.title?.trim();
    if (title && title !== (titleOf(items) || body.trim())) {
        // The new title takes the place of the first piece of the old one;
        // any other piece — text between two markers — goes.
        const texts = indicesOf(items, 'text');
        if (!texts.length) {
            insertItem(items, 0, 'text', title);
        } else {
            items[texts[0]].raw = title;
            for (const i of texts.slice(1).reverse()) removeItem(items, i);
        }
    }

    return writeLine(line, patch.blockLink !== null);
}

/** The fields a form holds as text, compared trimmed so `''` means empty. */
const TEXT_FIELDS = [
    'recurrence',
    'startDate',
    'scheduledDate',
    'dueDate',
    'doneDate',
    'cancelledDate',
    'dueTime',
    'dueEndTime',
] as const;

/**
 * What a form changed, as a patch.
 *
 * `after` holds the fields the form owns. A key it does not have is a field
 * the form never showed, and is left alone rather than cleared; `undefined`
 * under a key it does have is a field the user emptied. Comparing against
 * what the form was opened with, rather than writing every field back, is
 * what keeps a save from touching what the user did not: an inherited tag
 * is not copied onto the line, and a 🔺 is not turned into the ⏫ it reads as.
 */
export function diffTaskFields(before: TaskFields, after: TaskFields): TaskPatch {
    const patch: TaskPatch = {};
    const owns = (key: keyof TaskFields) => Object.prototype.hasOwnProperty.call(after, key);

    const title = after.title?.trim();
    if (owns('title') && title && title !== before.title?.trim()) patch.title = title;

    if (owns('priority') && (after.priority ?? 'none') !== (before.priority ?? 'none')) {
        patch.priority = after.priority ?? 'none';
    }

    if (owns('tags')) {
        const was = new Set((before.tags ?? []).map(cleanTag));
        const now = new Set((after.tags ?? []).map(cleanTag));
        const add = [...now].filter((tag) => tag && !was.has(tag));
        const remove = [...was].filter((tag) => !now.has(tag));
        if (add.length) patch.addTags = add;
        if (remove.length) patch.removeTags = remove;
    }

    for (const key of TEXT_FIELDS) {
        if (!owns(key)) continue;
        const was = before[key]?.trim() || undefined;
        const now = after[key]?.trim() || undefined;
        if (was !== now) patch[key] = now ?? null;
    }

    for (const key of ['spentMinutes', 'timerMinutes'] as const) {
        if (!owns(key)) continue;
        const was = before[key] || undefined;
        const now = after[key] || undefined;
        if (was !== now) patch[key] = now ?? null;
    }

    return patch;
}

/** The task text after the checkbox: title + priority + recurrence + dates + tags. */
export function buildTaskBody(input: TaskInput): string {
    // A new line is an empty one with every field added — the same door an
    // edit goes through, so the two cannot disagree about order or format.
    return applyTaskPatch(input.title.trim(), {
        priority: input.priority,
        recurrence: input.recurrence,
        startDate: input.startDate,
        scheduledDate: input.scheduledDate,
        dueDate: input.dueDate,
        dueTime: input.dueTime,
        dueEndTime: input.dueEndTime,
        spentMinutes: input.spentMinutes,
        timerMinutes: input.timerMinutes,
        doneDate: input.doneDate,
        cancelledDate: input.cancelledDate,
        addTags: input.tags,
    });
}

/** A full `- [ ] …` task line for a new task (status defaults to todo). */
export function buildTaskLine(input: TaskInput): string {
    const char =
        input.status === 'done'
            ? 'x'
            : input.status === 'in-progress'
              ? '/'
              : input.status === 'cancelled'
                ? '-'
                : ' ';
    return `- [${char}] ${buildTaskBody(input)}`;
}

// ── Dates and recurrence ─────────────────────────────

/** Format a Date as local `YYYY-MM-DD`. */
function localIso(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

/** Add `days` to an ISO date, returning a new ISO date. */
export function shiftIsoDate(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    d.setDate(d.getDate() + days);
    return localIso(d);
}

/**
 * Whole days from `a` to `b` (b - a).
 *
 * Re-exported from core so the long-standing `taskFormat` import path keeps
 * working; the implementation lives in `core/dateUtils` alongside the rest of
 * the local-midnight date helpers.
 */
export { daysBetweenIso } from '../../../core/dateUtils';

/** Parse a recurrence rule into a function that advances a date. Returns null if unrecognized. */
export function nextRecurrenceDate(rule: string, from: string): string | null {
    const base = new Date(`${from}T00:00:00`);
    if (Number.isNaN(base.getTime())) return null;

    const r = rule
        .toLowerCase()
        .trim()
        .replace(/^every\s+/, '');
    let days = 0;
    let months = 0;

    if (/^(day|daily|1 day)$/.test(r)) days = 1;
    else if (/^(week|weekly|1 week)$/.test(r)) days = 7;
    else if (/^(month|monthly|1 month)$/.test(r)) months = 1;
    else if (/^(year|yearly|annually|1 year)$/.test(r)) months = 12;
    else {
        const m = r.match(/^(\d+)\s*(day|week|month|year)s?$/);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        if (m[2] === 'day') days = n;
        else if (m[2] === 'week') days = n * 7;
        else if (m[2] === 'month') months = n;
        else months = n * 12;
    }

    if (months) base.setMonth(base.getMonth() + months);
    if (days) base.setDate(base.getDate() + days);

    return localIso(base);
}
