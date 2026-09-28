# Content

[← Documentation](../../README.md) · **English** · [Русский](../ru/content.md)

Content items are `.md` files in the configured **Content folder**, described entirely by
YAML frontmatter (the note body becomes a short description preview):

```markdown
---
title: "The Great Gatsby"
type: book        # any configured type: book | movie | show | anime | manga | game | music | other
status: completed # backlog | in-progress | on-hold | completed | dropped
rating: 8         # your score, 0–10 (half stars in the UI, so odd values are reachable)
favorite: true    # left out when it is not one
cover: "covers/gatsby.jpg"   # vault path or https URL
year: 1925
creator: "F. Scott Fitzgerald"
genres: [fiction, classic]
progress: 88      # units done — pages, episodes, chapters…
progressTotal: 218
started: 2026-01-04          # stamped when the status becomes "in progress"
finished: 2026-02-11         # stamped when it becomes "completed"
aliases:                     # other names; Obsidian's own key, so links find them too
  - Gatsby
series: "Jazz Age"           # the series it is a part of — see Series below
seriesOrder: 2               # its place in the series, when set
tags: [classics]
---

Optional notes / description…
```

`status` and the progress numbers are reconciled on read: a note that says `backlog` while
recording 5 of 12 pages is shown as *in progress*, and one whose progress has reached its
total is shown as *completed*. The file itself isn't rewritten until something else edits it.

**Everything is yours to fill in.** Nothing is looked up online: the library holds what
you write and nothing else. A cover is either a picture in the vault — **From vault** in the
add form lists them — or a link you paste yourself. A linked cover is loaded from that
address each time it is shown and never downloaded into the vault, so it needs a connection
and disappears if the site removes it; a picture in the vault always works.

Notes written by earlier versions may carry `externalRating`, `source` and `sourceId` —
what the online auto-fill used to record. They are no longer read, and they are never
removed: editing the item leaves them in the file exactly as they were.

An item's detail view can **delete** it — the note goes to your vault's trash, honouring
your "deleted files" preference.

## Types

*Settings → Content → Types* lists the kinds of things the library holds. The **eye** beside
each one shows or hides it. A hidden type leaves the type filter, the add form, the
statistics, the dashboard widget and search; its notes stay in the vault untouched, and
showing the type again brings them all back.

A new install starts with books, films, anime and manga shown, and shows, games, music and
other hidden. An existing setup keeps every type it had, visible.

The built-in types speak the interface's language — "Книга", "страниц" — for as long as
their names are the ones they shipped with. Rename one and it keeps your words.

## Statuses

Five: **Planned**, **In progress**, **On hold**, **Completed**, **Dropped**. The two that are
verbs take the type's own: a book is *Reading* and *Read*, anime and films are *Watching*
and *Watched*, a game is *Playing* and *Finished*, music is *Listening* and *Listened*.
Where types are mixed — the statistics, a list of everything — the general words are used.
A type you made yourself has no verb of its own and keeps the general ones too.

**On hold** is a pause you meant: it keeps its `started` date and its progress, but it is
not on the *Continue* shelf, has no "+1", and is never counted as gone quiet.

**Started / finished dates** are stamped on the status transitions that cause them:
beginning something records `started` (a re-read keeps the original), finishing it records
`finished`, and sending it back to the backlog clears both. Completion deliberately does
*not* backfill a start date — guessing "today" would report an imported backlog as read in
a single day.

**Re-reads** (*Content → Features → Re-reads*). Starting a finished item again keeps the
reading before it: the note gains a list of every reading, the last one open until you
finish it —

```yaml
readings: ["2019-03-01/2019-03-20", "2026-08-02/"]
```

— written only once an item is read a second time; a book read once keeps just its two
dates. `started` stays the first start and `finished` the last finish. Each reading counts
for itself: the average reading time is taken over readings, so a book read again seven
years later is two readings of a few weeks, not one of seven years (which is what it used to
say). The item's card lists every reading. Sending an item back to the backlog drops the
reading that had begun, not the history.

**Yearly challenge** (*Content → Features → Yearly challenge*). Set how many of each type to
finish this year under *Settings → Content → Goals for 2026* — "24 books". The statistics and
a **Challenge** card on the dashboard show each goal as done / target, and whether the pace
keeps up: *3 behind pace*, *on pace*, *2 ahead* — in whole items, since half a book behind is
not behind. What counts is a reading finished in the year; with **Count re-reads** off, only
what is finished for the first time. Each year's goals stay with that year.

## Favourites

The **heart** marks a favourite: on a line of the list, on a poster, in the add form and in
the item's card. Tapping it switches it; the right-click menu does the same. The heart
button in the toolbar shows favourites only. A favourite is only a mark — it doesn't move
an item up the list or into the widget.

On a phone an empty heart isn't drawn on every line, so the titles keep their room; the
long-press menu and the item's card make a favourite there.

## Working with the library

The library opens as a **list**, grouped by status in the order it is lived in: *In
progress*, *On hold*, *Planned*, *Completed*, *Dropped*. The first two start open; whichever
you open or close stays that way on this device. Choosing one status in the filter drops the
groups and shows that status alone. The **grid** button beside the sort swaps the list for
posters, and the choice is remembered per device. Only the grid has the *Continue* shelf —
one row that scrolls sideways — since the list's first group is the same items.

There is one sort, *Recently updated* by default; its arrow reverses it.

Every line and every poster is a control. **Right-click** (long-press on a phone) for a
menu: set the status, ±1 unit of progress, favourite, open the card or the note, delete.
Something in progress shows a **"+1"**, so marking an episode watched never means opening
anything. An item that hasn't been started shows its length ("13 ep") rather than a progress
bar pinned at zero.

