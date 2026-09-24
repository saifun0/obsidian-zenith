# Features

[← Documentation](../../README.md) · **English** · [Русский](../ru/features.md)

Zenith is built so that anything you don't use can be switched off. There are two levels:

- **Modules** — *Settings → Active modules*. A module that is off does nothing at all. Which
  modules run is kept **per device**: the phone can run fewer than the desktop.
- **Features** — the parts of a module someone might want without. Every module's settings
  page opens with a **Features** group listing them; a few sit beside the settings that
  depend on them instead (daily capture next to the heading it files under, prayer reminders
  next to how early they come). Features are **shared** between your devices.

Off means off: a feature that is switched off draws nothing, writes nothing, fetches nothing
and sets no timer. What it already wrote stays where it is — switching the timer off does not
remove `⏱` from your tasks, and switching it back on shows them again. A few specifics:

- **Task timer** — switching it off while a timer is running stops it and writes the time to
  the task, since there is no button left to stop it with.
- **Check-in block** — off, a `zenith-daily` block says so in one line instead of the day's
  trackers, and new daily notes are created without the block.
- **Widgets** — a widget that is switched off leaves the dashboard the same way a disabled
  module's widget does.
- **Groupings and views** — a task grouping or calendar view you chose and then switched off
  is remembered for when it comes back; until then the list is ungrouped and the calendar
  shows the month.

[Profiles](profiles.md) switch many of these at once — a template, a setup you saved, or one
someone sent you.

A feature can need another one, or another module: the activity heatmap is part of task
statistics, capture into the daily note needs the Journal module. Such a feature shows as
off and says what it is waiting for.

## The list

| Module | Features |
| --- | --- |
| — | Folder icons, vault structure button |
| [Notifications](notifications.md) | Notification center |
| Dashboard | Today's date, wallpaper, saved layouts |
| Tasks | Capture into the daily note, natural input, capture from links (off by default), reminders (off by default), subtasks, attachments, timer, drag and drop, group by date, group by note, statistics, activity heatmap, widget |
| Calendar | Week and day views, all 24 hours, moving tasks on the hour grid, agenda, start-to-due bars, tasks from daily notes, highlight on hover, week-ahead widget, overdue strip |
| Projects | Tasks in projects (links and progress), widget |
| Journal | Check-in block, calendar coloured by mood, habit month, weekly goals and limits, habits to quit, year in pixels, question of the day (off by default), word count, statistics, check-in widget |
| Content | Continue shelf, “+1” button, select several, filter by genre, import, statistics, widget |
| Prayer | Sunrise, voluntary prayers, Hijri date, week strip, statistics, reminders, widget |
| Weather | Hourly forecast, sunrise & sunset, air quality |

Modules that do one thing — the navigator, the picture, the media banner — have no features
of their own: their module switch is the feature.

## Existing configs

Upgrading keeps everything you had: every feature that was on is recorded as on in your
settings, so no later change to a default can switch it off behind your back. Switches that
existed before features did (`weatherShowAir`, `prayerShowSunrise`, `journalCaptureTasks`,
`dashboardShowDate`…) keep their names and values; the feature reads and writes them.
