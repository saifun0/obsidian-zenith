# Tasks

[← Documentation](../../README.md) · **English** · [Русский](../ru/tasks.md)

Tasks are Markdown checkboxes discovered in the configured **Tasks folder** — and, while
the Journal module is active, in the journal folder too, since that's where captured tasks
live. Both `-` and `*` bullets are supported, and each task has a
**4-state status** encoded in the checkbox character:

| Checkbox | Status |
| --- | --- |
| `- [ ]` | To do |
| `- [/]` | In progress |
| `- [x]` | Done |
| `- [-]` | Cancelled |

```markdown
- [ ] Write the quarterly report 🔼 📅 2025-01-15 #work/reports
    - [ ] Draft the intro
    - [x] Collect the numbers
- [/] Refactor the parser 🔁 every week 🛫 2025-01-02
- [x] Buy groceries #home ✅ 2025-01-08
```

Indented checkboxes become **subtasks** of the task above them. Inline markers (a subset of
the popular *Tasks* plugin convention):

| Marker | Meaning |
| --- | --- |
| `⏫` / `🔼` / `🔽` | Urgent / high / low priority (`🔺` and `⏬` read as urgent and low) |
| `📅 YYYY-MM-DD` | Due date |
| `🛫 YYYY-MM-DD` | Start date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `✅ YYYY-MM-DD` | Completion date (stamped automatically when marked done) |
| `🔁 <rule>` | Recurrence, in the Tasks plugin's words — see [below](#repeat-rules) |
| `⏰ HH:MM` / `⏰ HH:MM-HH:MM` | Time of day, optionally with an end — what puts the task on the calendar's hour grid |
| `⏱ 1h25m` | Time already spent (kept by the task timer) |
| `⏲ 45m` | Countdown the timer was last set to — also the planned length on the hour grid |
| `#tag` (incl. `#a/b`, `#работа`) | Tag — by Obsidian's rules, so `C#`, `page#anchor` and `#123` are not tags |

Zenith edits a line **only where you changed it**. Everything else stays as you wrote it —
the order, the spacing, `📆` instead of `📅`, and markers Zenith has no field for: the
*Tasks* plugin's `➕` created date, `🆔` id, `⛔` depends-on and `🏁` on-completion, a
`^block-link`, your own emoji. A marker a line didn't have yet is added where Zenith would
have written it, ahead of trailing tags.

Completing a **recurring** task stamps its ✅ date and inserts the next occurrence above it
with its dates advanced. The new occurrence keeps the line as it was, minus what belonged to
the finished one: the ✅ stamp, the time spent, the `🆔`, `⛔` and block link (a copy would
break whatever points at them); a `➕` becomes today. A task marked `🏁 delete` is removed
once done — a recurring one leaves its next occurrence, with the description under it.

<a id="repeat-rules"></a>The rules Zenith reads are the Tasks plugin's: `every day`, `every 3 days`,
`every other week`, `daily`/`weekly`/`monthly`/`yearly`, `every weekday`, `every monday`,
`every week on Tuesday, Friday`, `every 2 weeks on Monday`, `every month on the 15th`,
`every month on the last`, `every month on the 2nd Tuesday`, `every month on the last Friday`,
and any of them with `when done` to count from the day it was finished. A month without the
day comes back on its last day — the 31st of January repeats on the 28th of February. A rule
Zenith cannot read is said so in the editor, and finishing such a task says that no next
occurrence was added, rather than ending the series quietly. A
file may also declare **defaults** via YAML frontmatter (`priority`, `due`, `tags`); inline
markers on a line override them, and editing a task doesn't copy them onto the line.

The Tasks view is laid out like a page of a planner. At the top, **the day**, and under it
one line — *42 active · 19 in progress · 62 done* — which is also how the page is turned:
each figure shows its tasks, the one shown is underlined, and a second click goes back to
everything. Two marks on the right: **⌕** for search and **⋯** for the rest (statistics, the
calendar, the order, the grouping, refresh).

Each task is one **line** in a grid:

