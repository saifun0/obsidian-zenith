# Journal

[← Documentation](../../README.md) · **English** · [Русский](../ru/journal.md)

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

**Goals beyond "every day"** (*Journal → Features → Weekly goals and limits*):

- **Days a week.** "Exercise, 3 days a week": a week is kept when the goal is met on that
  many of its days, whichever they are. The habit month shows this week as `2/3`, and the
  statistics count kept weeks in a row. A week not yet over is never a broken one.
- **At most.** A number or scale target can be a limit — "coffee, 2 at most". A day is kept
  by staying under it, zero included; going over is a miss, not a partial day.
- **Rest days.** Write `rest` (or `отдых`) as a tracker's value — `sport: rest` — and that day
  neither breaks a streak nor adds to it: a planned day off is not a lapse.
- **Changing a goal does not rewrite the past.** The old goal is kept for the days before
  today, so raising "3 a week" to 5 does not turn last month's good weeks into failures.

**Habits to quit** (*Journal → Features → Habits to quit*): set a check-box or number
tracker's **Habit** to *To quit*, and a day counts when it is **recorded** and the habit is
not — no tick, a count of zero. Only recorded days count at all, and the figure says so:
*12 of 15 recorded days without smoking*, never "15 days without", because a day nobody
wrote about is not a day without it.

## In the note itself

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

**The year in pixels** (*Journal → Features → Year in pixels*): the button beside the
month's arrows turns the calendar into the whole year — twelve rows of squares, one a day,
coloured by the mood or any other tracker you pick. The same day of every month lines up
in a column, so a season reads as a band. A day with nothing recorded stays grey rather
than taking the colour of a bad one, and a click selects the day as the month does.

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

**Question of the day** (*Journal → Features → Question of the day*, off by default): one
question a day, the same on every device, shown under the check-in block; the arrow beside it
writes it into the note under *Notes* as a quote to answer beneath — only when you click.
A template can carry it too, as `{{prompt}}`. The questions come from a note of your own —
one a line, set under **Questions** — or, with none set, from a small built-in set in the
interface language, kept neutral on purpose. No streaks: the point is the writing.

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

## Morning and evening rituals

*Journal → Features → Morning and evening rituals.* Two short looks at the day, opened
with the commands **Morning ritual** and **Evening review**, from the **Ritual** card on the
dashboard (it shows whichever fits the hour, and the day's main task once chosen), or from a
reminder — which is **off** until you switch it on under *Settings → Journal → Rituals*
(08:00 and 21:00 unless changed).

- **Morning:** today's tasks — due or planned today, or written into today's note — each
  with a tick and a star to mark **the main thing** (kept in the day's note as
  `focus: …`), then what is left over from before.
- **Evening:** what got done today; what did not — today's and earlier days' open tasks —
  each **Today**, **Tomorrow** or **Drop**; and one line **for tomorrow**, written into
  today's note.

Moving a task sets its ⏳ date **in its own line**: nothing is cut out of one note and pasted
into another. Every step can be switched off in the same settings, and any step can simply
be skipped. There are no streaks for rituals.
