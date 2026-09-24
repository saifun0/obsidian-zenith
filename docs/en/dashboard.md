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