The toolbar's **select button** turns the library into a multi-select: pick any number of
items — the *Continue* shelf included — then set one status across all of them or delete
them together.

**Genres are filters.** Click one in an item's card or in the statistics view and the
library narrows to it; the active genre appears as a removable chip beside the result count.

## Series

The seasons, films and spin-offs of one thing belong together: *Sword Art Online* is one
title with eleven parts, each named differently. A **series** is the name every part carries
in its `series` key — nothing else, so it reads in Dataview and survives any edit made
outside Zenith. *Content → Features → Series* switches it off.

**In the list**, the parts of one series in the same status section fold into one line — its
cover or type mark with the edges of the others behind it, the name, "8 parts · Anime". The
arrow unfolds the parts in place, each an ordinary line with its "+1" and heart; inside a
series a part is listed by what sets it apart ("TV-2", "Alicization"), not by the name all of
them repeat. A series with parts in several statuses shows in each section with the parts of
that status, so every section stays true. One part alone is an ordinary line. A search opens
the series it found parts in. **In the grid** a series is one stacked poster with "×11" on it.

**Tapping the name** opens the series' own page: how far through it is ("Watched 8 of 11")
with a bar of its statuses, and every part in order. **Edit** turns the same page into its
workbench: rename it, drag the parts into order, take one out, add one from the library or a
new one, or ungroup it all — the parts stay in the library, each on its own.

Parts are ordered by `seriesOrder` when it is set (dragging sets it; Goodreads' "#3" does too),
then by year, then by title: the name itself, the numbered sequels in number order, then the
subtitled ones.

**Putting things in a series:**

- the **Series** field under *More* in the add form, offering the series there are;
- **Put in a series…** in an item's card, and in the right-click menu (which can also take it
  out);
- in select mode, pick several and **Put in a series…** — the name offered is what their titles
  share. Tapping a series line in select mode picks all its parts.

**Find series** (the layers button in the header, or the command palette) looks for series
nobody has named yet: a title that continues another title — "X 2", "X ТВ-2", "X: Film",
"X. Part 2" — goes under it, matching on aliases as well, so an original name helps where the
translated ones differ. Only a whole title counts, so *Monster* never swallows *Monster
Hunter*; a part of a part goes to the outermost series; an item already in a series is never
moved. You see the list first — untick what is wrong, rename what you like — and nothing is
written until you confirm.

## Adding an item

The add form asks for what matters first: the type (only the shown ones), the title with its
heart, and the status. Progress appears for something in progress or on hold, the score for
something completed or dropped. Cover, year, creator, genres, tags and a description are
under **More**. Editing an existing item happens in its card.

## Importing an existing library

**Content → Import** reads an export file from **MyAnimeList** (XML), **Goodreads** (CSV),
**Letterboxd** (CSV) or **Anixart** (CSV bookmarks). The format is recognised from the
file's own contents, and nothing is written until you have seen what the file would do.

Titles, scores (rescaled from 5 stars where needed), statuses, progress and the services'
own start/finish dates all come across. Covers and synopses aren't part of these exports,
and nothing is fetched to fill them in. The services' own ids and links stay behind too — an
imported item doesn't point back at where it came from.

**Anixart** bookmarks are all anime. The Russian name becomes the title; the original and
alternative names become `aliases`. Its *Смотрю*, *В планах*, *Просмотрено* and *Отложено*
become *In progress*, *Planned*, *Completed* and *On hold*, *Не смотрю* becomes *Dropped*, and
a bookmark added to favourites becomes a favourite. The export has no dates, scores or episode counts, so none
are written.

**Goodreads** writes a book's series into its title — "The Name of the Wind (The Kingkiller
Chronicle, #1)". The title comes across as the book's own, with the series and its number
taken out of it. A book imported that way by an earlier version is still recognised.

With series on, the dialog offers **Group parts into series** (ticked): the series the export
names, and the ones its titles show — among the new entries and with the library, so a new
"X 3" joins the "X" you already have. Series made only of items already in the library are
left to *Find series*.

**A second import brings the library up to date.** The dialog sorts the file into three:

- **New** — not in the library yet; these are created.
- **Moved on in the export** — already in the library, but the export has another status
  (or, from Anixart, another favourite mark). Each can be unticked. One that goes
  *backwards* — watched in the library, planned in the export — starts unticked, since the
  library is the likelier to be right.
- **Already so** — just counted.

An item is recognised by any of its names: its title or any alias, against any name in the
export. An update writes the status and the favourite mark and nothing else: your score,
progress and notes are never touched, and no date is stamped — the export can't say when
the change happened.

**Progress** is two numbers, so the UI can draw a bar, offer −/+ steppers and a "+1"
straight from the dashboard widget. Reaching the total marks the item **completed**;
starting a backlog item moves it to **in progress**. Older free-text values
(`progress: "Ep 5/12"`, `"p. 120"`, `"45%"`) are still parsed and are rewritten to the
numeric form on the first edit. What one unit is called comes from the type
(`progressUnit`: pages, episodes, chapters …) and is editable in settings.

## Statistics

Four figures across the top: everything in the library, what was finished in the last 30
days, the average score, and what is in progress. Below them the statuses as one bar, the
types as bars of their own, and **Finished by month** — the last twelve months, with their
total and how many days a finish takes on average. Then the "gone quiet" list — items
still in progress whose note hasn't been touched in over a month — and your most common
genres.

"Finished" reads the item's own `finished` date and nothing else. A note without one isn't
counted as finished in any month: the file's modification time moves with every edit, and an
import would otherwise show a whole library as finished today. "Gone quiet" is the one figure
the modification time is right for: the question there *is* when the note was last touched.
