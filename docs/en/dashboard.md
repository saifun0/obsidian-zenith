# Dashboard

[← Documentation](../../README.md) · **English** · [Русский](../ru/dashboard.md)

The dashboard is a board of cards. Most of them belong to a module — tasks, the journal,
prayer — and appear with it; this page is about the ones the dashboard brings itself, and
about how it opens.

## Opening on startup

*Dashboard → Open on startup*, on by default. When Obsidian starts, the dashboard is shown:
the tab restored from last time if there is one — never a second copy — and otherwise a new
tab, or the empty one Obsidian opened. Switching the module on later, or reloading the
plugin, is not a startup and opens nothing.

With the **Homepage** plugin on, the switch is replaced by a line saying so: that plugin
decides what opens first, and two plugins racing to open their page would each win some of
the time. To start on the dashboard, add the *Zenith: Open Dashboard* command in
Homepage's settings.

On a phone, the board first draws its cards — headers, sizes, the shape of the board — and
fills them in once the app has finished starting, so opening it does not make a slow start
slower.

## The board and its cards

The board is as wide as its pane, up to 1200px by default (*Grid → Canvas* changes that, up
to the full width). Its buttons stand at the board's own right edge: saved layouts,
arranging, and the bell once there is something in the notification center. On a narrow
pane and on a phone they lie in a row above the board.

**A card's back.** Press **⋯** at the end of a card's header — or right-click the header,
or press and hold it on a phone — and the card turns over. On the back is everything that
sets the card up: the widget's own settings, its size (preset, width, height), **Remove
from dashboard**, and **Module settings**, which opens the page where the rest of what the
card shows is decided — the place the weather is for, which prayers are counted. A card the
board may hold several of (text, links, picture, countdowns, quick note, timer) also has a
**Name** there, so three texts are not three cards called *Text*. Esc, or the arrow in the
back's corner, turns it back.

**Height.** A card of lines — tasks, links, recent notes, countdowns, text — is only as tall
as what is in it: three tasks do not hold four rows of the board. The height you give such
a card is the most it may take, and it grows back into it as it fills. On a phone it is
exactly as tall as its content. *Fit to content* on the card's back switches this off for
a card you want held at its height; turned over, a card stands at that full height, so the
height being set is the one on screen. Bundles keep their height.

**Arranging.** The grid button puts the board in arrange mode: drag a card to move it, hold
it over another to bundle them, tap it to turn it over. **+** opens a panel beside the
board with three sections:

- **Widgets** — every widget, by module, with search. Adding one scrolls to it and marks it
  for a moment.
- **Grid** — columns, row height, gap and the board's width.
- **Layouts** — saved boards: apply, save, rename, delete.

The panel opens between the board and its buttons. The board is never squeezed for it: it
keeps its width and moves over, and only where the pane has no room for both does the
panel lie over the board's right-hand edge. On a narrow pane and on a phone it comes up
from the bottom instead.

**Bundles.** Several widgets in one cell. The header shows their icons, the one on top lit;
tap an icon — or swipe, or use the arrow keys — to switch. **⋯** at the end turns the card
over to the settings of the widget on top. The same icons stand in the back's header: tap
another and the back is that widget's, so a widget is set up where it is, without being
taken out of the bundle first. Below come the bundle's own settings — its size, its name,
the order of its widgets, and taking one out.

The data keeps itself current. *Zenith: Refresh data* in the command palette reloads it by
hand.

To see every widget at every size it offers without resizing cards on the board, open
*Settings → About → Debug tools → Widgets*: each one in the board's own card, on your own
data, drawn for the board or for a phone's column.

## Progress

*Dashboard → Period progress.* How far through the day, week, month and year you are: a bar
and a percentage each. What is left ("98 days left") is in each row's title. On the back of
the card, **Hijri month** adds the month by the moon under the year — in Ramadan, Ramadan's
progress. The week starts on the day set in the journal (*Week starts on*); the Hijri month
follows the prayer module's calendar and its offset.

## Countdowns

*Dashboard → Countdowns.* Days until what is coming, soonest first, one line each:

- **your own dates**, added on the back of the card — a trip, an exam; mark one **Yearly**
  and it comes round every year (a birthday on 29 February falls on the 28th in other
  years);
- **tasks** with a 📅 date and the tag `#countdown` (the tag is set on the back of the card —
  a vault has hundreds of dated tasks, and a countdown to each would be the task list
  again);
- **projects** still under way, by their `targetDate`;
- **Ramadan and Eid** — the start of Ramadan, Eid al-Fitr, the day of Arafah and Eid
  al-Adha, by the same calendar the prayer view uses. On by default when the prayer module
  is on.

A row that comes from a note opens it. The card can be placed more than once, each copy with
its own dates and sources — work and family, say.

## Life in weeks

*Dashboard → Life in weeks.* Your life as a grid: a column for each year, fifty-two weeks down
it, the weeks lived filled in. It needs your **birth date** and how many **years** the grid
spans (80 by default), both on the dashboard's settings page once the feature is on.

It is off by default and **only you can switch it on**: no template does, not even
"Everything", and applying one leaves it as you set it. The birth date stays in this
vault's settings (and on your devices, if they sync) — it is never put in a profile.
