# Study

[← Documentation](../../README.md) · **English** · [Русский](../ru/study.md)

Your class timetable: a card on the dashboard for today, a view for the whole week, and
reminders before classes. Switch the module on in *Settings → Active Modules → Study*.

## Getting the timetable in

There are three ways, from the quickest:

1. **Paste it** (*Paste a timetable* — in the view, on the card, in settings or as a
   command). The box takes the timetable as JSON and shows, while you type, what it
   understood: how many bells and classes, per day, and every line it had to skip, and
   why. Nothing is saved until **Replace the timetable**. Replacing an existing timetable
   asks first.
2. **Let an AI chat write it.** **Copy the AI prompt** puts on the clipboard an
   explanation of the format, in your language. Send it to any chat model together with a
   photo or the text of your timetable and your bell times, then paste its answer into the
   box. The prompt covers what real timetables look like: numerator/denominator rows,
   cells split between subgroups, abbreviations like *lec.* and *lab.* It also tells the
   model not to invent a room or a teacher it cannot read. The box is forgiving about how
   models answer: a code fence around the JSON, a sentence before it, `"day": "Tuesday"`,
   `"week": "числитель"`, `"time": "08:30-10:00"`, a trailing comma.
3. **By hand** (*Edit the timetable*). A day at a time, a class at a time: subject, kind,
   day, bell or its own time, week, subgroup, room, teacher, note. Subjects and teachers
   already in the timetable are offered as you type. The **Bells** tab lays out a whole day
   in one go: the first start, the length, the break, and a longer break after a given
   class. Everything is edited on a copy — Cancel really cancels. Before saving, the
   editor counts two classes in one slot and classes with no time.

**Copy the current one** in the paste box gives the timetable back in the same format, to
keep, share or edit elsewhere.

### The format

```json
{
  "weeks": 2,
  "bells": [ { "n": 1, "start": "08:30", "end": "10:00" } ],
  "lessons": [
    { "day": 1, "n": 1, "week": 0, "subject": "Mathematical Analysis",
      "kind": "lecture", "room": "305", "teacher": "Ivanov I. I." },
    { "day": 3, "start": "18:00", "end": "19:30", "subject": "English",
      "kind": "practice", "subgroup": 2 }
  ]
}
```

- `day` is 1–7, Monday first.
- `n` names a bell. `start`/`end` give a class its own time.
- `week` is 0 (every week), 1 or 2.
- `kind` is `lecture`, `practice`, `lab`, `seminar`, `exam`, `consultation` or `other`.
- `room`, `teacher`, `subgroup` and `note` are optional.

## Two-week timetables

*Two-week timetable* (in the editor and in settings) turns on the cycle. Classes then
belong to every week or to the first or second. How the weeks are called is up to you:
*1st / 2nd*, *numerator / denominator* or *odd / even*. Which week is current is set
with *This week is*: in the editor, in settings, or with *Not this week? Swap* in the
view. Every other week follows from there. Until it is set, odd ISO weeks are counted as
the first.

## Subgroups and the term

*My subgroup* shows the whole group's classes and yours. At 0 every subgroup's classes are
shown, and a slot two subgroups share lists each one's room. *Term starts / ends* is
optional: outside the term the card shows holidays instead of classes.

## The card

The first lines answer what matters between two doors: what is on now or next, **where**,
and how long until it ends or starts. The room is drawn larger than anything else after
the subject. The card changes with the day:

| When | What it says |
| --- | --- |
| In a class | the subject, room, how much is left, and what comes next |
| Between classes | the break's length, the next subject and room, how soon |
| Before the first | the first class and how soon |
| After the last | "classes are over", and when they start again |
| No classes today | the next day with classes and how many |
| Outside the term | holidays, and when the term starts |

Under it, the whole day is drawn as one strip, with a needle at now. A bigger card adds
the day's list: finished classes fade, and the list scrolls itself to the current one. The
largest card adds the week as small columns, one bar per class. The layout follows the
card's real width, not only its size, so the same card works in a sidebar and on a phone.

## The view

*Open the timetable* shows today at the top and then the week. In a wide pane it is the
paper grid: a row per bell with its times, a column per day, today's date in the accent
colour and the current class outlined. Every class in a row is the row's height, with the
room at its foot, so rooms line up; a subject longer than two lines is whole in the
tooltip. A bell no one has class at that week shrinks to its times. In a narrow pane or on
a phone it is a list of days, with the bell times under it. With a two-week cycle either
week can be shown. Tapping a class opens its card:
- when it is next;
- **Task for the next class**, which adds a task due on that day, tagged `#study`;
- edit;
- delete.

## Reminders

*Study → Class reminders* (off by default): a notification a set number of minutes before
each class — the subject, how soon, and the room. There is one per time slot, even when
two subgroups share it.

## Checking the card at another time

*Settings → About → Debug tools → Study* sets the time the Study card and view take as
now: any date and minute, or one of the moments of that day — before classes, in a class,
a break, after classes, the next day off. The clock keeps running from there, so
countdowns still count. While it is on, the card and the view show the preview time in
orange; tapping it goes back to the real time. Reminders and the rest of Obsidian keep the
real time, and a restart returns to it.
