# Prayer

[← Documentation](../../README.md) · **English** · [Русский](../ru/prayer.md)

Prayer times are computed **on the device** from the chosen coordinates — no request, no
account, and nothing leaves the vault. What you prayed is recorded in the same daily note
the journal uses, one plain property per prayer:

```yaml
---
date: 2026-08-09
fajr: ontime      # inside its window
dhuhr: ontime
asr: late         # prayed, but after the window closed
maghrib: missed   # not prayed — and said so
isha: ontime
witr: true        # voluntary prayers are plain check-boxes
---
```

Reading is forgiving: `true`, `done` and `x` all mean "on time", and `вовремя`, `када`,
`пропущен` are understood too, so a note filled in by hand keeps working. A prayer with no
property at all is **not recorded** — which the statistics keep separate from *missed*,
because a day nobody wrote down is not a day of five missed prayers.

**Times** follow the method, madhab and high-latitude rule chosen in **Settings → Prayer**.
Methods and madhabs differ by up to an hour, and which is right is not the plugin's to
decide, so the prayer view **asks** until they are chosen — the Russian muftiate's angles
and a Hanafi asr are only preselected. Fourteen methods ship, including Umm al-Qura, MWL,
ISNA, Diyanet and custom angles. Above roughly 48° the sun stops reaching the fajr angle in
summer, and the **high-latitude rule** decides what to show instead — a portion of the
night, or nothing at all if you'd rather see the gap than a substitute. Per-prayer
**adjustments** (±30 min) exist to reconcile the calculation with the mosque you actually
pray at, and **rounding** says how seconds are lost: to the nearest minute, or dropped.

**Match my app.** Most people know which app or mosque timetable they trust, not which
method it uses. In **Settings → Prayer → Match my app** (or from the question in the prayer
view), type the times it shows for today — a second or third day from another season tells
more, since winter and summer bring out different rules. Every method, madhab,
high-latitude rule and rounding is tried, custom angles included, and the closest is
proposed with its evidence: per prayer, whether it now matches and what correction it took.
Corrections are only offered up to 10 minutes — anything larger means a wrong method, not a
mosque's rounding. The madhab is shown as a choice with both figures a tap apart, never
fitted silently: it is a matter of practice, and the times only show which one the app
uses.

**Recording.** On the dashboard, tapping a prayer marks it — *on time* while its window is
open, *late* once it has closed — and tapping again clears it; right-click offers all three
answers. A prayer whose time hasn't come in cannot be ticked. In the full view every answer
is a visible button, and any past day can be filled in by picking it on the calendar.

**The view** shows the day's times with sunrise (which closes fajr's window) and, with
tahajjud enabled, midnight and the last third of the night; a band showing the day's
proportions with a needle at now; a month whose every day is five segments; and 30-day
statistics — performed, on time, late, missed, full days, and the streak.

A ` ```zenith-prayer ` code block renders the same tracker inside a note, dated by the note
it sits in.

**Reminders** are off by default. Switched on, they raise an Obsidian notice a configurable
number of minutes before each prayer — only while Obsidian is running, and with no adhan:
a plugin cannot wake a sleeping phone, and promising otherwise would be a promise that
breaks on the morning it matters. Each reminder is also kept in the [notification center](notifications.md);
one that came while Obsidian was closed waits there as missed instead of popping up late.
