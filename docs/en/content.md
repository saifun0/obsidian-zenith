# Content

[← Documentation](../../README.md) · **English** · [Русский](../ru/content.md)

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
