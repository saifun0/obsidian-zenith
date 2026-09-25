# Module API

[← Documentation](../../README.md) · **English** · [Русский](../ru/module-api.md)

Every Zenith module ships inside the plugin: it lives in `src/modules/<id>/` and is
registered in `src/main.ts`. Zenith runs no code from anywhere else; third-party modules were
removed in 0.2.5.

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
    component: MySummary,      // a React component
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
launcher lists exactly what is loaded:

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
list is built from the registry, so it always matches what is loaded.

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