| Column | What it holds |
| --- | --- |
| **Margin** | The day, in italic — under *Today* just the hour, within the week the weekday, further out the date; red once it has passed. ↻ when the task repeats. |
| **!** | An urgent task, in red. High priority sets the title heavier; low, quieter. |
| **Circle** | ○ to do, ◐ in progress, ● done, ⊘ cancelled — said by shape, not colour. |
| **Title** | And under it, in italic, the first line of its note. |
| **Right** | Two tags, how far its subtasks are (an arc and *2/5*), a paperclip. |

**A click on the circle closes the task** (a second click opens it again). The ink is drawn
through the title, and the task stays where it was for a couple of seconds with **undo** in
the margin, then folds away into *Done*. Undo puts the note back exactly as it was — the ✅
stamp, and the next occurrence a recurring task inserted — as long as nothing has written to
the note since. All four statuses are behind a **right-click, or a long press**, on the
circle.

**A click on the title opens the editor.** A right-click or a long press on the row opens
everything else: the statuses, *Move to today / tomorrow*, *Remove the date*, add a subtask,
the timer, open in file, delete. On a desktop the timer, **⋯** and the drag handle come up
over the right edge when you point at a row.

**On a phone, a row swipes:** to the right to close it, to the left to move it to tomorrow.
The swipe is the row's only when it starts away from the very edge of the screen — from the
edge it still opens Obsidian's sidebars. The drag handles stay hidden there until
**⋯ → Put in order by hand**.

**Writing a task** happens on the line above the list, as on paper: type it and press
<kbd>Enter</kbd>; the line is ready for the next. With natural input on (see below) the date
it reads shows up in the margin as you type — click it to keep those words in the title
instead. <kbd>Shift</kbd>+<kbd>Enter</kbd> opens the full editor with what you typed.

**Search** (⌕, or <kbd>/</kbd>) reads more than words: `#work` keeps tasks tagged so (or
under it, like `#work/zenith`), `!high` one priority and `!` / `!!` / `!!!` a priority or
above, and `overdue`, `today`, `week`, `no date` narrow by deadline — in any of the plugin's
languages (`просрочено`, `без даты`…). The tags in use and these words are offered under the
field.

**The groups** read like a diary: *Overdue*, *Today*, *Tomorrow*, *Next seven days*,
*Later*, *No date*, then *Done* and *Cancelled*, which start folded. A group's name folds it;
an empty one is not drawn. On the *Done* page the finished tasks read as a log, the latest
first.

**The keyboard**, while the list has focus: <kbd>↑</kbd>/<kbd>↓</kbd> move between tasks,
<kbd>Space</kbd> closes the one in focus, <kbd>Enter</kbd> opens it, <kbd>N</kbd> goes to the
writing line, <kbd>/</kbd> to search, <kbd>Esc</kbd> clears the search.

Subtasks and attachments **fold** behind their arc (or the paperclip) and stay as you left
them on this device. A subtask is a thinner line; a tap opens its own editor, and its menu
is behind the same gesture.

**The editor** opens the task as a page: its title large, and under it one line of what it
is — *○ To do · Oct 31, 15:00 · High · ↻ every week · Zenith* — where each word is the
control for itself: a click opens just that question under the line. What is not set waits
at the end of the line as *+ due*, *+ repeat*, *+ start*… Then the tags (type and press
<kbd>Enter</kbd>, a space or a comma; <kbd>Backspace</kbd> in the empty field takes the last
one back), the note, the subtasks — ticked and added straight into the note while you edit —
and the attachments. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> saves; closing with
changes asks first.

**⋯ → Statistics** swaps the list for a short **report**: what the period amounted to, in a
sentence — *In the past year, 62 of 104 closed — 60%. 19 in progress, 7 overdue.* — the
active days, the streak and how deadlines are kept, the statuses as one line of ink, the tags
with dotted leaders, and the year of completions with its months named — as many recent
weeks as the width holds, the newest at the right edge. New tasks go into today's daily note
when the Journal module's task capture is on (the default — see [Journal](journal.md)), and
to `Zenith Inbox.md` otherwise.

