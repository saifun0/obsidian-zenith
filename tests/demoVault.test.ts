import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- a plain script, run by Node at release time; it has no types of its own.
import * as demo from '../scripts/demoDates.mjs';

/**
 * The demo vault is moved forward when a release is packed, so that it does
 * not age: every date in it, and every file named after one. These are the
 * rules of the move — and, at the end, the vault itself held to what the move
 * and the plugin need of it.
 */

const {
    DEMO_TODAY,
    mondayOf,
    movePeriod,
    settlePeriodNote,
    shiftFor,
    shiftIso,
    shiftName,
    shiftText,
    isoWeek,
    fillDemoDay,
}: {
    DEMO_TODAY: string;
    mondayOf: (iso: string) => string;
    movePeriod: (name: string, from: string, to: string) => { name: string; start: string; end: string } | null;
    settlePeriodNote: (text: string, nameBefore: string, days: number) => string;
    shiftFor: (releaseDay: string, demoToday?: string) => number;
    shiftIso: (iso: string, days: number) => string;
    shiftName: (name: string, days: number) => string;
    shiftText: (text: string, days: number) => string;
    isoWeek: (iso: string) => { year: number; week: number };
    fillDemoDay: (text: string, today: string, lang: string) => string;
} = demo;

describe('moving the demo vault forward', () => {
    it('moves to the day of the release, to the day', () => {
        expect(shiftFor('2026-09-24')).toBe(0);
        expect(shiftFor('2026-09-30')).toBe(6);
        expect(shiftFor('2026-10-12')).toBe(18);
        expect(shiftFor('2027-09-24')).toBe(365);
        for (const day of ['2026-10-12', '2026-12-31', '2027-03-01', '2028-02-29']) {
            expect(shiftIso(DEMO_TODAY, shiftFor(day))).toBe(day);
        }
    });

    it('finds the Monday a week starts on, for the timetable’s cycle', () => {
        expect(mondayOf('2026-10-12')).toBe('2026-10-12');
        expect(mondayOf('2026-10-15')).toBe('2026-10-12');
        expect(mondayOf('2026-10-18')).toBe('2026-10-12');
        expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    });

    it('never moves it back', () => {
        expect(shiftFor('2026-09-01')).toBe(0);
        expect(shiftFor('2020-01-01')).toBe(0);
    });

    it('moves a date across a month and a year', () => {
        expect(shiftIso('2026-09-24', 14)).toBe('2026-10-08');
        expect(shiftIso('2026-12-27', 7)).toBe('2027-01-03');
        expect(shiftIso('2028-02-27', 2)).toBe('2028-02-29');
        expect(shiftIso('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('moves every date in a note, and none that is not the demo’s', () => {
        const task = '- [ ] Pack the books 📅 2026-09-27 ⏰ 09:30-09:45\n- [x] Done ✅ 2026-09-23';
        expect(shiftText(task, 14)).toBe(
            '- [ ] Pack the books 📅 2026-10-11 ⏰ 09:30-09:45\n- [x] Done ✅ 2026-10-07'
        );
        expect(shiftText('see [[2026-09-12]] and 2026-W38', 14)).toBe('see [[2026-09-26]] and 2026-W40');
        // A birthday and a film's release are somebody else's dates.
        expect(shiftText('"date": "1962-10-19", released: 2017-10-06', 14)).toBe(
            '"date": "1962-10-19", released: 2017-10-06'
        );
        // Nothing that only looks like a date.
        expect(shiftText('version 2026-09, id 12026-09-24x, 12:30', 14)).toBe('version 2026-09, id 12026-09-24x, 12:30');
        expect(shiftText(task, 0)).toBe(task);
    });

    it('moves a week’s, a month’s and a year’s note by periods, so "last month" stays last month', () => {
        // Written on 24 September: last week is W38, last month is August.
        // Two weeks on it is 8 October — last week is W40, last month is September.
        expect(shiftName('2026-09-24.md', 14)).toBe('2026-10-08.md');
        expect(shiftName('2026-W38.md', 14)).toBe('2026-W40.md');
        expect(shiftName('2026-08.md', 14)).toBe('2026-09.md');
        expect(shiftName('2026-Q3.md', 14)).toBe('2026-Q4.md');
        expect(shiftName('2026.md', 14)).toBe('2026.md');
        // Six days on it is still September, the same quarter, and the next week.
        expect(shiftName('2026-08.md', 6)).toBe('2026-08.md');
        expect(shiftName('2026-Q3.md', 6)).toBe('2026-Q3.md');
        expect(shiftName('2026-W38.md', 6)).toBe('2026-W39.md');
        // Into the next year.
        expect(shiftName('2026.md', 100)).toBe('2027.md');
        expect(shiftName('2026-08.md', 100)).toBe('2026-12.md');
        expect(shiftName('2026-W38.md', 100)).toBe('2026-W52.md');
        // The links to them move the same way.
        expect(
            shiftText('[[2026-W38]] is last week, [[2026-08]] last month, [[2026]] the year, [[2026-08|Aug]]', 14)
        ).toBe('[[2026-W40]] is last week, [[2026-09]] last month, [[2026]] the year, [[2026-09|Aug]]');
        // A title with a year in it is not a date.
        expect(shiftName('Tax Return 2026.md', 400)).toBe('Tax Return 2026.md');
        expect(shiftName('Photo Book 2025.md', 400)).toBe('Photo Book 2025.md');
        expect(shiftName('Wallpaper night.png', 400)).toBe('Wallpaper night.png');
    });

    it('gives a period’s note the first and last day of the period it moved to', () => {
        const month =
            '---\nreview: month\nstart: 2026-08-01\nend: 2026-08-31\n---\n```zenith-summary\nperiod: month\ndate: 2026-08-01\n```\n';
        expect(settlePeriodNote(shiftText(month, 14), '2026-08.md', 14)).toBe(
            '---\nreview: month\nstart: 2026-09-01\nend: 2026-09-30\n---\n```zenith-summary\nperiod: month\ndate: 2026-09-01\n```\n'
        );
        const week = 'start: 2026-09-14\nend: 2026-09-20\ndate: 2026-09-14\n';
        expect(settlePeriodNote(shiftText(week, 18), '2026-W38.md', 18)).toBe(
            'start: 2026-10-05\nend: 2026-10-11\ndate: 2026-10-05\n'
        );
        // A February in a leap year ends on the 29th.
        expect(movePeriod('2026-08', '2026-09-24', '2028-03-10')).toMatchObject({
            name: '2028-02',
            start: '2028-02-01',
            end: '2028-02-29',
        });
        // A note that is not a period's is left to the days.
        expect(settlePeriodNote('start: 2026-08-01', '2026-09-24.md', 14)).toBe('start: 2026-08-01');
    });

    it('knows the ISO week of a date, at the turn of a year too', () => {
        expect(isoWeek('2026-09-24')).toEqual({ year: 2026, week: 39 });
        expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
        expect(isoWeek('2027-01-03')).toEqual({ year: 2026, week: 53 });
        expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 });
    });

    it('says the demo’s day in words, where a note does', () => {
        expect(fillDemoDay('around {{demo-today}}.', '2026-10-08', 'en')).toBe('around 8 October 2026.');
        expect(fillDemoDay('вокруг {{demo-today}} года', '2026-10-08', 'ru')).toBe('вокруг 8 октября 2026 года');
        expect(fillDemoDay('`{{demo-day:-12}}` opens', '2026-10-08', 'en')).toBe('`26 sep` opens');
        expect(fillDemoDay('`{{demo-day:-12}}`', '2026-10-08', 'ru')).toBe('`26 сен`');
    });
});

