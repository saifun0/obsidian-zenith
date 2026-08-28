# Language

[← Documentation](../../README.md) · **English** · [Русский](../ru/language.md)

Zenith's own interface follows **Settings → General → Language** (`Automatic` tracks
Obsidian's). English and Russian ship in `src/core/i18n.ts`; counted nouns go through a
plural helper, so Russian gets its one/few/many forms rather than a number glued to a
singular.

## Modules bring their own strings

A module's name and description are written by whoever wrote the module, so they cannot
live in the plugin dictionary — there is no file in this repository for a stranger's
strings. Instead a module contributes a chunk of its own, and every list of modules looks
for two keys before falling back to the untranslated manifest text:

```
module.<id>.name
module.<id>.desc
```

Built-in modules declare theirs in `src/modules/<id>/i18n.ts` and return it from
`getTranslations()`. A third-party module does exactly the same — the mechanism is one
mechanism, so it cannot rot on the path only outsiders take:

```ts
getTranslations() {
    return {
        en: { 'module.my-module.name': 'My Module', 'my-module.greeting': 'Hello' },
        ru: { 'module.my-module.name': 'Мой модуль', 'my-module.greeting': 'Привет' },
    };
}
```

Keys must sit under the module's own namespace (`<id>.…` or `module.<id>.…`); anything
else is dropped with a warning. A module that could redefine `settings.title` could also
redefine the sentence warning you about that module.

Strings can also go straight into `manifest.json`, and for the name and description that
is the better place — the settings list shows modules that are switched **off**, whose code
has never run, and what you read there is what you decide by:

```json
{
  "id": "my-module",
  "name": "My Module",
  "translations": {
    "ru": { "module.my-module.name": "Мой модуль", "module.my-module.desc": "Делает всякое." }
  }
}
```

Both channels are kept, so loading a module does not discard what its manifest already
said, and unloading one leaves its row still named. For strings that are generated rather
than shipped there is `zenith.registerTranslations(table)`, removed on unload like anything
else a module registers.

Lookup order is Zenith's own string for the locale, then a contributed one, then English of
each in turn. A module cannot take a key Zenith already answers in that language, but it
*can* supply the Russian for one Zenith only has in English.
