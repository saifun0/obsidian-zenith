# Prayer

[← Documentation](../../README.md) · **English** · [Русский](../ru/prayer.md)

Prayer times come from a **published calendar** (Aladhan) by default, a year at a time,
kept on this device — or, if you prefer, are **computed on the device** with no request at
all. What you prayed is recorded in the same daily note the journal uses, one plain property
per prayer:

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

**The year's table.** In calendar mode the whole year is fetched in one request and kept as
a file in the plugin's folder (`.obsidian/plugins/zenith/cache/prayer/`), so the times keep
working offline for months — next year's table is fetched once fewer than 60 days of this
one are left. Nothing waits for it: until it has loaded, or when the service cannot be
reached, the view shows the calculation instead and says so beside the method ("calculated ·
table loading"), or shows a dash if you chose **Without the table → Dash**. A failed fetch
is retried on its own, after half a minute, then two, eight, half an hour, up to six hours.
The cache never travels with Zenith's sync: every device fetches its own. Only the
coordinates, rounded to two decimals (about a kilometre), are sent — see
[privacy](privacy.md).

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

## Fasting

*Prayer → Features → Fasting.* The day's fast is one property of its note:

```yaml
fast: ramadan   # ramadan | qada | nafl | broken | excused
```

The prayer view offers what fits the day — in Ramadan **Fasted**, **Broken** or **Excused**;
the rest of the year **Making up** or **Voluntary** — and a second tap clears it. In Ramadan a
line says where you are: *Ramadan, day 12 of 30 · fasted 11*. A Ramadan day with nothing
written is unrecorded, never counted as missed. All year, the view counts the fasts made up.
`fast:` is read in either language (`каза`, `нафль`…) for notes written by hand.

With **Voluntary fast days** on, the view says when a day is a recommended voluntary fast:
Mondays and Thursdays, the white days (13–15), Ashura and the day of Arafah — and never on
the two Eids or the days of Tashriq, which is why the 13th of Dhu al-Hijjah is not offered
as a white day.

### Iftar and suhoor

*Prayer → Display → Iftar and suhoor.* In Ramadan, and on any day whose note records a fast,
the countdown says what it is counting to: before maghrib *1h 20m until iftar*, before fajr
*suhoor ends in 5h 10m*. Fajr after isha belongs to tomorrow, so it is tomorrow's fast that
decides — the last night of Ramadan counts to fajr as usual. A Ramadan day marked **Broken**
or **Excused** keeps the plain countdown.

**Imsak** moves the end of suhoor earlier by that many minutes. It is 0 by default — the
timetable's fajr — since some stop eating ten minutes or so before it and some do not. Once
imsak has passed, the countdown is to fajr again.
