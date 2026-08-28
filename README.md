# Zenith

An all-in-one life organizer for [Obsidian](https://obsidian.md): a **Dashboard**, a
**Tasks** manager, a **Journal** of daily notes, and a **Content** tracker (books, movies,
shows, games…), built on a modular architecture so features can be toggled on and off — and
extended by third-party modules — without leaving your vault.

Your data stays as plain Markdown in your vault. Zenith reads and writes ordinary `.md`
files; there is no hidden database.

---

## Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | Greeting, clock, weather, quick-add, and per-module summary widgets. |
| **Navigation** | A launcher widget with a button for every Zenith view — extendable by any module. |
| **Tasks** | Parse, filter, search, group, create, edit, complete and delete tasks. |
| **Journal** | Daily notes on a calendar, with configurable habit / scale / number tracking and the day's tasks. |
| **Content** | Gallery + stats for tracked media: metadata auto-fill, half-star ratings, statuses, progress, and import from MyAnimeList / Goodreads / Letterboxd. |
| **Prayer** | Prayer times computed on the device, a countdown to the next one, and a record of what you prayed — kept in the daily note. |
| **Media Banner** | Show a GIF/image (from the vault or a URL) above the file-explorer tree, with a picker. |

Enable or disable modules in **Settings → Active Modules**. Modules load and unload
instantly — no Obsidian restart required.

---

## Vault helpers

**Folder & file icons.** Right-click any file or folder in the native file explorer and
choose *Set icon* to assign an icon from Obsidian's built-in set. Icons persist, follow
renames/moves, and are managed under **Settings → Vault → Folder & File Icons**.

**Vault structure.** **Settings → Vault → Set up structure…** scaffolds a standard
numbered folder layout (`00 Files`, `05 Dashboards`, `10 Inbox`, `11 Journal`,
`20 Projects`, `30 Content`, `40 Resources`, `45 Study`, `50 Archive`, `99 Trash`). Any
existing top-level content is first **moved** (not deleted, links preserved) into a dated
subfolder of `50 Archive`. The action asks for confirmation and shows exactly what will be
archived.

---

## File formats

### Tasks

Tasks are Markdown checkboxes discovered in the configured **Tasks folder** — and, while
the Journal module is active, in the journal folder too, since that's where captured tasks
live. Both `-` and `*` bullets are supported, and each task has a
**4-state status** encoded in the checkbox character:

| Checkbox | Status |
| --- | --- |
| `- [ ]` | To do |
| `- [/]` | In progress |
| `- [x]` | Done |
| `- [-]` | Cancelled |

```markdown
- [ ] Write the quarterly report 🔼 📅 2025-01-15 #work/reports
    - [ ] Draft the intro
    - [x] Collect the numbers
- [/] Refactor the parser 🔁 every week 🛫 2025-01-02
- [x] Buy groceries #home ✅ 2025-01-08
```

Indented checkboxes become **subtasks** of the task above them. Inline markers (a subset of
the popular *Tasks* plugin convention):

| Marker | Meaning |
| --- | --- |
| `⏫` / `🔼` / `🔽` | Urgent / high / low priority |
| `📅 YYYY-MM-DD` | Due date |
| `🛫 YYYY-MM-DD` | Start date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `✅ YYYY-MM-DD` | Completion date (stamped automatically when marked done) |
| `🔁 <rule>` | Recurrence (`daily`, `weekly`, `monthly`, `every N days`…) |
| `⏰ HH:MM` / `⏰ HH:MM-HH:MM` | Time of day, optionally with an end — what puts the task on the calendar's hour grid |
| `⏱ 1h25m` | Time already spent (kept by the task timer) |
| `⏲ 45m` | Countdown the timer was last set to — also the planned length on the hour grid |
| `#tag` (incl. `#a/b`) | Tag |

Completing a **recurring** task stamps its ✅ date and inserts the next occurrence above it
with its dates advanced. A file may also declare **defaults** via YAML frontmatter
(`priority`, `due`, `tags`); inline markers on a line override them.

The Tasks view adds a **status picker** on each row, a rich **create/edit modal** (status,
priority, tags with autocomplete, due/start/scheduled dates, recurrence, subtasks), and a
**statistics panel** (done/total, in-progress, overdue, progress, streak, active days,
by-status & by-tag donuts, and a completion heatmap). Task rows show a rolled-up subtask
tally, and the filter bar can narrow by deadline — including **no date**, which is where
forgotten tasks accumulate. New tasks created from the UI or the
**“Quick add task”** command go into today's daily note when the Journal module's task
capture is on (the default — see [Journal](#journal)), and to `Zenith Inbox.md` otherwise.

> Dates are compared in your **local** timezone, so “Today” / “Overdue” are always correct.

**Drag and drop.** Every task and subtask row has a grip in its action cluster. A task
carries its whole subtree, and lands with the indentation of whatever it's dropped next
to — so dragging a subtask beside a top-level task promotes it, and dropping a task inside
another one's children nests it. Dropping a task into its *own* subtree is refused; it
would take its children along and orphan them.

What a drop means depends on where it lands:

| Drop | Effect |
| --- | --- |
| Within a group | Reorders the lines in the file |
| Onto another **smart bucket** | Edits the task until it belongs there: *Today* sets the due date, *Later* clears it, *Done* / *Cancelled* set the status. Dropping a completed task into an active bucket reopens it. |
| Onto another **file group** | Moves the task into that file |
| **Overdue** | Refused — a deadline in the past isn't something you can schedule into |

Empty buckets appear as drop targets only while a drag they'd accept is in flight.
Reordering needs **Sort: Manual**, since every other sort derives the order from the task
data and a dragged row would snap straight back. The grip is also focusable: press
<kbd>↑</kbd>/<kbd>↓</kbd> to move a row without a pointer.

### Journal

A daily note is one `.md` file per day in the configured **Journal folder** (Settings →
Journal), `11 Journal/Daily note` by default, named by a **filename pattern** —
`YYYY-MM-DD`. The day's check-in lives in the note's own frontmatter, so it survives the
plugin being uninstalled:

````markdown
---
date: 2026-07-28
mood: 4          # scale   — 1 to 5
energy: 3        # scale
sport: true      # check   — a habit that was done
water: 6         # number  — a count, with its own unit and step
tags: [work]
---

```zenith-daily
```

## Highlights

- Shipped the parser rewrite

## Tasks

- [ ] Reply to the design review

## Notes

…
````

**What a day records is configurable**, in *Settings → Journal → What each day records*.
A **tracker** is one thing the day measures, and comes in three kinds:

| Kind | Value | Reads as | Counts as done when |
| --- | --- | --- | --- |
| **Check-box** | `true` | Did I exercise? | it's ticked |
| **Scale 1–5** | `1`–`5` | How was my mood? | the score reaches its goal (4 by default) |
| **Number** | any number | How many glasses of water? | it reaches its target — or, with no target set, anything above zero |

Mood and energy are not special: they are two scale trackers that ship by default and can
be renamed, re-typed or deleted like any other. Each tracker owns one frontmatter key, so a
day reads as ordinary Obsidian properties — a check-box property for habits, a number for
counts — and stays meaningful to every other plugin. Deleting every tracker is allowed and
means what it says: a journal of pure prose.

Values whose tracker was later renamed or removed are **kept** in the note and still parsed,
so re-adding a tracker finds its history rather than a blank slate.

#### In the note itself

A ` ```zenith-daily ` code block renders the day's check-in inside the note: every tracker
as a control, plus **‹ ›** buttons that walk to the previous and next day (creating those
notes on demand) and a jump back to today. The built-in template starts with one; add the
block to your own template to get the same.

The date comes from the note the block sits in, not from the clock — so opening last
Tuesday and ticking a habit records it against last Tuesday.

The controls **scroll sideways rather than wrap**, in the block and in the widgets. That is
deliberate: controls that wrapped got dropped when a card was resized small, which silently
made some habits un-tickable at some sizes. Scrolling keeps every one of them reachable at
every width.

Pattern tokens are `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `DD`, `D`, `dddd`, `ddd`, with
`[…]` for literals; a `/` nests notes in subfolders (`YYYY/MM/DD`). Month and weekday names
in a **filename** are always English — deriving them from the interface language would make
every note written under one language unreachable under another. The calendar's own labels
are localized.

A note belongs to a day if its frontmatter says so, or if its filename matches the pattern.
Anything else in the folder — an index note, a scratch file — is left alone rather than
shown as an undated day.

**The calendar** colours each day by the first scale tracker — normally the mood — so a
month reads as a mood strip; a day journalled without one gets a neutral dot, and a second
dot marks days with a task due. Click a day to select it, double-click to open its note.
The day panel's controls work on days that have no note yet — they create it on first use —
and **‹ ›** beside the date step a day at a time.

**Statistics** are always on screen, above the calendar. They open with coverage over the
last 30 days — current and longest streak, entries written, words. A day counts toward a
streak only once it has words or a recorded value, so clicking through the calendar can't
pad it.

Words are counted from the **notes section only** — whatever sits under the `## Notes`
heading, in any language Zenith ships, up to the next heading of the same level. The
template's other sections hold a task list and a bullet for highlights, and counting those
reported a productive day for a note nobody had written in yet. A note with no such heading
is counted whole.

Under it, **the habit month**: one row per tracker, one column per day, and a run of days
that met their target drawn as a single bar across them. Each day's mark says which of four
things happened — met its target, recorded something short of it, journalled without
recording it, or no note at all — because a gap in the record is not the same as a failure.
The month follows the calendar below, opens scrolled to today, and keeps the habit icons
pinned while the days scroll past them.

**Clicking a day records it**, any day of the month, writing into that day's own note
through the same call the day panel uses. A check toggles where it stands; a scale or a
number opens a small editor with its steps, a stepper and its target one button away —
reaching "sixty reps, step five" by clicking one dot twelve times is not an interaction
worth having.

Three cards close the month: the strongest habit, the weakest one — named on purpose, it's
the only one next month can act on — and the average, each with its longest run. Rates are
over the days elapsed so far, not the whole month, so a good first week doesn't read as 20%.
The note on what "done" means is behind the **i** button in the header.

A tracker you've stopped keeping can be **switched off** rather than deleted (the eye beside
it in settings). It leaves the check-in and the grid and keeps every value it ever recorded,
so switching it back on finds its history intact — deleting it would orphan the frontmatter
key those notes still carry.

**Two dashboard widgets**, split by what they are for — one records the day, one reports on
it. Keeping them apart is why neither has to compromise:

| Widget | What it is |
| --- | --- |
| **Check-in** | Today's trackers as controls — the same strip the in-note block shows. |
| **Journal stats** | Streak, entries, words and every tracker over the last 30 days. Read-only, with a button into the journal. |

The statistics card is deliberately not editable: values are set in the check-in widget, in
the note's own block, or in the journal view, and a card that both reported and edited
would blur which of the two it was. Its three sizes are three different summaries rather
than one truncated three ways — the small card drops the framing and keeps the bars, the
large one earns headline figures and a per-day strip under each tracker.

**Templates.** New notes are built from the note at **Settings → Journal → Template**,
supporting `{{date}}`, `{{date:FORMAT}}`, `{{time}}` and `{{title}}` — the same placeholders
Obsidian's own Daily Notes uses, so an existing template drops in unchanged. With no
template configured, a short built-in body is used. A template that brings its own
frontmatter is merged with, not duplicated.

**Tasks land in the day.** With **Capture tasks in the daily note** on (the default), every
task created from the Tasks view or the *Quick add task* command is written into today's
note — creating it if the day hasn't been started — under the heading configured in
**File tasks under**, or at the end of the note when there isn't one. The journal folder is
then scanned for tasks as well, so those tasks still appear in the Tasks view, in the
statistics, and everywhere else tasks appear. Nothing is ever rolled over between days:
yesterday's unfinished work stays in yesterday's note, where it happened.

> **Obsidian's own Daily notes.** Zenith's journal is deliberately independent — its own
> folder, pattern and template. If the core plugin is enabled and points somewhere else,
> Settings → Journal says so: with both running you'd get two sets of daily notes and half
> your entries would land in the one you aren't looking at. Zenith never writes to the core
> plugin's settings, and never silently adopts them.

### Prayer

Prayer times are computed **on the device** from the chosen coordinates — no request, no
account, and nothing leaves the vault. What you prayed is recorded in the same daily note
the journal uses, one plain property per prayer:

```yaml
---
date: 2026-08-09
fajr: ontime      # inside its window
dhuhr: ontime
asr: late         # prayed, but after the window closed
maghrib: missed   # not prayed — and said so
isha: ontime
witr: true        # voluntary prayers are plain check-boxes
---
```

Reading is forgiving: `true`, `done` and `x` all mean "on time", and `вовремя`, `када`,
`пропущен` are understood too, so a note filled in by hand keeps working. A prayer with no
property at all is **not recorded** — which the statistics keep separate from *missed*,
because a day nobody wrote down is not a day of five missed prayers.

**Times** follow the method, madhab and high-latitude rule chosen in **Settings → Prayer**.
The default is what Russian calendars print (16°/15°, asr by the Hanafi shadow); fourteen
methods ship, including Umm al-Qura, MWL, ISNA, Diyanet and custom angles. Above roughly
48° the sun stops reaching the fajr angle in summer, and the **high-latitude rule** decides
what to show instead — a portion of the night, or nothing at all if you'd rather see the
gap than a substitute. Per-prayer **adjustments** (±30 min) exist to reconcile the
calculation with the mosque you actually pray at.

**Recording.** On the dashboard, tapping a prayer marks it — *on time* while its window is
open, *late* once it has closed — and tapping again clears it; right-click offers all three
answers. A prayer whose time hasn't come in cannot be ticked. In the full view every answer
is a visible button, and any past day can be filled in by picking it on the calendar.

**The view** shows the day's times with sunrise (which closes fajr's window) and, with
tahajjud enabled, midnight and the last third of the night; a band showing the day's
proportions with a needle at now; a month whose every day is five segments; and 30-day
statistics — performed, on time, late, missed, full days, and the streak.

A ` ```zenith-prayer ` code block renders the same tracker inside a note, dated by the note
it sits in.

**Reminders** are off by default. Switched on, they raise an Obsidian notice a configurable
number of minutes before each prayer — only while Obsidian is running, and with no adhan:
a plugin cannot wake a sleeping phone, and promising otherwise would be a promise that
breaks on the morning it matters.

### Content

Content items are `.md` files in the configured **Content folder**, described entirely by
YAML frontmatter (the note body becomes a short description preview):

```markdown
---
title: "The Great Gatsby"
type: book        # any configured type: book | movie | show | anime | manga | game | music | other
status: completed # backlog | in-progress | completed | dropped
rating: 8         # YOUR score, 0–10 (half stars in the UI, so odd values are reachable)
externalRating: 7.8          # the source's own score — never overwrites yours
cover: "covers/gatsby.jpg"   # vault path or https URL
year: 1925
creator: "F. Scott Fitzgerald"
genres: [fiction, classic]
progress: 88      # units done — pages, episodes, chapters…
progressTotal: 218
started: 2026-01-04          # stamped when the status becomes "in progress"
finished: 2026-02-11         # stamped when it becomes "completed"
tags: [favourite]
source: "https://books.google.com/gatsby"   # provenance from auto-fill
sourceId: abc123
---

Optional notes / description…
```

`status` and the progress numbers are reconciled on read: a note that says `backlog` while
recording 5 of 12 pages is shown as *in progress*, and one whose progress has reached its
total is shown as *completed*. The file itself isn't rewritten until something else edits it.

Cover images may be a remote URL or a vault-relative path (resolved automatically). With
**Settings → Content → Store cover art in the vault** on (the default), adding an item —
or refreshing its metadata — downloads the cover into `<content folder>/covers/`, so the
library keeps its artwork offline and survives a CDN going away.

**Two scores, never confused.** `rating` is yours; `externalRating` is whatever the source
said. Auto-fill records the source's score as `externalRating` and leaves your stars
unrated, and a refresh updates only `externalRating` — so a metadata refresh can't quietly
replace the 10 you gave something with the 7.8 a website gave it.

An item's detail view can **refresh its metadata** from the source it was filled from, and
**delete** it — the note goes to your vault's trash, honouring your "deleted files"
preference. A refresh only overwrites provider-owned fields, and only when it can identify
the same work again (that's what the stored `sourceId` is for), so it can't silently rebind
an item to a different film with a similar name.

**Started / finished dates** are stamped on the status transitions that cause them:
beginning something records `started` (a re-read keeps the original), finishing it records
`finished`, and sending it back to the backlog clears both. Completion deliberately does
*not* backfill a start date — guessing "today" would report an imported backlog as read in
a single day.

### Working with the library

Every poster is a control, not just a picture. **Right-click** any card for a menu: set
status, ±1 unit of progress, open the card or the note, delete. An in-progress card also
shows a **"+1"** on hover (always visible on touch), so marking an episode watched never
means opening anything. A card that hasn't been started shows its length ("13 ep") rather
than a progress bar pinned at zero.

The toolbar's **select button** turns the grid into a multi-select: pick any number of
items — the *Continue* shelf included — then set one status across all of them or delete
them together.

**Genres are filters.** Click one in an item's card or in the statistics view and the
gallery narrows to it; the active genre appears as a removable chip beside the result count.

### Importing an existing library

**Content → Import** reads an export file from **MyAnimeList** (XML), **Goodreads** (CSV)
or **Letterboxd** (CSV). The format is recognised from the file's own contents, and the
dialog previews what will land — count per type, a sample of the entries, and how many rows
were unusable — before anything is written.

Titles, scores (rescaled from 5 stars where needed), statuses, progress and the services'
own start/finish dates all come across. Existing titles are skipped by default, so
re-importing an updated export tops the library up instead of doubling it. **Covers and
synopses are not fetched during an import** — 400 books would mean 400 requests nobody
asked for; use "Refresh metadata" on the items you care about.

**Progress** is two numbers, so the UI can draw a bar, offer −/+ steppers and a "+1"
straight from the dashboard widget. Reaching the total marks the item **completed**;
starting a backlog item moves it to **in progress**. Older free-text values
(`progress: "Ep 5/12"`, `"p. 120"`, `"45%"`) are still parsed and are rewritten to the
numeric form on the first edit. What one unit is called comes from the type
(`progressUnit`: pages, episodes, chapters …) and is editable in settings.

**Auto-fill** searches keyless metadata sources as you type a title, filling cover, year,
creator, genres, rating, synopsis and total length. Each content type picks its source,
and most chain more than one so a miss on the first still lands:

| Type | Sources |
| --- | --- |
| Books | Google Books → Open Library |
| Movies / TV | iTunes → Wikipedia |
| Anime / Manga | AniList → MyAnimeList (Jikan) |
| Games | Steam → Wikipedia |
| Music | iTunes |
| Anything else | Wikipedia |

Every field stays editable, and a type can be set to **None** for pure manual entry.

The **statistics** view goes beyond totals: what you finished in the last 30 days, how long
things take you end to end, the average progress of everything in flight, your most common
genres, additions per month, and a "gone quiet" list — items still marked in progress whose
note hasn't been touched in over a month.

"Finished recently" and "days to finish" read the item's own `finished` / `started` dates.
Notes predating those dates fall back to the file's modification time, which is only a
proxy — it moves whenever the note is edited at all — so the fallback is used and never
preferred. "Gone quiet" is the one figure mtime is genuinely right for: the question there
*is* when the note was last touched.

---

## Language

Zenith's own interface follows **Settings → General → Language** (`Automatic` tracks
Obsidian's). English and Russian ship in `src/core/i18n.ts`; counted nouns go through a
plural helper, so Russian gets its one/few/many forms rather than a number glued to a
singular.

### Modules bring their own strings

A module's name and description are written by whoever wrote the module, so they cannot
live in the plugin dictionary — there is no file in this repository for a stranger's
strings. Instead a module contributes a chunk of its own, and every list of modules looks
for two keys before falling back to the untranslated manifest text:

```
module.<id>.name
module.<id>.desc
```

Built-in modules declare theirs in `src/modules/<id>/i18n.ts` and return it from
`getTranslations()`. A third-party module does exactly the same — the mechanism is one
mechanism, so it cannot rot on the path only outsiders take:

```ts
getTranslations() {
    return {
        en: { 'module.my-module.name': 'My Module', 'my-module.greeting': 'Hello' },
        ru: { 'module.my-module.name': 'Мой модуль', 'my-module.greeting': 'Привет' },
    };
}
```

Keys must sit under the module's own namespace (`<id>.…` or `module.<id>.…`); anything
else is dropped with a warning. A module that could redefine `settings.title` could also
redefine the sentence warning you about that module.

Strings can also go straight into `manifest.json`, and for the name and description that
is the better place — the settings list shows modules that are switched **off**, whose code
has never run, and what you read there is what you decide by:

```json
{
  "id": "my-module",
  "name": "My Module",
  "translations": {
    "ru": { "module.my-module.name": "Мой модуль", "module.my-module.desc": "Делает всякое." }
  }
}
```

Both channels are kept, so loading a module does not discard what its manifest already
said, and unloading one leaves its row still named. For strings that are generated rather
than shipped there is `zenith.registerTranslations(table)`, removed on unload like anything
else a module registers.

Lookup order is Zenith's own string for the locale, then a contributed one, then English of
each in turn. A module cannot take a key Zenith already answers in that language, but it
*can* supply the Russian for one Zenith only has in English.

---

## Module API

A module implements `IModule` (see [`src/core/IModule.ts`](src/core/IModule.ts)). The
`BaseModule` base class wires up idempotent view/command registration and view activation:

```ts
import { BaseModule } from '../../core/IModule';

export class MyModule extends BaseModule {
    readonly id = 'my-module';
    readonly name = 'My Module';
    readonly description = 'Does something useful.';
    readonly icon = 'sparkles'; // lucide icon name

    async onload(): Promise<void> {
        this.registerView(MY_VIEW_TYPE, (leaf) => new MyView(leaf, this.plugin));
        this.addCommand({ id: 'open-my', name: 'Open My Module', callback: () => this.activateView() });
    }

    async onunload(): Promise<void> { /* dispose widgets, etc. */ }

    async activateView(): Promise<void> {
        await this.openView(MY_VIEW_TYPE);
    }
}
```

### Dashboard widgets

Any module can contribute a dashboard widget from its `onload()` and must dispose it on
`onunload()`:

```ts
const dispose = this.plugin.registerDashboardWidget({
    id: 'my-module.summary',   // namespaced id — also groups it in the gallery
    title: 'My Summary',
    description: 'What this widget shows, in one line.',
    icon: 'sparkles',
    sizes: ['sm', 'md'],       // presets the user may pick
    defaultSize: 'sm',
    order: 50,                 // lower renders first
    component: MySummary,      // a React component…
    // …or a framework-agnostic DOM mount for plain-JS third-party modules:
    // mount: (el, ctx) => { el.setText('hi'); return () => {}; },
});
```

Press **Edit layout** on the dashboard to arrange it: drag cards (or focus one and use the
arrow keys), pick a size preset per card, and add or remove widgets from the gallery
underneath. The gallery lists the whole catalogue grouped by module, with a live preview of
each widget's footprint; widgets already placed stay listed and can be clicked to take them
back off.

**The grid itself is configurable** from the same edit mode — columns (2–6), row height,
gap, and how wide the whole canvas may get (a fixed width, or **Full** to run to the edges
of the pane).

Columns are the unit a widget's width is measured in. The `S`/`M`/`L` presets are
proportional (half the grid, full width, full width and double height), so on their own they
look the same at any column count; the **span stepper** next to them (`2/4`) sets an exact
width instead, and that's what more columns buy you — six columns fit three 2-wide cards in
a row where four fit two. Picking a preset again clears the manual span.

Changing the column count re-packs the layout in reading order, so widgets pair up in the
space that appeared rather than being pushed down. A manual span is kept as written and
merely clamped while the grid is narrower, so widening it again restores the intended width.
The grid falls back to a single column when the pane is narrow *or* when the chosen columns
would each be under 120px.

### Navigation buttons

The **Navigation** module renders a launcher on the dashboard: one button per registered
nav action. It owns the widget, not the buttons — every module contributes its own, so the
launcher lists exactly what is loaded, and a view that arrives with a third-party module
sits alongside Zenith's own:

```ts
const dispose = this.plugin.registerNavAction({
    id: 'my-module.view',      // namespaced id — also what the hide list stores
    label: 'My Module',        // or `labelKey` for a translated one
    description: 'What is behind this button.',
    icon: 'sparkles',
    order: 70,                 // lower comes first
    viewType: MY_VIEW_TYPE,    // reveal the open leaf, or open a tab…
    // …or, for a module with no view of its own:
    // onClick: ({ app }) => new MyModal(app).open(),
});
```

Clicking reveals the leaf that already shows the view rather than piling up duplicates —
buttons for views that are already open are marked with a dot. Ctrl/Cmd-click (or
middle-click) forces a new tab. **Settings → Navigation** switches between the grid and list
layouts, turns labels off for an icons-only launcher, and hides individual buttons; the hide
list is built from the registry, so third-party buttons are hideable too.

Registering is independent of the launcher being switched on, so a module never has to check
whether the Navigation module is active before offering a way into its view.

### Third-party modules

Built modules can be dropped into the plugin's `modules/<id>/` folder (each with a
`manifest.json` and a `main.js` exporting the module class). They are discovered on load
and appear under **Settings → Active Modules → Third-party**. Module ids are restricted to
`[A-Za-z0-9_-]` since they become a path segment. A manifest can also carry a
`translations` block so the module names itself in the reader's language before any of its
code has run — see [Language](#language).

## Custom icons

Anywhere Zenith takes an icon name — a content type, a journal tracker, a folder, a
dashboard widget, a module manifest — it accepts either a built-in (lucide) name or a
custom id of the form `zi:<source>/<name>`. There are two ways to supply one.

**Icon packs.** Put a folder of `.svg` files in the plugin's `icons/` folder:

```
icons/
  acme/
    pack.json     ← optional: { "name": "Acme Icons", "author": "Acme Inc" }
    logo.svg      → zi:acme/logo
    mark.svg      → zi:acme/mark
```

They appear at the top of every icon picker, above the built-in set. **Settings →
Appearance → Icon packs** lists what loaded, and — more usefully — names any file that was
rejected and why. Loose files rather than a manifest is deliberate: the common case is
unzipping something you downloaded.

**Module-supplied icons.** A module can bring its own artwork so its logo appears next to
its toggle. Drop `icon.svg` beside `main.js` and point the manifest at it:

```json
{ "id": "my-module", "name": "My Module", "icon": "icon.svg" }
```

An `icons/` folder inside the module works the same way (`icons/foo.svg` →
`zi:my-module/foo`). Neither needs any code. For artwork that is generated rather than
shipped, `zenith.registerIcon(name, svg)` returns the id to use, or `null` if the SVG was
rejected. Everything a module registers is removed when it is uninstalled.

**What is accepted.** SVG only — it inherits `currentColor` and stays sharp from 11px to
56px, which a PNG logo does neither of. Every file is sanitized before it is stored:
`<script>`, `<style>`, `<image>`, `<foreignObject>` and links are refused outright (with
the offending element named), `on*` handlers and external `href`s are stripped, and each
icon's internal `id`s are namespaced so two logos cannot fight over a shared
`<linearGradient id="a">`. Files are capped at 64 KB.

Note that this sanitizing is not a security boundary against a hostile *module* — module
code is evaluated with `new Function` and already has the whole app, exactly like any
Obsidian plugin. It is there for icon packs, which are just files a user copied in.

---

## Development

```bash
npm install        # install dependencies
npm run dev        # watch build → ../zenith/
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit
npm test           # run the vitest unit suite
npm run lint       # eslint
npm run format     # prettier --write
```

The build emits `main.js`, `styles.css`, `manifest.json` and `versions.json` into the
sibling `../zenith/` folder, which is the actual plugin Obsidian loads.

### Optional: Obsidian API lint rules

`eslint-plugin-obsidianmd` (flags deprecated Obsidian APIs) is installed but not enabled by
default — it expects a `manifest.json` at the project root and pulls in type-aware rules.
To use it, copy `manifest.source.json` to `manifest.json` and add its recommended config to
`eslint.config.mjs`.

### Versioning

Bump the version everywhere (manifest, `package.json`, `versions.json`) with:

```bash
npm run version-bump -- 0.2.0        # explicit version
npm run version-bump -- minor        # or a semver keyword: patch|minor|major
npm run version-bump -- 0.2.0 1.4.0  # also set a new minAppVersion
```

---

## Privacy

The Dashboard weather widget resolves your location either from an explicit **city**
(Settings → Weather) via Open-Meteo geocoding, or — when no city is set — from your
approximate location via a request to `ipapi.co`, falling back to the browser's geolocation
prompt. Weather data comes from Open-Meteo. No API keys are required and results are cached
locally.

---

## Setting up Dropbox

This build of Zenith ships with a Dropbox app registration, so there is nothing to set up
on Dropbox's side: skip to step 8, leave **Dropbox app key** empty, and press Connect.

Registering your own is worth it if you would rather have your own rate limits, your own
name on the consent screen, and no dependence on a registration you do not control. It
takes about two minutes — and note step 5: your own app needs the redirect URI added, or
authorization fails before it starts.

1. Open <https://www.dropbox.com/developers/apps> and choose **Create app**.
2. Pick **Scoped access**.
3. Pick the access type:
   - **App folder** — recommended. Zenith can only ever see `/Apps/<your app name>/`, so a
     mistake cannot reach the rest of your Dropbox.
   - **Full Dropbox** — only if the vault has to live somewhere that already exists.
4. Give it a name. Dropbox app names are globally unique, so `zenith-yourname` rather than
   `zenith`.
5. Under **OAuth 2 → Redirect URIs**, add `obsidian://zenith-dropbox` and press **Add**.
   This is what lets the browser hand the authorization straight back to Obsidian instead
   of making you copy a code — and unlike a `localhost` redirect it works on a phone too.
   Leave **Allow public clients (Implicit Grant & PKCE)** on **Allow**.
6. Go to the **Permissions** tab and tick all four of:

   | Scope | What Zenith does with it |
   | --- | --- |
   | `account_info.read` | Confirm the connection works, for the **Test** button |
   | `files.metadata.read` | List the folder and check a single file |
   | `files.content.read` | Download |
   | `files.content.write` | Upload and delete |

   Then press **Submit** at the bottom. It is easy to miss, and nothing is saved without it.
7. Back on the **Settings** tab, copy the **App key**. Not the App secret — Zenith
   authorizes with PKCE and never sends a secret, which is what lets it run on a phone.

Then in Obsidian, under **Settings → Zenith → Sync**:

8. Turn on **Sync note files** and choose **Dropbox** as the backend.
9. Paste the App key into **Dropbox app key**.
10. Set **Folder in the account** — with App-folder access this is relative to
   `/Apps/<your app name>/`. Leave it empty to use that folder directly. If you are
   turning on encryption, this has to be a folder with nothing in it.
11. Press **Connect**. Dropbox opens in your browser; approve the app and it returns you
    to Obsidian on its own. If it does not — some desktops hand custom links nowhere — use
    **The browser did not bring me back**, which starts the flow again with the code shown
    on screen for you to copy.
12. Press **Test connection**, then **Preview** — and read the plan before applying it. The
    first run always asks, whatever it contains.

### Why a client id can ship at all

An OAuth `client_id` is not a secret. RFC 8252 starts from the position that a native app
cannot keep one, and PKCE exists so a published id is still safe to authorize against: the
code it yields is useless without a verifier that never leaves the device. Every desktop
application talking to these providers has its id in the binary.

What a shared registration costs is shared fate — provider limits apply partly per app, a
registration can be throttled, and a development-status Dropbox app is capped on linked
accounts until it has been through review. That is what the override is for.

### If it does not work

**"This Dropbox app is not allowed to …"** — a permission is missing. Add it in the
Permissions tab, press Submit, then **Disconnect and Connect again** in Zenith: an
authorization already granted does not pick up permissions added afterwards. This is the
single most common way to get stuck.

**"Dropbox rejected the connection — authorize again"** — the stored token is dead.
Disconnect and connect again.

**The browser shows an error about the redirect URI.** `obsidian://zenith-dropbox` is
missing from the app's Redirect URIs, or was typed differently — Dropbox compares it
exactly. Add it, or use **The browser did not bring me back** to authorize by copying the
code instead.

**The app is in "Development" status.** That is fine and needs no application: development
apps work fully, for up to 500 linked accounts. Only publishing to other people needs
production status.

**Sync feels slow, or a lot of files fail.** Lower **Parallel transfers**. Zenith already
waits out Dropbox's rate limiting rather than failing the file, but fewer transfers at
once means it has less to wait out.

---

## Encrypted sync

Turn on **Settings → Sync → Encrypt everything before it is uploaded** and Zenith
encrypts file contents *and* filenames before anything leaves the device. The server —
Dropbox, OneDrive, S3 or WebDAV — holds ciphertext under unreadable names and never sees
the password.

Encrypted sync needs a folder of its own. Encrypted and plain files cannot share one, so
pointing it at a folder that already holds notes is refused rather than mixed into.

**Losing the password loses the notes.** There is no copy of it on the server; that is the
whole point. It sits in `data.json` in plain text like every other credential here —
Obsidian offers plugins no keychain — so back it up the way you back up anything else you
cannot regenerate.

### The format

Documented so that the vault is never hostage to this plugin: everything below can be
re-implemented in a short script against any standard crypto library.

A file called `.zenith-crypt.json` sits at the root of the remote folder, unencrypted. It
holds no secret — only the KDF parameters, the salt, and a check value:

```json
{
  "version": 1,
  "iterations": 600000,
  "salt": "<16 random bytes, base64>",
  "check": "<32 bytes, base64>"
}
```

Keys are derived once per remote, not once per file:

```
root        = PBKDF2-HMAC-SHA256(password, salt, iterations)          → 32 bytes
contentKey  = HKDF-SHA256(root, info = "zenith/sync/content/v1")      → 32 bytes
nameKey     = HKDF-SHA256(root, info = "zenith/sync/name/v1")         → 32 bytes
nameNonce   = HKDF-SHA256(root, info = "zenith/sync/name-nonce/v1")   → 32 bytes
check       = HKDF-SHA256(root, info = "zenith/sync/check/v1")        → 32 bytes
```

HKDF is used with an empty salt. `check` is compared against the marker's, which is how a
mistyped password is caught before anything is uploaded rather than weeks later.

**File contents** are AES-256-GCM with a random nonce, and the file's own vault path as
additional authenticated data — so the same bytes filed at another path do not decrypt:

```
bytes 0..3    magic, ASCII "ZNC1"
byte  4       format version, 1
byte  5       algorithm, 1 = AES-256-GCM
bytes 6..17   nonce, 12 bytes
bytes 18..    ciphertext, with the 16-byte tag at the end
```

The overhead is a fixed 34 bytes, which is deliberate: it lets the plugin work out a file's
decrypted size from its encrypted size without downloading it, and the sync plan compares
sizes to decide whether two copies are the same file.

**Paths** are encrypted one segment at a time, so the folder tree survives and names stay
short. Each segment is AES-256-GCM over the segment text, with the plaintext parent path as
additional authenticated data, and a *deterministic* nonce — the first 12 bytes of
`HMAC-SHA256(nameNonce, full plaintext path down to this segment)`. Determinism is what
makes two devices agree on a name instead of each uploading its own copy. The nonce is
stored in front of the ciphertext because decryption cannot recompute it, and the whole
thing is [RFC 4648 base32](https://www.rfc-editor.org/rfc/rfc4648), lower-case and
unpadded:

```
segment = base32( nonce[12] || AES-256-GCM(nameKey, nonce, segment, aad = parent path) )
```

Base32 rather than base64 because Dropbox compares paths case-insensitively, and two names
differing only in case would silently collide.

### What the server still learns

Not the contents, and not the names. It does see how many files there are, roughly how large
each one is, when each was written, and the shape of the folder tree. Hiding those needs
padding and decoy traffic, which cost real bandwidth and would make the size comparison
above impossible — this stops where Remotely Save and rclone stop, for the same reasons.

---

## License

[MIT](LICENSE) © Saifun
