# Side panel

[← Documentation](../../README.md) · **English** · [Русский](../ru/side-panel.md)

A tab in Obsidian's right sidebar with Zenith in it: buttons for the commands you run often,
and Zenith's views under them. It comes with the **Navigation** module.

## Opening it

Zenith puts the panel in the right sidebar the first time it runs with it. After that it stays
where you leave it: drag its tab somewhere else, or close it. The command *Zenith: Open the side
panel*, or *Settings → Navigation → Side panel → Open*, brings it back.

On a phone the right sidebar is a drawer, pulled in from the right edge. It closes by itself
once you tap something in it.

## What is in it

- **Buttons.** Each one runs a command, and any command Obsidian has can be one: Zenith's,
  Obsidian's own or another plugin's. The panel starts with *New task*, *Search*, *Mark prayer* and
  *Sync notes*: Zenith's commands go by a short name on a button, and their full one in the
  palette. A button whose Zenith module is switched off is
  hidden until the module is on again.
- **Views.** Every Zenith view: the list the dashboard's Navigation card shows. The one you are
  in is marked. Ctrl/Cmd-click or middle-click opens a view in a new tab.

A command that works on the current note runs on the note you were in before you clicked the
panel.

## Arranging it

The pencil at the top turns both lists into rows to arrange. The tick puts the panel back.

- **Order.** Drag a row by its handle. From the keyboard, focus the handle and press ↑ or ↓.
- **Buttons.** *Add a command* finds one by name. Click a button's icon to pick another.
  Type in its name field to rename it; left empty, it takes the command's own name. The ×
  removes it.
- **Views.** The eye hides a view, and shows it again.

The order of the views and the hidden ones are the same in the dashboard's Navigation card:
one list, shown in two places. The lists travel to your other devices with sync. A button for
another plugin's command shows only where that plugin is installed.

*Settings → Navigation → Side panel → Default buttons* puts back the four it started with.

## For module authors

A view registered with `registerNavAction` appears in the panel as it does in the launcher. See
[Navigation buttons](module-api.md#navigation-buttons) in the module API.
