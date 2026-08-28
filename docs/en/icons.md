# Custom icons

[← Documentation](../../README.md) · **English** · [Русский](../ru/icons.md)

Anywhere Zenith takes an icon name — a content type, a journal tracker, a folder, a
dashboard widget, a module manifest — it accepts either a built-in (lucide) name or a
custom id of the form `zi:<source>/<name>`. There are two ways to supply one.

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

**Module-supplied icons.** A module can bring its own artwork so its logo appears next to
its toggle. Drop `icon.svg` beside `main.js` and point the manifest at it:

```json
{ "id": "my-module", "name": "My Module", "icon": "icon.svg" }
```

An `icons/` folder inside the module works the same way (`icons/foo.svg` →
`zi:my-module/foo`). Neither needs any code. For artwork that is generated rather than
shipped, `zenith.registerIcon(name, svg)` returns the id to use, or `null` if the SVG was
rejected. Everything a module registers is removed when it is uninstalled.

**What is accepted.** SVG only — it inherits `currentColor` and stays sharp from 11px to
56px, which a PNG logo does neither of. Every file is sanitized before it is stored:
`<script>`, `<style>`, `<image>`, `<foreignObject>` and links are refused outright (with
the offending element named), `on*` handlers and external `href`s are stripped, and each
icon's internal `id`s are namespaced so two logos cannot fight over a shared
`<linearGradient id="a">`. Files are capped at 64 KB.

Note that this sanitizing is not a security boundary against a hostile *module* — module
code is evaluated with `new Function` and already has the whole app, exactly like any
Obsidian plugin. It is there for icon packs, which are just files a user copied in.
