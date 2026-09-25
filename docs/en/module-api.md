# Module API

[← Documentation](../../README.md) · **English** · [Русский](../ru/module-api.md)

A module implements `IModule` (see [`src/core/IModule.ts`](../../src/core/IModule.ts)). The
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

## Dashboard widgets

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

## Navigation buttons

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

The same buttons are listed in the [side panel](side-panel.md). Once the user drags them into an
order of their own, that order wins over `order` in both places; a button registered later
comes after the ones they arranged.

Registering is independent of the launcher being switched on, so a module never has to check
whether the Navigation module is active before offering a way into its view.

## Search

The **Search** panel lists what each module gives it. A module adds a source from its
`onload()`; like a nav action, it is disposed on unload, and registering does not depend on
Search being switched on:

```ts
const dispose = this.plugin.registerSearchSource({
    id: 'my-module',
    label: 'My things',          // the group's heading, or `labelKey`
    icon: 'sparkles',            // for rows without their own
    order: 70,                   // where the group goes among equal matches
    // Everything it can offer, read when the panel opens.
    items: () => myThings().map((thing) => ({
        id: `my-module:${thing.id}`, // stable: "recently picked" is remembered by it
        title: thing.name,
        aliases: [thing.otherName], // found by these too
        tags: thing.tags,           // without `#`
        detail: thing.status,       // a few words on the right
        run: () => openThing(thing),               // Enter
        complete: () => finish(thing),             // Ctrl/Cmd+Enter or ✓; the panel stays
        reveal: () => openNote(thing),             // Alt+Enter
    })),
    // Rows the query itself calls for, like a date's note.
    suggest: (query) => [],
    // Creating from the line: "thing Name" → a row that makes "Name".
    creators: () => [
        {
            keywords: ['thing', 'штука'],
            row: (text) => ({ title: text, label: 'New thing', run: () => makeThing(text) }),
        },
    ],
});
```

Your commands are listed under *Actions* without this, while your module is on. To name one
in Zenith's language, add `module.<your id>.command.<command id>` to your translations; it is
then found by that name and by the English one.

## Third-party modules

Built modules can be dropped into the plugin's `modules/<id>/` folder (each with a
`manifest.json` and a `main.js` exporting the module class). They are discovered on load
and appear under **Settings → Active Modules → Third-party**. Module ids are restricted to
`[A-Za-z0-9_-]` since they become a path segment. A manifest can also carry a
`translations` block so the module names itself in the reader's language before any of its
code has run — see [Language](language.md).

## API version 2: reaching into Zenith's own modules

`zenith.apiVersion` is **2**. Version 1 modules keep working unchanged. A module becomes
version 2 by declaring what it will do in its manifest:

```json
{
    "id": "due-badges",
    "name": "Due badges",
    "apiVersion": 2,
    "permissions": ["tasks:read", "ui:slots", "features"]
}
```

### Permissions

| Permission | What it opens |
| --- | --- |
| `tasks:read` | `zenith.tasks.list()`, task actions and filters, `task:*` events |
| `tasks:write` | `zenith.tasks.setStatus(task, status)`, `zenith.tasks.update(task, patch)` |
| `journal:read` | `zenith.journal.entries()`, `journal:recorded` events |
| `journal:write` | `zenith.journal.record(date, patch)` |
| `content:read` / `content:write` | `zenith.content.list()` / `setStatus`, `setProgress` |
| `content:metadata` | `zenith.content.registerMetadataProvider(...)` |
| `calendar:layers` | `zenith.calendar.registerLayer(...)` |
| `prayer:provider` | `zenith.prayer.registerProvider(...)` |
| `ui:slots` | `zenith.ui.registerSlot(...)`, `zenith.ui.replace(...)` |
| `settings:<module>` | `zenith.settingsPages.addSection('<module>', ...)` |
| `features` | `zenith.features.register(...)` |
| `network:<host>` | `zenith.network.request(url)` to exactly that host |

An unknown permission makes the manifest invalid — a typo must not pass for nothing. The
consent dialog lists the permissions in plain words; a module whose list changes on update
is asked about again. Calling something without its permission throws a
`ZenithPermissionError` that names the permission to add. A version-2 module has no
`zenith.store`: the whole store is exactly what permissions divide up.

### Extension points

- **Slots** — named places in built-in views: `tasks.item.afterTitle`,
  `journal.day.afterTrackers`, `prayer.day.afterList`. Register a React `component` or a
  DOM `mount(el, props)` (return a cleanup function if you need one).
- **Replaceable pieces** — `journal.day.prompt` (the question of the day in the daily
  note): draw it your way; if yours throws, Zenith's comes back.
- **Tasks** — `registerAction({ id, label, icon, when, run })` adds to a task's *More — from
  modules* menu; `registerFilter({ id, label, test })` to the filter popover. Writes go
  through Zenith's task writer, which changes a line only if it still says what the
  module was shown.
- **Journal** — `record(date, { key: value })` writes frontmatter through
  `processFrontMatter`, creating the day's note if needed; `null` removes a key.
- **Calendar** — `registerLayer({ id, label, color, events(from, to) })`: read-only events
  in a strip above the grid — another calendar, a timetable.
- **Content** — `registerMetadataProvider({ id, label, types, search(query, typeId) })`:
  a *Fill from …* button under the title in the new-item form. Zenith itself looks nothing
  up; this is the only way autofill comes back, with the module's own `network:` host.
- **Prayer** — `registerProvider({ id, label, year(year, place) })` returns a year of
  `HH:MM` times by date; it appears as *Timetable from* in the prayer settings and is
  cached and refreshed like Aladhan's.
- **Settings** — `addSection('<module>', { id, title, component | mount })` adds a section
  to a built-in module's page; `features.register({ name, label, description, default })`
  adds a switch of your own, saved into profiles.
- **Events** — `zenith.events.on('task:created' | 'task:completed' | 'journal:recorded',
  handler)`. Read-only, derived from the notes — a task ticked in the editor or on another
  device counts too. A task is "the same" when its note and title are.

Every registration is taken back when the module unloads. See `modules_def/due-badges` for
a module that uses a slot, a task action, an event and a feature switch.

### Safety — and what it is not

- **Isolation, not a sandbox.** Module code is evaluated with `new Function`: it cannot see
  Zenith's internals, but it has `window`, `app` and the vault like any Obsidian plugin.
  Permissions are a contract and a help when reviewing code — the real protection is your
  consent, the pinned hash and source you can read.
- **Pinned code.** Approval is tied to the SHA-256 of `main.js` (it was a 32-bit FNV
  checksum, which is easy to collide; modules approved under it are asked about once more).
  A changed file, or a changed permission list, needs approving again.
- **Boundaries.** Every extension runs inside an error boundary: a failing piece disappears
  from its spot (a replacement falls back to Zenith's own). Three failures in a session and
  the module is switched off, with a notice.
- **Activity.** Writes a module makes through the API are logged under it in *Settings →
  Modules* (*Permissions and activity*), on this device, the last 200.
- **Safe mode.** *Settings → Modules → Safe mode*, or the command *Toggle safe mode*: no
  third-party module runs on this device; they stay installed and enabled.
