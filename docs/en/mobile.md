# On a phone

[← Documentation](../../README.md) · **English** · [Русский](../ru/mobile.md)

## Screen edges

A phone keeps the top of the screen for its camera and status bar. Obsidian keeps the bottom
for its buttons. Zenith's views stay clear of both: the first card starts below the camera,
and the last one scrolls to above the buttons, not under them.

**Automatic** (the default) measures what actually covers each view:
- the safe-area insets that Obsidian and the phone report;
- a view header drawn over the view;
- Obsidian's bottom buttons.

A view gets exactly the part that covers it. Where Obsidian already keeps a view clear, which
is the usual case with the view header shown, nothing changes. The dashboard's wallpaper still
reaches the screen's edges; only the cards step back. Dialogs, sheets and the image viewer
keep clear of the camera and the gesture bar.

**By hand**, in *Settings → Appearance → Phone → Screen edges*, you give how tall each band
is from the screen's edge. Use it if a view still slips under the camera or the buttons on
your phone. It applies in portrait, on this device only: it is not synced, and profiles
leave it alone.

The **Now** row above it shows what was measured: how much the system keeps at the top and
bottom, how tall Obsidian's buttons are, and how far the views moved. The command *Check
device capabilities* lists the same numbers.
