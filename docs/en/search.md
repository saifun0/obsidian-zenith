# Search

[← Documentation](../../README.md) · **English** · [Русский](../ru/search.md)

One line to reach anything in Zenith: a view, an action, a task, a project, a library item or
a day's note. When what you typed is not there, the same line adds it as a task.

Search looks only at Zenith. Notes are what Obsidian's quick switcher (Ctrl+O) is for, and
Obsidian's own commands are in its command palette (Ctrl+P). Mixing them in would bury what
you came for.

## Opening it

- **On a computer:** the command *Zenith: Search*. No hotkey is set to begin with, so it can't
  clash with another plugin's. *Settings → Search → Hotkey → Set…* opens Obsidian's hotkey page
  with the list narrowed to this one command. Press the keys you want there.
- **On a phone:** the magnifier in Obsidian's menu. Or pin *Zenith: Search* to the toolbar
  over the keyboard, in Obsidian's own settings for its mobile toolbar.

The panel is Obsidian's command palette in shape, so it follows your theme. On a phone it
sits where the palette does, with the line at the bottom by the keyboard.

## What it finds

| Group | What | Enter |
| --- | --- | --- |
| Views | Every Zenith view. | Opens it. |
| Actions | Zenith's commands, named in Zenith's language, with their hotkeys. | Runs it. |
| Tasks | Tasks still to do: not the done or cancelled ones. | Opens the task editor. |
| Projects | Active, in-progress and paused projects. | Opens the project's note. |
| Content | Every library item, finished ones too. | Opens its card, with the rating and progress. |
| Journal | A day's note, by its date. | Opens it, making it if needed. |

A group leaves Search with its module: switch the module off, and nothing of it is offered.

- **Order.** The group with the best match comes first, up to five rows each. Type a letter or
  two more to narrow it.
- **Empty line.** The empty line shows what you picked last.
- **Frequent picks.** What you pick often comes first among matches that are equally good. This
  is remembered on each device separately: a phone and a computer are used for different things.

### How it matches

- **Words.** Every word you type has to be found, in any order. The start of the text counts
  most, then the start of a word, then anywhere inside.
- **Both languages.** Zenith's names match in English and in Russian: *sync* and *синх* find the
  same action.
- **Keyboard layout.** A query typed on the wrong layout is read on the other one too: *ынтс*
  finds *sync*, and *nfcr* finds *таск*.
- **Tags.** A `#tag` at the start keeps only what carries that tag: `#дом`, or `#дом хлеб`.
  Without the `#`, tags are still searched, a little lower than titles.

### Dates

A line that is a date, and nothing else, offers that day's note:

- **Relative days:** *today*, *yesterday*, *tomorrow*, and in Russian *сегодня*, *вчера*,
  *позавчера*, *завтра*.
- **Weekdays:** *mon*, *friday*, *пн*, *в пятницу*. A weekday is the last one, today included.
- **Day and month:** *12 September*, *sep 12*, *12 сен*, *12.09*, *12.09.2025*, *2026-09-12*.
  Without a year it is the one nearest today, so *31 dec* typed in January is the December just
  gone.

It searches dates only, not the text of the notes: that is Obsidian's own search (Ctrl+Shift+F).

## Adding from the line

**A task.** Whatever you type also offers *+ Task*.
- **Where the row goes.** When nothing matched well, it comes first, and Enter adds the task.
  When something did, it waits at the bottom.
- **How the line is read.** The line is read as in quick add: *buy milk tomorrow at 18 !* is
  the task *buy milk*, due tomorrow at 18:00, high priority. What was understood is shown
  beside it. With natural input switched off, the whole line is the title.
- **Where it goes.** The task goes where quick add puts tasks.

**Other things,** by the word the line starts with, in English or Russian:

| Starts with | Makes |
| --- | --- |
| *project*, *проект* | The *New project* form, with the name filled in. |
| *journal*, *diary*, *журнал*, *дневник* | A line `- 14:32 text` under *Notes* in today's note. |
| A content type: *book*, *movie*, *film*, *show*, *series*, *anime*, *manga*, or in Russian *книга*, *фильм*, *кино*, *сериал*, *аниме*, *манга* | The item, in the backlog. Your own types by their name. |

The rest of the line is also searched in that group. If something by exactly that name is
there already, it comes first, so Enter opens it rather than making a second.

## Keys

| Key | What it does |
| --- | --- |
| ↑ ↓ | Moves between rows. |
| Enter | Opens, runs or creates the row. The panel closes. |
| Ctrl+Enter (Cmd+Enter on a Mac) | Marks the task done. The panel stays open, so several can be ticked off in a row. |
| Alt+Enter | Opens the note behind the row: the task's line, the item's note. |
| Esc | Closes the panel. |

On a phone, tap a row. The ✓ on each task marks it done.

## For module authors

A module adds its own rows with `registerSearchSource`, and names its commands in Zenith's
language. See [Search](module-api.md#search) in the module API.
