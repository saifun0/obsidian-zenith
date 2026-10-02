# Development

[← Documentation](../../README.md) · **English** · [Русский](../ru/development.md)

```bash
npm install            # install dependencies
npm run dev            # watch build into the dev vault (see below)
npm run build          # typecheck + production build, then deploy
npm run deploy         # copy the last build into the other vaults
npm run clean          # remove the built main.js and styles.css
npm run typecheck      # tsc --noEmit
npm test               # run the vitest unit suite
npm run lint           # eslint
npm run lint:obsidian  # Obsidian's own rules (type-aware, slow)
npm run format         # prettier --write
```

## Where the build goes

The repository lives outside every vault. Its root holds `manifest.json`, the file the
community directory reads, and inside `.obsidian/plugins/` Obsidian would take the folder for
a second Zenith.

Where builds go is set in `deploy.local.json` (not in git):

```json
{
    "devVault": "E:/Projects/Obsidian/zenith-vault-testing-area",
    "vaults": ["E:/Projects/Obsidian/main"]
}
```

- **`devVault`.** esbuild writes `main.js`, `styles.css`, `manifest.json` and `versions.json`
  straight into its `.obsidian/plugins/zenith/`, so `npm run dev` lands where Obsidian (and Hot
  Reload) picks it up.
- **`vaults`.** `npm run build` then copies those four files into each of these too. Each vault
  keeps its own `data.json`, sync state and icon packs. `npm run dev` does not deploy.

Without `deploy.local.json` the build goes to `dist/`.

## Obsidian's lint rules

`npm run lint:obsidian` runs the recommended set of `eslint-plugin-obsidianmd`: deprecated and
unsupported APIs, command naming, settings headings, and the typescript-eslint type-checked
rules it bundles. The community directory's review is built on it. It type-checks the whole
project, so it takes about half a minute, and it is not part of `npm run build`.

`npm run lint:types` is a wider type-aware pass, for reading rather than gating: its
`require-await` findings are async methods that satisfy an interface, and are left on view.

## Checks on GitHub

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: `tsc`,
`npm run lint`, `npm run lint:obsidian`, `npm test` and a production build, whose `main.js`,
`manifest.json` and `styles.css` are kept as the run's artifact. It does not release anything;
see below.

Most tests run in Node. A test that needs a real DOM — a `MutationObserver`, a React render —
says so in its first line with `// @vitest-environment happy-dom`.

## Versioning

Bump the version everywhere (manifest, `package.json`, `versions.json`) with:

```bash
npm run version-bump -- 0.2.0        # explicit version
npm run version-bump -- minor        # or a semver keyword: patch|minor|major
npm run version-bump -- 0.2.0 1.4.0  # also set a new minAppVersion
```

Then commit the bump as `Release <version>`, get it onto `main`, and run the **Release**
workflow (Actions → Release → Run workflow) with the version and the notes. It refuses a
version that is not the one in `manifest.json`, runs the types and the tests, builds, and
publishes `main.js`, `manifest.json`, `styles.css`, `zenith-<version>.zip` and
`zenith-demo-vault-<version>.zip` — the previous release's demo vault with the new build in it.
A demo vault that should itself change is attached to the release by hand afterwards.
