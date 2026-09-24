# Content

[← Documentation](../../README.md) · **English** · [Русский](../ru/content.md)

Content items are `.md` files in the configured **Content folder**, described entirely by
YAML frontmatter (the note body becomes a short description preview):

```markdown
---
title: "The Great Gatsby"
type: book        # any configured type: book | movie | show | anime | manga | game | music | other
status: completed # backlog | in-progress | completed | dropped
rating: 8         # your score, 0–10 (half stars in the UI, so odd values are reachable)
cover: "covers/gatsby.jpg"   # vault path or https URL
year: 1925
creator: "F. Scott Fitzgerald"
genres: [fiction, classic]
progress: 88      # units done — pages, episodes, chapters…
progressTotal: 218
started: 2026-01-04          # stamped when the status becomes "in progress"
finished: 2026-02-11         # stamped when it becomes "completed"
tags: [favourite]
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
say). The item's card lists every reading, and the statistics count what was read more than
once. Sending an item back to the backlog drops the reading that had begun, not the history.

## Working with the library

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

## Importing an existing library

**Content → Import** reads an export file from **MyAnimeList** (XML), **Goodreads** (CSV)
or **Letterboxd** (CSV). The format is recognised from the file's own contents, and the
dialog previews what will land — count per type, a sample of the entries, and how many rows
were unusable — before anything is written.

Titles, scores (rescaled from 5 stars where needed), statuses, progress and the services'
own start/finish dates all come across. Existing titles are skipped by default, so
re-importing an updated export tops the library up instead of doubling it. Covers and
synopses aren't part of these exports, and nothing is fetched to fill them in. The services'
own ids and links stay behind too — an imported item doesn't point back at where it came
from.

**Progress** is two numbers, so the UI can draw a bar, offer −/+ steppers and a "+1"
straight from the dashboard widget. Reaching the total marks the item **completed**;
starting a backlog item moves it to **in progress**. Older free-text values
(`progress: "Ep 5/12"`, `"p. 120"`, `"45%"`) are still parsed and are rewritten to the
numeric form on the first edit. What one unit is called comes from the type
(`progressUnit`: pages, episodes, chapters …) and is editable in settings.

The **statistics** view goes beyond totals: what you finished in the last 30 days, how long
things take you end to end, the average progress of everything in flight, your most common
genres, additions per month, and a "gone quiet" list — items still marked in progress whose
note hasn't been touched in over a month.

"Finished recently" and "days to finish" read the item's own `finished` / `started` dates.
Notes predating those dates fall back to the file's modification time, which is only a
proxy — it moves whenever the note is edited at all — so the fallback is used and never
preferred. "Gone quiet" is the one figure mtime is genuinely right for: the question there
*is* when the note was last touched.
