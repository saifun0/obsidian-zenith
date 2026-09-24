# Notifications

[← Documentation](../../README.md) · **English** · [Русский](../ru/notifications.md)

Zenith's reminders — prayer times, [tasks](tasks.md#reminders) and the [morning and evening rituals](journal.md#morning-and-evening-rituals) — all go through
one place, *Settings → Notifications*.

## When they appear

A reminder pops up **while Obsidian is open**. Zenith is a plugin, not an alarm clock: it
cannot wake a sleeping computer, and on a phone it cannot use the phone's own notifications
at all — reminders there appear only inside Obsidian. On a computer you can also turn on
**system notifications**, so a reminder reaches you while you are in another window; that
choice is kept per device.

**Quiet hours** stop anything popping up between two hours you choose (22:00 to 07:00 wraps
midnight the way you'd expect). **Only in the center** lists sources that should never pop
up at all. Neither loses anything — see below.

## The center

With the **notification center** on (it is by default), every reminder is recorded, whether
it popped up or not. A bell appears on the dashboard once there is something in it, with the
number you haven't read; the *Open notifications* command opens the same list from anywhere.

Each entry can be **opened** (the note or view it is about), **snoozed** for ten minutes, an
hour or until the same time tomorrow — it disappears and comes back unread — **marked done**
when its source knows how (task reminders will), or **removed**. Closing the center counts
as having read what was in it. Entries are kept for 30 days.

## Nothing is lost

When a reminder's moment passes with nobody there — Obsidian was closed, the computer was
asleep — it is not dropped. The next time Zenith runs, it goes into the center marked
**missed**, without popping up: "it's time for maghrib" two hours after maghrib would be a
wrong statement about the present. Zenith looks back up to three days for these.

A reminder that a change moved into the past — you set it for ten minutes ago — was never
due while it existed, so it is neither shown nor recorded as missed.

With the center switched off there is nowhere to keep a missed reminder, and that is the one
case in which one is dropped.

## Per device

The center's entries are kept on each device, next to its settings but not in them: a
reminder shown on the laptop was not shown on the phone, and reading it on one says nothing
about the other. They are not part of settings sync or of profiles. Quiet hours and silenced
sources are the same on all your devices.
