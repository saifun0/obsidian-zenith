# Development

[← Documentation](../../README.md) · **English** · [Русский](../ru/development.md)

```bash
npm install        # install dependencies
npm run dev        # watch build → ../zenith/
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit
npm test           # run the vitest unit suite
npm run lint       # eslint
npm run format     # prettier --write
```

The build emits `main.js`, `styles.css`, `manifest.json` and `versions.json` into the
sibling `../zenith/` folder, which is the actual plugin Obsidian loads.

## Optional: Obsidian API lint rules

`eslint-plugin-obsidianmd` (flags deprecated Obsidian APIs) is installed but not enabled by
default — it expects a `manifest.json` at the project root and pulls in type-aware rules.
To use it, copy `manifest.source.json` to `manifest.json` and add its recommended config to
`eslint.config.mjs`.

## Versioning

Bump the version everywhere (manifest, `package.json`, `versions.json`) with:

```bash
npm run version-bump -- 0.2.0        # explicit version
npm run version-bump -- minor        # or a semver keyword: patch|minor|major
npm run version-bump -- 0.2.0 1.4.0  # also set a new minAppVersion
```
