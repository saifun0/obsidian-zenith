/**
 * paths — where a build goes, read from deploy.local.json (kept out of git:
 * the paths are one machine's).
 *
 *   {
 *     "devVault": "E:/Projects/Obsidian/zenith-vault-testing-area",
 *     "vaults": ["E:/Projects/Obsidian/main"]
 *   }
 *
 * `devVault` is the vault esbuild writes into, its `.obsidian/plugins/zenith/`,
 * so `npm run dev` lands where Obsidian (and Hot Reload) picks it up. Without
 * one the build goes to `dist/` here. `vaults` are the others `npm run build`
 * copies the finished build into (scripts/deploy.mjs).
 *
 * The repository lives outside every vault: a `manifest.json` at its root is
 * what the community directory reads, and inside `.obsidian/plugins/` Obsidian
 * would take that folder for a second Zenith.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const configPath = resolve(root, 'deploy.local.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};

/** Where Zenith lives in a vault. */
export const pluginDir = (vault) => resolve(vault, '.obsidian/plugins/zenith');

/** A vault is a folder with `.obsidian` in it; anything else is a typo, and creating folders would hide it. */
export const isVault = (path) => existsSync(resolve(path, '.obsidian'));

if (config.devVault && !isVault(config.devVault)) {
    console.error(`Zenith: devVault ${config.devVault} is not an Obsidian vault (no .obsidian in it).`);
    process.exit(1);
}

export const outputDir = config.devVault ? pluginDir(config.devVault) : resolve(root, 'dist');

export const vaults = Array.isArray(config.vaults) ? config.vaults : [];
