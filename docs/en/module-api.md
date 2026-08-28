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

Registering is independent of the launcher being switched on, so a module never has to check
whether the Navigation module is active before offering a way into its view.

## Third-party modules

Built modules can be dropped into the plugin's `modules/<id>/` folder (each with a
`manifest.json` and a `main.js` exporting the module class). They are discovered on load
and appear under **Settings → Active Modules → Third-party**. Module ids are restricted to
`[A-Za-z0-9_-]` since they become a path segment. A manifest can also carry a
`translations` block so the module names itself in the reader's language before any of its
code has run — see [Language](language.md).
