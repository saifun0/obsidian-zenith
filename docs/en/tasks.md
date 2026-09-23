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
| `🔁 <rule>` | Recurrence (`daily`, `weekly`, `monthly`, `every N days`…) |
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
once done — a recurring one leaves its next occurrence, with the description under it. A
file may also declare **defaults** via YAML frontmatter (`priority`, `due`, `tags`); inline
markers on a line override them, and editing a task doesn't copy them onto the line.

The Tasks view adds a **status picker** on each row, a rich **create/edit modal** (status,
priority, tags with autocomplete, due/start/scheduled dates, recurrence, subtasks), and a
**statistics panel** (done/total, in-progress, overdue, progress, streak, active days,
by-status & by-tag donuts, and a completion heatmap). Task rows show a rolled-up subtask
tally, and the filter bar can narrow by deadline — including **no date**, which is where
forgotten tasks accumulate. New tasks created from the UI or the
**“Quick add task”** command go into today's daily note when the Journal module's task
capture is on (the default — see [Journal](journal.md)), and to `Zenith Inbox.md` otherwise.

> Dates are compared in your **local** timezone, so “Today” / “Overdue” are always correct.

<a id="natural-input"></a>**Natural input.** In quick add, the title can carry the rest: *Call mom tomorrow at 6pm !*
becomes the task *Call mom*, due tomorrow at 18:00, priority 🔼. Every piece that was
understood shows as a chip under the field, and × on a chip keeps those words in the title
instead. What is read, in English and Russian:

| | Examples |
| --- | --- |
| Date → 📅 | `today`, `tomorrow`, `friday` / `on fri`, `+3d`, `+2w`, `15.10`, `15.10.2027` · `сегодня`, `завтра`, `послезавтра`, `в пятницу`, `пт`, `+3д`, `+2н` |
| Time → ⏰ | `at 18`, `9:30`, `6pm`, `18:00–19:30`, `from 9 to 10` · `в 18`, `с 9 до 10:30` |
| Priority | `!` → 🔼, `!!` → ⏫ — standing on their own |
| Repeat → 🔁 | `every day/week/month/year`, `every 3 days`, `daily`, `weekly` · `каждый день`, `каждые 2 недели`, `ежемесячно` |

It stays narrow on purpose. A bare number is never a time (*buy 2 loaves*), a weekday named
on that day means next week's, a date already past this year means next year's, and a time
or a repeat with no day is today's. Anything else stays part of the title — a phrase half
understood looks half understood, and nothing is dropped. `#tags` are the task's own
syntax and stay in the title; typing `#` offers the tags already in use. Switch it off under
**Tasks → Features → Natural input**.

**Drag and drop.** Every task and subtask row has a grip in its action cluster. A task
carries its whole subtree, and lands with the indentation of whatever it's dropped next
to — so dragging a subtask beside a top-level task promotes it, and dropping a task inside
another one's children nests it. Dropping a task into its *own* subtree is refused; it
would take its children along and orphan them.

What a drop means depends on where it lands:

| Drop | Effect |
| --- | --- |
| Within a group | Reorders the lines in the file |
| Onto another **smart bucket** | Edits the task until it belongs there: *Today* sets the due date, *Later* clears it, *Done* / *Cancelled* set the status. Dropping a completed task into an active bucket reopens it. |
| Onto another **file group** | Moves the task into that file |
| **Overdue** | Refused — a deadline in the past isn't something you can schedule into |

Empty buckets appear as drop targets only while a drag they'd accept is in flight.
Reordering needs **Sort: Manual**, since every other sort derives the order from the task
data and a dragged row would snap straight back. The grip is also focusable: press
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
