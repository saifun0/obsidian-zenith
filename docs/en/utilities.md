# Utilities

[← Documentation](../../README.md) · **English** · [Русский](../ru/utilities.md)

The small cards a board is furnished with: a text, a picture, links, recent notes, a line to
write a thought on, a timer. None of them belongs to a view — each is a thing you put on the
dashboard and fill in yourself.

They come with the **Utilities** module (it used to be called *Picture*, and a board that had
pictures on it keeps them). Add a card from the widget gallery while arranging the board;
each is set up **on the back of its own card** — press **⋯** in the card's header (a long
press on the header, on a phone) and it turns over. Text, Picture, Links, Quick note and
Timer can be placed more than once, each copy with its own settings and its own name. See
[Dashboard](dashboard.md) for the board itself.

## Text

Your own words, or the top of a note.

- **Typed here** — whatever you type on the back of the card. It is drawn as Markdown, so a
  list is a list, `**bold**` is bold and a `[[link]]` opens its note; a plain sentence stays
  a plain sentence.
- **A note** — a note from the vault, by its path or picked from the list. The card shows the
  note without its frontmatter and follows it: an edit shows on the card as it is saved, and
  a note moved or renamed is still found. A long note is cut after about twelve thousand
  characters — a card shows the top of a note, not the note. The name under the text opens
  it.

**Size** (small, normal, large) and **Align** (left or centre) are the two things a line of
text can ask for; a large centred line makes a motto, a small left-aligned note a list.

Checkboxes in the text are drawn, not ticked: ticking one on the card would change the card
and not the note. A picture embedded by a link is loaded from that address, as it would be in
a note.

## Picture

A photo or a GIF across the whole card, from a link or from the vault. **Fit** chooses
between filling the card (and cropping) and showing the whole picture.

## Links

The places a day goes back to, a row each: notes, other files, and addresses on the web.

On the back of the card, **From the vault** picks a file and **Link** adds an empty row. A
row takes a vault path, a note's name, a `[[wikilink]]` (with a `#heading` if you like) or an
address; the second field is your own name for it, and is made from the target when left
empty — a note's name, a site's host.

A note opens where a link in a note would: in a new tab with Ctrl/⌘ held. A row whose note is
not in the vault is struck out and opens nothing, rather than creating an empty note of that
name. Only `http(s)`, `mailto:` and `obsidian://` addresses are opened; anything else is shown
and refused.

## Recent notes

**Changed** — the notes written last, newest first, with how long ago. **Opened** — the files
you opened last, in Obsidian's own order. A wide card flows into columns, so it shows a dozen
without a scrollbar.

## Quick note

A line to write a thought on. Enter files it — and the line stays ready for the next.

- With the journal on it goes to **today's daily note**, at the end of its *Notes* section (or
  the end of the note, when it has none); the note is created from your template if today has
  not been started.
- Or to **a note** you choose. A note that does not exist yet is created by the first line
  written to it; its folder has to exist.

What is written is one list item with the time in front: `- 09:05 call the bank`. Switch
**Time** off to leave it out. A line you type as a list item or a task yourself
(`- [ ] buy milk`) is kept exactly as typed.

Under the line the card says where it writes — that is also the way to the note — and shows
the last line you filed beside it, so you can see it was written. The card is always one
row tall.

## Timer

A kitchen timer: pick 5, 15, 25 or 45 minutes (or any length on the back of the card), press
start, and the card counts down and says when it will end; the line under the figure
empties with the time. A running timer can be paused and resumed; it is reset from a pause
or once the time is up. A paused timer does not ring.

When the time is up the card says so, and a notice comes through the
[notification center](notifications.md) — so it reaches you with the dashboard closed, and
quiet hours and *Only in the center* apply to it as to every other reminder (the source is
called *Timers*). A timer keeps time across a restart, and on your other devices if settings
sync; one that ran out while Obsidian was closed is not announced afterwards.
