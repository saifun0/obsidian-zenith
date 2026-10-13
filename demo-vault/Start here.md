---
tags: [zenith, demo]
---

# Zenith demo vault

A vault set up to show everything Zenith does. Nothing here is real, so change
anything you like. Its dates are moved forward with each release: in this copy
today is {{demo-today}}, and the demo reads best around then. *По-русски — [[Начните здесь]].*

## Before you start

1. Obsidian asks whether to trust the plugins in this vault. Choose **Trust**,
   and Zenith switches on.
2. The dashboard opens by itself. That is the *Open on startup* feature.
3. The place is **Kazan**. Prayer times, weather and the Hijri dates all
   follow from it. Change it in *Settings → Zenith → General → Location*.
4. The interface follows Obsidian's language: English, Russian or Simplified
   Chinese. *Settings → Zenith → General → Language* picks one. In Chinese,
   a task typed as `明天下午6点买牛奶` gets its date and time too.

## Search

One line to reach anything in Zenith. Command palette → *Zenith: Search*; it has
no hotkey until you set one in *Settings → Zenith → Search*. On a phone, the
magnifier in Obsidian's menu.

- `dune` finds both Dune items in the library. `вгту` finds them too: it is
  the same word typed on the Russian layout.
- `#home` keeps only the tasks tagged `#home`. `anna` finds *Call Anna about
  the move*: **Ctrl+Enter** ticks it off and leaves the panel open.
- `{{demo-day:-12}}` opens that day's note.
- A line that finds nothing becomes a task: `buy milk tomorrow at 18 !`.
  `book Solaris` puts a book in the library's backlog, and `project Garden`
  opens the new-project form.

## Side panel

The compass tab in the right sidebar is Zenith's panel: four command buttons
on top, every Zenith view under them, with the one you are in marked. If it is
not there, run *Zenith: Open the side panel*.

- The pencil arranges it: drag a row by its handle, rename a button, click its
  icon for another, *Add a command* for any command Obsidian has, and the eye
  to hide a view.
- The order and the hidden views are the same in the dashboard's Navigation
  card.

## Code blocks

The *Editor* module gives a code block a header with the language's icon and
name, a stripe in its colour, line numbers and a copy button. A title after the
language goes into the header, and `-` before it starts the block folded:

```html Page skeleton
<!DOCTYPE html>
<html lang="en">
  <body>Hello</body>
</html>
```

```python - Folded until you open it
print("The arrow in the header opens it.")
```

- Click a header, or its arrow, to fold and open the block. `+` instead of `-`
  keeps a block open whatever the default.
- *Settings → Zenith → Editor* switches the parts off one by one and sets how
  blocks start: open, folded, or folded when long.

## Dashboard

- The board greets you, shows the date, and has a wallpaper
  (`00 Files/Images`). The grid button in the header turns on editing: drag, resize, flip a card to see
  its settings, save a layout.
- **Progress**: how far the day, week, month and year have gone, plus the
  Hijri month.
- **Countdowns**: days until the two `#countdown` tasks, the projects'
  target dates, Ramadan and Eid, and two dates of its own. Flip the card to add
  a yearly one.
- **Life in weeks**: a birth date is set so the grid has something to show.
  No template ever switches it on.
- **Classes**: what is on now or next, where, and how long until it starts or
  ends; the day as one strip, and on the large size the week.
- The other cards (tasks, calendar, prayer, library, challenge, journal,
  ritual, weather, picture) come from their modules.

## Tasks and calendar

- [[Inbox]] has every kind of task line: statuses, priorities, all the date
  markers, times (`⏰`), timers, repeats, subtasks, tags and project links.
- **The task list** is one line per task. Tap *Quarterly report* to edit it;
  its subtask tally, *1/3*, folds the subtasks out. Right-click it, or press and
  hold on a phone, for the rest: status, timer, open in file, delete. *Done*
  and *Cancelled* start folded; tap a group's header to open it.
- **Statistics**: the chart button in the Tasks header swaps the list for the
  figures, the statuses, the tags and the year of completions.
- **Quick add** (command palette → *Quick add task*): type
  `call Anna tomorrow 15:00-16:00 !! every week #work` and watch the chips.
