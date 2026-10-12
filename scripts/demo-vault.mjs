// Builds the demo vault that goes out with a release, from `demo-vault/` in the repository.
//
//   node scripts/demo-vault.mjs --out <dir> [--date YYYY-MM-DD] [--build <dir>]
//
// Writes `<dir>/zenith-demo-vault/`: the notes and settings from the repository, moved forward so that the demo's
// "today" is the day of the release (see demoDates.mjs), and — with --build — the plugin's own three files
// put where Obsidian looks for them. `--date` is the day of the release; today, if not given.
//
// The vault used to be carried from one release's archive into the next. Unpacked and packed again on a machine
// with another idea of file names, it had its Russian start note renamed to mojibake, and everything in it stayed
// dated the week it was first written. Built from the repository, it is whatever the repository says.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_TODAY, fillDemoDay, mondayOf, shiftFor, shiftIso, shiftName, shiftText } from './demoDates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'demo-vault');

const args = process.argv.slice(2);
const arg = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
};
const out = arg('--out');
if (!out) {
    console.error('usage: node scripts/demo-vault.mjs --out <dir> [--date YYYY-MM-DD] [--build <dir>]');
    process.exit(1);
}
const now = new Date();
const releaseDay =
    arg('--date') ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
if (!/^\d{4}-\d\d-\d\d$/.test(releaseDay)) throw new Error(`not a date: ${releaseDay}`);

const days = shiftFor(releaseDay);
const today = shiftIso(DEMO_TODAY, days);
const vault = join(resolve(out), 'zenith-demo-vault');
rmSync(vault, { recursive: true, force: true });

/**
 * The one setting a move by days leaves wrong. The timetable's two-week cycle counts weeks from an anchor, and the
 * notes say "this week is Week A": moved with everything else, the anchor can land in the week before today's and
 * make it Week B. It is put on the Monday of the demo's own week instead.
 */
function settled(json) {
    const data = JSON.parse(json);
    if (data.settings?.studyWeekAnchor) data.settings.studyWeekAnchor = mondayOf(today);
    return JSON.stringify(data, null, 2) + '\n';
}

const TEXT = /\.(md|json|txt|canvas)$/i;
const CYRILLIC = /[а-яё]/i;
const written = new Set();
let renamed = 0;

(function walk(dir) {
    for (const name of readdirSync(dir)) {
        const from = join(dir, name);
        if (statSync(from).isDirectory()) {
            walk(from);
            continue;
        }
        const moved = shiftName(name, days);
        if (moved !== name) renamed++;
        const to = join(vault, relative(source, dir), moved);
        // Two notes named after different times must not land on one name.
        if (written.has(to)) throw new Error(`two files would become ${relative(vault, to)}`);
        written.add(to);
        mkdirSync(dirname(to), { recursive: true });
        if (!TEXT.test(name)) {
            copyFileSync(from, to);
            continue;
        }
        let text = fillDemoDay(shiftText(readFileSync(from, 'utf8'), days), today, CYRILLIC.test(name) ? 'ru' : 'en');
        if (to.endsWith(join('plugins', 'zenith', 'data.json'))) text = settled(text);
        writeFileSync(to, text);
    }
})(source);

const build = arg('--build');
if (build) {
    const plugin = join(vault, '.obsidian', 'plugins', 'zenith');
    mkdirSync(plugin, { recursive: true });
    for (const file of ['main.js', 'manifest.json', 'styles.css']) {
        const from = join(resolve(build), file);
        if (!existsSync(from)) throw new Error(`no ${file} in ${build}`);
        copyFileSync(from, join(plugin, file));
    }
}

console.log(
    `demo vault → ${vault}\n  ${written.size} files, ${renamed} renamed; moved ${days} days: its today is ${today}` +
        (build ? '; with the build' : '')
);
