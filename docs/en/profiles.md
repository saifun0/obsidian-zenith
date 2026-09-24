# Profiles

[← Documentation](../../README.md) · **English** · [Русский](../ru/profiles.md)

A profile is the whole shape of how you use Zenith — which [modules](features.md) run,
which features are on, and the settings that go with them — as one thing you can apply,
save, undo and hand to someone else. *Settings → Profiles.*

## Templates

| Template | What it sets up |
| --- | --- |
| Minimum | Dashboard, tasks and a journal, with nothing extra. |
| Everything | Every module, every feature. |
| Habits and journal | The journal with every tracker view; tasks in their simplest form. |
| Tasks and planning | Tasks, calendar and projects with all their tools; the journal only as the place captured tasks go. |
| Prayer and fasting | Prayer times, reminders and tracking; a minimal journal to record them in. |
| Reading and media | The content library with all its tools. |

A template speaks for its own modules and leaves everything else alone: the features of a
module it switches off stay as they were, so switching that module back on later brings it
back the way you had it. No template touches **sync** — choosing "Minimum" is not a request
to stop your devices agreeing. Nor does any template decide **Life in weeks**, which asks
for a birth date: it is switched on only by hand, and a template leaves it as it is.

A fresh install offers the templates once, on first start. Anyone upgrading never sees that
dialog; their setup is saved as a profile called **Before profiles** instead.

## Applying

Nothing is applied without a preview first: what will be switched on, what will be switched
off, and how many settings change. Two modes:

- **Replace** — everything the profile speaks for becomes as it says. What it doesn't mention
  stays.
- **Add to current** — only switches on the modules and features the profile has on.
  Nothing is switched off and no setting changes.

After applying, **Put it back** at the top of the page restores exactly what that apply
changed. It is kept per device, like the change it undoes.

A module the profile names that isn't installed is left out and listed. A third-party module
the profile doesn't mention is never switched off.

## Your own profiles

**Save the current setup** keeps modules, features and settings as they are now under a
name — folders and location included, since it is your own vault. Saved profiles are shared
between your devices. From each one's menu: rename, export, delete.

## Export and import

**Export** writes the profile to `Zenith/profiles/<name>.json` in the vault — never over an
existing file; a number is added instead — or copies it to the clipboard, which is how to
move one to a phone. Two switches, both off by default:

- **Include folders** — someone else's vault has other folders.
- **Include location** — where you are, for weather and prayer times.

**Never exported, whatever you choose:** passwords, tokens, server and sync settings, the
encryption password, third-party modules and their settings, and the arrangement of your
dashboard.

**Import** reads a `.json` file from the vault or pasted text. Every setting is checked
against this version of Zenith; anything it doesn't know, or that has the wrong type, is
left out and listed in the preview. A profile from a newer Zenith is still usable for
everything this one understands — unless its format version is newer, in which case the
plugin needs updating first.

## The file

```json
{
  "zenith": "profile",
  "version": 1,
  "name": "My minimum",
  "createdAt": "2026-09-23",
  "modules": ["dashboard", "tasks", "journal"],
  "features": { "tasks.timer": false, "tasks.subtasks": true },
  "settings": { "uiDensity": "compact", "journalTrackers": [] }
}
```

`features` uses the ids from [Features](features.md); `settings` uses the plugin's own
setting names. Plain JSON, meant to be readable and editable by hand.