describe('the demo vault in the repository', () => {
    const VAULT = join(__dirname, '..', 'demo-vault');
    const files: string[] = [];
    (function walk(dir: string) {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else files.push(path);
        }
    })(VAULT);
    const rel = (f: string) => f.slice(VAULT.length + 1).split('\\').join('/');
    const settings = JSON.parse(
        readFileSync(join(VAULT, '.obsidian', 'plugins', 'zenith', 'data.json'), 'utf8')
    ).settings as Record<string, unknown>;

    it('has its two start notes, each under its own name', () => {
        const top = readdirSync(VAULT);
        expect(top).toContain('Start here.md');
        expect(top).toContain('Начните здесь.md');
        // A name that came through a wrong code page is made of box-drawing characters.
        expect(files.map(rel).filter((f) => /[\u2500-\u257f]/.test(f))).toEqual([]);
    });

    it('holds no build: the plugin’s files are put in when a release is packed', () => {
        const plugin = files.map(rel).filter((f) => f.startsWith('.obsidian/plugins/zenith/'));
        expect(plugin).toEqual(['.obsidian/plugins/zenith/data.json']);
    });

    it('is written around the day the move starts from', () => {
        expect(existsSync(join(VAULT, '15 Journal', 'Daily note', `${DEMO_TODAY}.md`))).toBe(true);
        // Nothing in the journal is dated after it.
        const days = readdirSync(join(VAULT, '15 Journal', 'Daily note')).map((n) => n.replace('.md', ''));
        expect(days.filter((d) => d > DEMO_TODAY)).toEqual([]);
    });

    it('names no weekday beside a date that will move', () => {
        // The move is by days, not by weeks: a note for the 24th that says
        // "it is a Thursday" is wrong on every release day that is not one. A
        // day's note and a task are tied to a date; a review of a week is not.
        const WEEKDAY =
            /\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b|понедельник|вторник|сред[аеуы]\b|четверг|пятниц|суббот|воскресень/i;
        const dated = files.filter((f) => /Daily note\/|Tasks\//.test(rel(f)));
        expect(dated.length).toBeGreaterThan(50);
        const named = dated.flatMap((f) =>
            readFileSync(f, 'utf8')
                .split('\n')
                .filter((line) => WEEKDAY.test(line))
                .map((line) => `${rel(f)}: ${line.trim()}`)
        );
        expect(named).toEqual([]);
    });

    it('reads its tasks from the inbox it shows off', () => {
        // An empty tasks folder means "no folder", not "the whole vault".
        expect(settings.tasksFolderPath).toBe('10 Inbox/Tasks');
        expect(existsSync(join(VAULT, '10 Inbox', 'Tasks', 'Inbox.md'))).toBe(true);
    });

    it('points at pictures that are in it', () => {
        const wallpaper = settings.dashboardBgPath as string;
        expect(existsSync(join(VAULT, ...wallpaper.split('/')))).toBe(true);
        for (const note of files.filter((f) => rel(f).startsWith('30 Content/') && f.endsWith('.md'))) {
            const cover = /^cover:\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(note, 'utf8'))?.[1];
            if (cover) expect(existsSync(join(VAULT, ...cover.split('/'))), `${rel(note)} → ${cover}`).toBe(true);
        }
    });

    it('does not switch on Obsidian’s own Sync, which shows an error to anyone signed out', () => {
        const core = JSON.parse(readFileSync(join(VAULT, '.obsidian', 'core-plugins.json'), 'utf8'));
        expect(Array.isArray(core) ? core.includes('sync') : core.sync).toBe(false);
    });

    it('carries nothing of a real vault', () => {
        const text = files
            .filter((f) => /\.(md|json)$/.test(f))
            .map((f) => readFileSync(f, 'utf8'))
            .join('\n');
        expect(/ставропол|stavropol/i.test(text)).toBe(false);
        expect(/zenith-vault-testing-area|[A-Z]:[\\/]+(Users|Projects)/i.test(text)).toBe(false);
        expect(/(ghp_|github_pat_|xox[bp]-|AIza[0-9A-Za-z_-]{30})/.test(text)).toBe(false);
        // Sync is not set up in it: no tokens, no remote.
        expect(Object.keys(settings).filter((k) => /token|secret|password/i.test(k))).toEqual([]);
    });
});
