/**
 * version-bump — keep manifest.json, package.json and versions.json in sync.
 *
 * Usage:
 *   node scripts/version-bump.mjs <version> [minAppVersion]
 *   node scripts/version-bump.mjs patch|minor|major [minAppVersion]
 *
 * Examples:
 *   node scripts/version-bump.mjs 0.2.0
 *   node scripts/version-bump.mjs minor
 *   node scripts/version-bump.mjs 0.2.0 1.4.0
 *
 * Writes the resolved version into manifest.json and package.json, and
 * records `{ [version]: minAppVersion }` in versions.json (used by Obsidian to
 * offer the right plugin build per app version).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));
const write = (p, obj) => writeFileSync(resolve(root, p), JSON.stringify(obj, null, 4) + '\n');

const manifest = read('manifest.json');
const pkg = read('package.json');
const versions = read('versions.json');

const arg = process.argv[2];
if (!arg) {
    console.error('Usage: node scripts/version-bump.mjs <version|patch|minor|major> [minAppVersion]');
    process.exit(1);
}

/** Resolve the next version from an explicit value or a semver bump keyword. */
function resolveVersion(current, input) {
    if (/^\d+\.\d+\.\d+/.test(input)) return input;
    const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10) || 0);
    switch (input) {
        case 'major': return `${major + 1}.0.0`;
        case 'minor': return `${major}.${minor + 1}.0`;
        case 'patch': return `${major}.${minor}.${patch + 1}`;
        default:
            console.error(`Invalid version/keyword: "${input}"`);
            process.exit(1);
    }
}

const newVersion = resolveVersion(manifest.version, arg);
const minAppVersion = process.argv[3] || manifest.minAppVersion;

manifest.version = newVersion;
manifest.minAppVersion = minAppVersion;
pkg.version = newVersion;
versions[newVersion] = minAppVersion;

write('manifest.json', manifest);
write('package.json', pkg);
write('versions.json', versions);

console.log(`Zenith: bumped to ${newVersion} (minAppVersion ${minAppVersion}).`);
