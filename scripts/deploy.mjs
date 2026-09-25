/**
 * deploy — copy the built plugin from ../zenith/ into other vaults.
 *
 * Usage:
 *   node scripts/deploy.mjs          (also run by `npm run build`)
 *
 * The vaults are listed in deploy.local.json, which is kept out of git:
 *   { "vaults": ["E:/Projects/Obsidian/main"] }
 *
 * Only the build is copied — main.js, styles.css, manifest.json and
 * versions.json. Each vault keeps its own data.json, sync state and installed
 * modules, so a deploy never carries settings or credentials from one vault
 * to another. With no deploy.local.json it does nothing.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = resolve(root, '../zenith');
const configPath = resolve(root, 'deploy.local.json');
const FILES = ['main.js', 'styles.css', 'manifest.json', 'versions.json'];

if (!existsSync(configPath)) process.exit(0);

const { vaults = [] } = JSON.parse(readFileSync(configPath, 'utf-8'));
const missing = FILES.filter((f) => !existsSync(resolve(built, f)));
if (missing.length) {
    console.error(`Zenith deploy: ${missing.join(', ')} not built in ../zenith — run the build first.`);
    process.exit(1);
}

for (const vault of vaults) {
    // A vault is a folder with .obsidian in it; anything else is a typo, and
    // creating the folders would hide it.
    if (!existsSync(resolve(vault, '.obsidian'))) {
        console.warn(`Zenith deploy: skipped ${vault} — not an Obsidian vault.`);
        continue;
    }
    const target = resolve(vault, '.obsidian/plugins/zenith');
    mkdirSync(target, { recursive: true });
    for (const f of FILES) copyFileSync(resolve(built, f), resolve(target, f));
    console.log(`Zenith deploy: → ${target}`);
}
