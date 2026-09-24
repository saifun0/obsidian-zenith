# Zenith

**English** · [Русский](README.ru.md)

An all-in-one life organizer for [Obsidian](https://obsidian.md): a **Dashboard**, a
**Tasks** manager, a **Journal** of daily notes, and a **Content** tracker (books, movies,
shows, games…), built on a modular architecture so features can be toggled on and off — and
extended by third-party modules — without leaving your vault.

Your data stays as plain Markdown in your vault. Zenith reads and writes ordinary `.md`
files; there is no hidden database.

---

## Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | Greeting, clock, weather, quick-add, and per-module summary widgets. |
| **Navigation** | A launcher widget with a button for every Zenith view — extendable by any module. |
| **Tasks** | Parse, filter, search, group, create, edit, complete and delete tasks. |
| **Journal** | Daily notes on a calendar, with configurable habit / scale / number tracking and the day's tasks. |
| **Content** | Gallery + stats for tracked media: half-star ratings, statuses, progress, covers from the vault or a link, and import from MyAnimeList / Goodreads / Letterboxd. Works offline. |
| **Prayer** | Prayer times computed on the device, a countdown to the next one, and a record of what you prayed — kept in the daily note. |
| **Media Banner** | Show a GIF/image (from the vault or a URL) above the file-explorer tree, with a picker. |

Enable or disable modules in **Settings → Active Modules**. Modules load and unload
instantly — no Obsidian restart required.

---

## Documentation

### Using Zenith

| Page | What is in it |
| --- | --- |
| [Features](docs/en/features.md) | Switching off what you don't use, module by module. |
| [Profiles](docs/en/profiles.md) | Templates, saving and undoing a setup, export and import. |
| [Notifications](docs/en/notifications.md) | Reminders, what happens to the ones you miss, quiet hours. |
| [Dashboard](docs/en/dashboard.md) | Opening on startup, period progress, countdowns, life in weeks. |
| [Vault helpers](docs/en/vault.md) | Folder and file icons, and the vault structure scaffold. |
| [Tasks](docs/en/tasks.md) | The task format: priorities, dates, tags, projects, and how ordering is stored. |
| [Journal](docs/en/journal.md) | Daily notes, habit / scale / number tracking, templates, and captured tasks. |
| [Prayer](docs/en/prayer.md) | Prayer times computed on the device, and what the daily note records. |
| [Content](docs/en/content.md) | The content format, the library, and importing from MyAnimeList, Goodreads and Letterboxd. |
| [Language](docs/en/language.md) | How Zenith picks a language, and how a module brings its own strings. |
| [Custom icons](docs/en/icons.md) | Icon packs, module artwork, and what an SVG has to survive to be accepted. |

### Sync and privacy

| Page | What is in it |
| --- | --- |
| [Privacy](docs/en/privacy.md) | What leaves the device, and when. |
| [Setting up Dropbox](docs/en/dropbox.md) | Connecting Dropbox, and registering your own app if you would rather. |
| [Encrypted sync](docs/en/encryption.md) | The format, the key derivation, and what the server still learns. |

### Building on Zenith

| Page | What is in it |
| --- | --- |
| [Module API](docs/en/module-api.md) | Writing a module: the interface, dashboard widgets, launcher buttons, third-party modules. |
| [Development](docs/en/development.md) | Building, testing, linting and versioning this repository. |

---

## License

[MIT](LICENSE) © Saifun
