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
| `⏫` / `🔼` / `🔽` | Urgent / high / low priority |
| `📅 YYYY-MM-DD` | Due date |
| `🛫 YYYY-MM-DD` | Start date |
| `⏳ YYYY-MM-DD` | Scheduled date |
| `✅ YYYY-MM-DD` | Completion date (stamped automatically when marked done) |
| `🔁 <rule>` | Recurrence (`daily`, `weekly`, `monthly`, `every N days`…) |
| `⏰ HH:MM` / `⏰ HH:MM-HH:MM` | Time of day, optionally with an end — what puts the task on the calendar's hour grid |
| `⏱ 1h25m` | Time already spent (kept by the task timer) |
| `⏲ 45m` | Countdown the timer was last set to — also the planned length on the hour grid |
| `#tag` (incl. `#a/b`) | Tag |

Completing a **recurring** task stamps its ✅ date and inserts the next occurrence above it
with its dates advanced. A file may also declare **defaults** via YAML frontmatter
(`priority`, `due`, `tags`); inline markers on a line override them.

The Tasks view adds a **status picker** on each row, a rich **create/edit modal** (status,
priority, tags with autocomplete, due/start/scheduled dates, recurrence, subtasks), and a
**statistics panel** (done/total, in-progress, overdue, progress, streak, active days,
by-status & by-tag donuts, and a completion heatmap). Task rows show a rolled-up subtask
tally, and the filter bar can narrow by deadline — including **no date**, which is where
forgotten tasks accumulate. New tasks created from the UI or the
**“Quick add task”** command go into today's daily note when the Journal module's task
capture is on (the default — see [Journal](journal.md)), and to `Zenith Inbox.md` otherwise.

> Dates are compared in your **local** timezone, so “Today” / “Overdue” are always correct.

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
