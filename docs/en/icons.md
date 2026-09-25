# Custom icons

[← Documentation](../../README.md) · **English** · [Русский](../ru/icons.md)

Anywhere Zenith takes an icon name — a content type, a journal tracker, a folder, a
side-panel button — it accepts either a built-in (lucide) name or a custom id of the form
`zi:<pack>/<name>`, from an icon pack.

**Icon packs.** Put a folder of `.svg` files in the plugin's `icons/` folder:

```
icons/
  acme/
    pack.json     ← optional: { "name": "Acme Icons", "author": "Acme Inc" }
    logo.svg      → zi:acme/logo
    mark.svg      → zi:acme/mark
```

They appear at the top of every icon picker, above the built-in set. **Settings →
Appearance → Icon packs** lists what loaded, and — more usefully — names any file that was
rejected and why. Loose files rather than a manifest is deliberate: the common case is
unzipping something you downloaded.

**What is accepted.** SVG only — it inherits `currentColor` and stays sharp from 11px to
56px, which a PNG logo does neither of. Every file is sanitized before it is stored:
`<script>`, `<style>`, `<image>`, `<foreignObject>` and links are refused outright (with
the offending element named), `on*` handlers and external `href`s are stripped, and each
icon's internal `id`s are namespaced so two logos cannot fight over a shared
`<linearGradient id="a">`. Files are capped at 64 KB.

The sanitizing is there because an icon pack is just files a user copied in from the
internet.
