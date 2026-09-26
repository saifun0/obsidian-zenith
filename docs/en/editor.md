# Editor

[← Documentation](../../README.md) · **English** · [Русский](../ru/editor.md)

What makes a note nicer to write and to read. For now: code blocks.

## Code blocks

A fenced code block gets:

- a header with the language's icon and name;
- a stripe down its left side in the language's colour;
- line numbers;
- a copy button in the header, which copies the code without the fences.

The same in reading view and in Live Preview. Source mode shows the note as plain text, as
before.

````markdown
```html
<p>Hello</p>
```
````

- **Languages.** The word after the fence decides the language, in any case: `html`, `HTML`,
  `js`, `py`, `ts`, `sh`, `bash`, `rs`, `c++` and the rest. Over 300 words are known, and about
  170 languages have an icon and a colour. A word Zenith does not know is shown as written,
  with a plain icon. A block with no word is shown as *Text*.
- **Highlighting** is Obsidian's own, in your theme's colours. Zenith doesn't recolour code.
- **Long lines** in reading view stay on one line, and the block scrolls sideways, so every
  number stays level with its line. The numbers stay put while it scrolls. In Live Preview,
  long lines wrap as the rest of the note does.
- **Editing.** In Live Preview, the fences (```` ``` ````) are hidden while you aren't working in
  the block, and the header stands in for them. Click into the block, or on its header, and
  they come back, so you can change the language.
- **Other blocks.** Blocks another plugin draws — `dataview`, `mermaid`, `query` and the like —
  are left alone.

Switch it off, or just the numbers, in *Settings → Editor → Features*.

### Code Styler

[Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) does the same job, and two
plugins drawing one block would draw it twice. While Code Styler is on, Zenith leaves code
blocks to it, and its settings page says so. Switch Code Styler off in *Settings → Community
plugins* to use Zenith's.

The language names, colours and icons come from Code Styler (MIT), whose icons come from
[vscode-icons](https://github.com/vscode-icons/vscode-icons) (MIT).
