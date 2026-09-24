# On a phone

[← Documentation](../../README.md) · **English** · [Русский](../ru/mobile.md)

## Screen edges

A phone keeps the top of the screen for its camera and status bar. Obsidian keeps the bottom
for its buttons. Zenith's views open clear of both: the first card starts below the camera and
Obsidian's header, and the last one scrolls to above the buttons. The space is only for
layout, not a band: whatever you scroll past goes on under the header and the buttons, as
in a note — faded at the top and seen around the buttons when Obsidian's navigation floats. On a phone the sides are narrower too, 12px.

## Hiding on scroll

Zenith's views hand their scrolling to Obsidian the way a note does. Scroll down and the
header and buttons slide away; scroll up, or tap, and they come back. This follows Obsidian's
own setting for it, *Full screen* ("automatically hide interface elements while reading"),
found in Obsidian's settings on a phone: with that off, they stay.

**Automatic** (the default) measures what actually covers each view:
- the safe-area insets that Obsidian and the phone report;
- a view header drawn over the view;
- Obsidian's bottom buttons.

A view gets exactly the part that covers it. Where Obsidian already keeps a view clear, which
is the usual case with the view header shown, nothing changes. The dashboard's wallpaper still
reaches the screen's edges; only the cards step back. Dialogs, sheets and the image viewer
keep clear of the camera and the gesture bar. Zenith's settings page starts below the back and
close buttons Obsidian floats over it; under a Dynamic Island they reach well past the status
bar.

**By hand**, in *Settings → Appearance → Phone → Screen edges*, you give how tall each band
is from the screen's edge. Use it if a view still slips under the camera or the buttons on
your phone. It applies in portrait, on this device only: it is not synced, and profiles
leave it alone.

The **Now** row above it shows what was measured: how much the system keeps at the top and
bottom, how tall Obsidian's buttons are, and how far the views moved. The command *Check
device capabilities* lists the same numbers.
