# Editor

[← Documentation](../../README.md) · **English** · [Русский](../ru/editor.md)

What makes a note nicer to write and to read. For now: code blocks.

## Code blocks

A fenced code block gets:

- a header with the language's icon and name, and the block's title if it has one;
- a stripe down its left side in the language's colour;
- line numbers;
- a copy button in the header, which copies the code without the fences;
- an arrow in the header that folds the block down to the header.

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
  the block, and the header stands in for them. Click into the code and they come back, so you
  can change the language or the title. With folding switched off, a click on the header does
  the same.
- **Titles and folding.** After the language, `-` starts the block folded and `+` starts it
  open, whatever the default. Anything after that is the block's title, shown as
  *HTML - Title*:

  | After the fence | Header | Starts |
  | --- | --- | --- |
  | ```` ```html ```` | HTML | as set |
  | ```` ```html Skeleton ```` | HTML - Skeleton | as set |
  | ```` ```html - Skeleton ```` | HTML - Skeleton | folded |
  | ```` ```html + ```` | HTML | open |

  The marker counts only on its own, so `c++` and `objective-c` are still languages. Notes
  written for Code Styler keep their titles: `title:"…"` and `fold` are read too.

  The arrow, or a click anywhere on the header, folds and opens the block. That lasts while the
  note is open, and the note itself is not changed. In Live Preview a folded block hides its
  fences too, and the cursor steps over it; a search result inside it opens it.
- **Other blocks.** Blocks another plugin draws — `dataview`, `mermaid`, `query` and the like —
  are left alone.

## Settings

*Settings → Editor*:

- **Features:** styled code blocks as a whole, line numbers, folding, language icons, colour
  stripe. Each can be switched off.
- **Blocks start:** open, folded, or folded when long (more lines than you set, 30 to begin
  with). This is for blocks with no `+` or `-` of their own.

### Code Styler

[Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) does the same job, and two
plugins drawing one block would draw it twice. While Code Styler is on, Zenith leaves code
blocks to it, and its settings page says so. Switch Code Styler off in *Settings → Community
plugins* to use Zenith's.

The language names, colours and icons come from Code Styler (MIT), whose icons come from
[vscode-icons](https://github.com/vscode-icons/vscode-icons) (MIT).
