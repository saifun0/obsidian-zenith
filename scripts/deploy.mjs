/**
 * deploy — copy the built plugin into the other vaults.
 *
 * Usage:
 *   node scripts/deploy.mjs          (also run by `npm run build`)
 *
 * The vaults are `vaults` in deploy.local.json (see scripts/paths.mjs); the
 * build is copied from wherever esbuild wrote it, the dev vault or `dist/`.
 *
 * Only the build is copied — main.js, styles.css, manifest.json and
 * versions.json. Each vault keeps its own data.json, sync state and icon packs,
 * so a deploy never carries settings or credentials from one vault to another.
 * With no vaults listed it does nothing.
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { isVault, outputDir, pluginDir, vaults } from './paths.mjs';

const FILES = ['main.js', 'styles.css', 'manifest.json', 'versions.json'];

if (vaults.length === 0) process.exit(0);

const missing = FILES.filter((f) => !existsSync(resolve(outputDir, f)));
if (missing.length) {
    console.error(`Zenith deploy: ${missing.join(', ')} not built in ${outputDir} — run the build first.`);
    process.exit(1);
}

for (const vault of vaults) {
    if (!isVault(vault)) {
        console.warn(`Zenith deploy: skipped ${vault} — not an Obsidian vault.`);
        continue;
    }
    const target = pluginDir(vault);
    // The dev vault has the build already: esbuild wrote it there.
    if (target === outputDir) continue;
    mkdirSync(target, { recursive: true });
    for (const f of FILES) copyFileSync(resolve(outputDir, f), resolve(target, f));
    console.log(`Zenith deploy: → ${target}`);
}