- **Calendar**: today has four timed tasks. Drag one to another hour, or drag
  its lower edge to make it longer. Behind the tasks, faint, are the week's
  classes from Study: tap an empty hour between two of them to plan something
  there. *Calendar → Features → Classes on the hour grid* switches them off.
- **Reminders** are off by default. Turn them on in *Tasks → Features*.
  *Evening review* is at 22:00 today, after the classes.

## Study

An evening master's timetable over two weeks — *Week A* and *Week B* (in
Russian, *числитель* and *знаменатель*); this week is Week A. The labs are split
between two subgroups.

- The **Classes** card on the dashboard, and *Study* in the navigator: today at
  the top, then the week — a grid in a wide pane, a list of days in a narrow
  one or on a phone. Tap a class for its card: when it is next, **Task for the
  next class**, edit, delete.
- The `#study` tasks in [[Inbox]] are due on the day their subject is next
  taught.
- **Copy the AI prompt**, send it with a photo of your own timetable to any AI
  chat, and paste the answer into **Paste a timetable**. **Edit the
  timetable** changes it by hand, bells included. **Edit as JSON** opens the
  whole timetable as text.
- *My subgroup* is 0, so both subgroups' labs show, each with its room. Set it
  to 1 in *Settings → Zenith → Study* and the other subgroup's go.
- **Class reminders** are off by default: *Study → Features*.
- The card at another time of day: *Settings → Zenith → About → Debug tools →
  Study*. Pick a moment — before classes, in a class, a break, after classes, a
  day off. The card shows that time in orange; tap it to go back.

## Projects

Six projects, one in each state. *Move to a new flat* is due in a week, and
*Photo Book 2025* is past its target date. Tasks reach a project three ways:
written in its note, linked with `[[Website Redesign]]`, or tagged with the
project's `taskTags`.

## Journal

- 69 daily notes over ten weeks, with a few days missing. Eight trackers:
  - **Exercise** has a goal of 3 days a week, and Sundays are rest days
    (`sport: rest`), which don't break the run.
  - **Coffee** is a limit, at most 2 cups.
  - **Sweets** is a habit you are quitting.
- The calendar is coloured by mood. The grid button opens the **year in
  pixels**, and the number in front of each week opens that **week's note**.
- Today's note shows the **question of the day** and the check-in block.
- Commands *Morning ritual* and *Evening review*.

## Reviews

- Notes in `15 Journal/Reviews`:
  - [[2026-W38]] is last week, marked *reviewed*.
  - [[2026-08]] is last month.
  - [[2026]] is the year so far.
- Each one has a live `zenith-summary` block. **Freeze** writes its numbers into
  the note.
- *Open this week's note* (and month, quarter, year) creates a note only
  when you run it.
- **Year in review** (command) opens 2025 before December. For 2026 it
  opens on 1 December.

## Prayer

- Times come from a published calendar, saved on the device for a year. The
  history shows what was prayed on time, late or missed. A few days have no
  record at all, which is not the same as missed.
- **Fasting**: today's note says `fast: nafl`, so the countdown to maghrib
  reads "until iftar". There is also a hint about recommended fast days.
  Some earlier days have voluntary fasts, and two fasts were made up.

## Library

- 25 items across eight types. The library opens as a list grouped by status;
  the grid is one button away. *The Three-Body Problem* is in progress; press
  +1 on it. *The Great Gatsby* and *Blade Runner 2049* each have **two
  readings**.
- *Berserk* is **on hold**: it keeps its progress but stays out of *Continue*.
- The hearts are **favourites**: *Piranesi* and *Monster*. The heart button in
  the toolbar shows only them.
- **Series**: *Dune Messiah* and *Dune Part Two* are one line, *Dune*, under
  Completed. The arrow unfolds it; the name opens its own page.
- **Challenge 2026**: 6 books is on track, 6 films is behind. Turning *Count
  re-reads* off in the library settings changes the numbers.

## On a phone

- Zenith's views open clear of the camera and of Obsidian's buttons, and what
  you scroll goes on under them, as in a note. With Obsidian's *Full screen*
  on, the header and the buttons slide away as you scroll down.
- *Settings → Zenith → Appearance → Phone* shows what was measured, and takes
  the top and bottom by hand if a phone needs it.