**On the dashboard**, the tasks card is the same page, smaller: a sentence — *1 overdue,
2 for today* — the tasks in the list's own rows, grouped as *Today*, *In progress* and
*Up next*, and along the bottom the day's progress as one line of ink: what was closed today
out of what today asked for. The card never scrolls; what does not fit is counted in its
*+N more* link.

> Dates are compared in your **local** timezone, so “Today” / “Overdue” are always correct.

<a id="natural-input"></a>**Natural input.** In quick add and on the list's writing line, the title can carry the rest: *Call mom tomorrow at 6pm !*
becomes the task *Call mom*, due tomorrow at 18:00, priority 🔼. Every piece that was
understood shows as a chip under the field, and × on a chip keeps those words in the title
instead. What is read, in English, Russian and Chinese:

| | Examples |
| --- | --- |
| Date → 📅 | `today`, `tomorrow`, `friday` / `on fri`, `+3d`, `+2w`, `15.10`, `15.10.2027` · `сегодня`, `завтра`, `послезавтра`, `в пятницу`, `пт`, `+3д`, `+2н` · `今天`, `明天`, `后天`, `周五`, `下周五`, `9月12日` |
| Time → ⏰ | `at 18`, `9:30`, `6pm`, `18:00–19:30`, `from 9 to 10` · `в 18`, `с 9 до 10:30` · `下午6点`, `7点半` |
| Priority | `!` → 🔼, `!!` → ⏫ — standing on their own; `！` too |
| Repeat → 🔁 | `every day/week/month/year`, `every 3 days`, `daily`, `weekly` · `каждый день`, `каждые 2 недели`, `ежемесячно` · `每天`, `每周五`, `每2周` |

Chinese needs no spaces: in *明天下午6点给妈妈打电话* the date and the time are read where
they stand.

It stays narrow on purpose. A bare number is never a time (*buy 2 loaves*), a weekday named
on that day means next week's, a date already past this year means next year's, and a time
or a repeat with no day is today's. Anything else stays part of the title — a phrase half
understood looks half understood, and nothing is dropped. `#tags` are the task's own
syntax and stay in the title; typing `#` offers the tags already in use. Switch it off under
**Tasks → Features → Natural input**.

**Drag and drop.** A task row has a handle in manual order, a subtask row under any order
— on a desktop when you point at the row, on a phone in *Put in order by hand*. A task
carries its whole
subtree, and lands with the indentation of whatever it's dropped next to — so dragging a
subtask beside a top-level task promotes it, and dropping a task inside another one's
children nests it. Dropping a task into its *own* subtree is refused; it would take its
children along and orphan them.

What a drop means depends on where it lands:

| Drop | Effect |
| --- | --- |
| Within a group | Reorders the lines in the file |
| Onto another **smart group** | Edits the task until it belongs there: *Today* and *Tomorrow* set the due date, *Next seven days* sets it to the last day of the week ahead, *No date* clears it, *Done* / *Cancelled* set the status. Dropping a finished task into an active group reopens it. |
| Onto another **file group** | Moves the task into that file |
| **Overdue**, **Later** | Refused — a deadline in the past isn't something you can schedule into, and no single day is what *later* means |

Empty groups appear as drop targets only while a drag they'd accept is in flight.
Reordering tasks needs **Order: Manual**, since every other order derives from the task data
and a dragged row would snap straight back. Subtasks are never sorted — they stand in the
order the file has them — so theirs can be changed under any order. The handle is also
focusable: press
<kbd>↑</kbd>/<kbd>↓</kbd> to move a row without a pointer.

## Capture from links

With **Tasks → Features → Capture from links** on, `obsidian://zenith` links add a task,
log today's tracker or open a view — from a phone's home-screen shortcut, a widget, anything
that can open a URL:

| Link | Does |
| --- | --- |
| `obsidian://zenith?do=add-task&text=Call%20mom%20tomorrow%20at%206pm` | Adds a task. The text is read like [quick add](#natural-input) — date, time, priority, repeat. |
| `obsidian://zenith?do=log&tracker=water&value=%2B1` | Today's `water` + 1. `value=5` sets it, `value=-1` takes one off, `value=true` ticks a check tracker. |
| `obsidian://zenith?do=open&view=tasks` | Opens a view: `dashboard`, `tasks`, `calendar`, `projects`, `content`, `journal`, `prayer`. |

`tracker` is the tracker's id — the frontmatter key its values are written under. Add
`&vault=My%20Vault` if you have more than one vault. Write `+` as `%2B`: in a link a bare
`+` means a space (Zenith reads `value= 1` as `+1` anyway, but other apps may not pass it on
intact).

**It is off by default**, because any web page can open an `obsidian://` link. When on:
links can only add a task, set **today's** tracker value, or open a view — nothing deletes
or edits; every write shows a notice with **Undo**; more than five requests a minute are
ignored for the rest of it; and an action for a module that is off does nothing. While it
is off, a link says so in a notice — at most once every ten minutes.

**iOS (Shortcuts).** New shortcut → *Ask for Input* (Text) → *URL Encode* → *Open URLs*
with `obsidian://zenith?do=add-task&text=` followed by the *URL Encoded Text* variable. Add
it to the home screen, or say its name to Siri. For a tracker, one action is enough: *Open
URLs* `obsidian://zenith?do=log&tracker=water&value=%2B1`.

**Android.** Any launcher or automation app that opens a URL will do — for example *HTTP
Shortcuts* or *Tasker* (*Browse URL*): point a home-screen shortcut at
`obsidian://zenith?do=log&tracker=water&value=%2B1`. To type a task, use the app's text
prompt and put the (encoded) answer after `text=`.

## Reminders

With **Tasks → Reminders** on (it is off by default), tasks remind you through the
[notification center](notifications.md):

- **At a task's time.** A task with `⏰ 18:00` is announced at 18:00 — or earlier, by
  **Warn before**. From the notice it can be opened, snoozed, or marked **done** — through the
  same writer as the list, so a recurring task rolls over exactly as it would from a tick.
- **A morning summary.** At the chosen hour (08:00 unless changed), the day's tasks that have
  no time — the ones no reminder would mention — and how many are overdue: *5 tasks for
  today · 2 overdue*. Nothing when there is nothing.

Every reminder looks the task up again when it comes due: one done, moved or deleted since
says nothing. Only while Obsidian is running; one that came while it was closed waits in the
center as missed, and the morning summary read late the same day is still today's. If the
**Reminder** plugin is on too, the settings say so — it reads `⏰` as well, and a task could
be announced twice.

## Moving tasks on the calendar's hour grid

In the week and day views, a task's time can be changed where it is drawn:

- **Drag a block** to another hour, or across to another day. It lands on a quarter hour.
- **Drag its foot** to stretch or shorten it. That writes the end of the `⏰` range
  (`⏰ 09:00-10:30`) — never `⏲`, which is how long you set a timer for.
- **Drop a task from the all-day band** onto an hour to give it one.
- **Tap an empty slot** — the way in on a phone, where a finger on a block scrolls instead —
  and pick which of that day's tasks without a time goes there.
- **Arrow keys** on a focused block: ↑↓ move it a quarter hour, Shift+↑↓ change its end, ←→
  move it a day. It is written a moment after the last press, or at once with Enter; Escape
  puts it back.

While a block moves it stays where it is, faded, and a dashed ghost shows where it would
land. Moving keeps whatever end the line states and writes none it did not. Moving to
another day changes the date the `⏰` belongs to — and when that is the **due date**, it
asks first: that is a deadline moving, not a meeting. Done and cancelled tasks stay where
they happened. Switch it off under **Calendar → Features → Move on the hour grid**.

## Classes on the hour grid

With the [Study](study.md) module on, the week and day views draw your timetable behind the
tasks: each class a faint block with its subject and room, so the free hours between
classes are plain to see. The blocks follow your subgroup, the current week of a two-week
cycle and the term, and two subgroups at once are one block. They are in the way of
nothing: a task sits on top, and a tap or a drag goes through to the grid — a task can be
planned next to a class, or into one. Switch them off under **Calendar → Features →
Classes on the hour grid**.
