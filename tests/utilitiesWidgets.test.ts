import { describe, it, expect } from 'vitest';
import {
    DEFAULT_TEXT_SETTINGS,
    NOTE_LIMIT,
    normalizeTextSettings,
    noteBody,
    noteName,
    textState,
} from '../src/modules/utilities/textSource';
import {
    linkLabel,
    linkPath,
    normalizeLinksSettings,
    parseLink,
} from '../src/modules/utilities/links';
import {
    RECENT_LIMIT,
    normalizeRecentSettings,
    recentlyModified,
    recentlyOpened,
} from '../src/modules/utilities/recent';
import {
    CAPTURED_SHOWN,
    captureLine,
    capturePath,
    captureTarget,
    fileInDailyNote,
    normalizeCaptureSettings,
    withCaptured,
} from '../src/modules/utilities/capture';
import {
    DEFAULT_TIMER_SETTINGS,
    TIMER_DONE_MS,
    TIMER_MAX_MINUTES,
    clampMinutes,
    formatClock,
    normalizeTimerSettings,
    timerEvents,
    timerSignature,
    timerState,
} from '../src/modules/utilities/timer';

/**
 * The utility cards, as data.
 *
 * Each card's decisions live in a file with no Obsidian in it, and each is
 * fed something a user typed or something read back from `data.json`. These
 * are the cases that are awkward to see on a board: a half-filled setting, an
 * address that must not be opened, a note with frontmatter, a timer that ran
 * out while nobody was looking.
 */

// ── Text ─────────────────────────────────────────────

describe('text card — what it shows', () => {
    it('is empty until something is typed', () => {
        expect(textState(DEFAULT_TEXT_SETTINGS)).toEqual({ kind: 'empty' });
        expect(textState({ ...DEFAULT_TEXT_SETTINGS, text: '  \n ' })).toEqual({ kind: 'empty' });
    });

    it('shows the words as typed, not trimmed', () => {
        const state = textState({ ...DEFAULT_TEXT_SETTINGS, text: '- one\n- two\n' });
        expect(state).toEqual({ kind: 'own', markdown: '- one\n- two\n' });
    });

    it('is empty for a note source with no note chosen, whatever was typed before', () => {
        const state = textState({ ...DEFAULT_TEXT_SETTINGS, textSource: 'note', text: 'kept' });
        expect(state).toEqual({ kind: 'empty' });
    });

    it('names the note to read', () => {
        const state = textState({
            ...DEFAULT_TEXT_SETTINGS,
            textSource: 'note',
            textPath: ' Goals/2026.md ',
        });
        expect(state).toEqual({ kind: 'note', path: 'Goals/2026.md' });
    });
});

describe('text card — settings read back from data.json', () => {
    it('gives the defaults for a card nobody has set up', () => {
        expect(normalizeTextSettings(undefined)).toEqual(DEFAULT_TEXT_SETTINGS);
    });

    it('falls back field by field rather than throwing', () => {
        expect(
            normalizeTextSettings({
                textSource: 'web',
                text: 7,
                textSize: 'huge',
                textAlign: 'center',
            })
        ).toEqual({ ...DEFAULT_TEXT_SETTINGS, textAlign: 'center' });
    });
});

describe('text card — a note’s text', () => {
    it('drops the frontmatter', () => {
        expect(noteBody('---\ntags: [a]\n---\n# Goals\n\nRun.')).toBe('# Goals\n\nRun.');
    });

    it('drops empty frontmatter and Windows line endings', () => {
        expect(noteBody('---\n---\nBody')).toBe('Body');
        expect(noteBody('---\r\nkey: v\r\n---\r\nBody\r\n')).toBe('Body');
    });

    it('leaves a rule in the middle of a note alone', () => {
        expect(noteBody('Above\n\n---\n\nBelow')).toBe('Above\n\n---\n\nBelow');
    });

    it('does not take a note that merely starts with a rule for frontmatter', () => {
        expect(noteBody('---\nNo closing line here')).toBe('---\nNo closing line here');
    });

    it('cuts a long note at a line and says there is more', () => {
        const line = 'word '.repeat(20).trim();
        const long = Array.from({ length: 400 }, () => line).join('\n');
        const body = noteBody(long);
        expect(body.length).toBeLessThanOrEqual(NOTE_LIMIT + 4);
        expect(body.endsWith('\n\n…')).toBe(true);
        // Whole lines only: nothing is cut mid-word.
        expect(
            body
                .slice(0, -3)
                .split('\n')
                .every((l) => l === line)
        ).toBe(true);
    });

    it('names a note by its file', () => {
        expect(noteName('Goals/2026.md')).toBe('2026');
        expect(noteName('Inbox')).toBe('Inbox');
    });
});

// ── Links ────────────────────────────────────────────

describe('links card — reading what was typed', () => {
    it('skips a row still being typed', () => {
        expect(parseLink('   ')).toEqual({ kind: 'empty' });
        expect(parseLink('[[ ]]')).toEqual({ kind: 'empty' });
    });

    it('takes web, mail and Obsidian addresses', () => {
        expect(parseLink('https://example.com/a?b=1')).toEqual({
            kind: 'url',
            href: 'https://example.com/a?b=1',
        });
        expect(parseLink('mailto:me@example.com').kind).toBe('url');
        expect(parseLink('obsidian://open?vault=x').kind).toBe('url');
    });

    it('refuses every other scheme rather than opening it', () => {
        expect(parseLink('javascript:alert(1)')).toEqual({ kind: 'refused' });
        expect(parseLink('file:///etc/passwd')).toEqual({ kind: 'refused' });
        expect(parseLink('data:text/html,<b>x</b>')).toEqual({ kind: 'refused' });
    });

    it('reads a path, a bare name and a wikilink as a note', () => {
        expect(parseLink('Projects/Zenith.md')).toEqual({
            kind: 'vault',
            linktext: 'Projects/Zenith.md',
        });
        expect(parseLink('Zenith')).toEqual({ kind: 'vault', linktext: 'Zenith' });
        expect(parseLink('[[Zenith#Roadmap|the plan]]')).toEqual({
            kind: 'vault',
            linktext: 'Zenith#Roadmap',
        });
    });

    it('does not mistake a heading with a colon for a scheme', () => {
        expect(parseLink('Notes#Time: now').kind).toBe('vault');
    });

    it('asks the vault for the note, not for the heading', () => {
        expect(linkPath('Zenith#Roadmap')).toBe('Zenith');
        expect(linkPath('Projects/Zenith.md')).toBe('Projects/Zenith.md');
    });
});

describe('links card — what a row is called', () => {
    it('uses the name the user gave', () => {
        expect(linkLabel({ target: 'https://example.com', label: ' Mail ' })).toBe('Mail');
    });

    it('names a note by its file, with the heading after it', () => {
        expect(linkLabel({ target: 'Projects/Zenith.md', label: '' })).toBe('Zenith');
        expect(linkLabel({ target: '[[Zenith#Roadmap]]', label: '' })).toBe('Zenith › Roadmap');
    });

    it('names an address by its host', () => {
        expect(linkLabel({ target: 'https://www.example.com/docs/page', label: '' })).toBe(
            'example.com'
        );
        expect(linkLabel({ target: 'mailto:me@example.com?subject=Hi', label: '' })).toBe(
            'me@example.com'
        );
    });

    it('shows a refused address as typed', () => {
        expect(linkLabel({ target: ' javascript:alert(1) ', label: '' })).toBe(
            'javascript:alert(1)'
        );
    });
});

describe('links card — settings read back from data.json', () => {
    it('drops what is not a row and keeps the rest in order', () => {
        const raw = {
            links: [
                { target: 'A', label: 'a' },
                null,
                'B',
                { label: 'no target' },
                { target: 'C', label: 5 },
            ],
        };
        expect(normalizeLinksSettings(raw).links).toEqual([
            { target: 'A', label: 'a' },
            { target: 'C', label: '' },
        ]);
    });

    it('is an empty list for anything that is not one', () => {
        expect(normalizeLinksSettings(undefined).links).toEqual([]);
        expect(normalizeLinksSettings({ links: 'A, B' }).links).toEqual([]);
    });
});

// ── Recent notes ─────────────────────────────────────

describe('recent notes', () => {
    const files = [
        { path: 'Old.md', mtime: 100 },
        { path: 'Projects/Zenith.md', mtime: 300 },
        { path: 'Journal/2026-10-08.md', mtime: 200 },
    ];

    it('lists what was written last, newest first', () => {
        expect(recentlyModified(files, 2)).toEqual([
            { path: 'Projects/Zenith.md', name: 'Zenith', folder: 'Projects', mtime: 300 },
            { path: 'Journal/2026-10-08.md', name: '2026-10-08', folder: 'Journal', mtime: 200 },
        ]);
    });

    it('does not reorder the list it was given', () => {
        const before = files.map((f) => f.path);
        recentlyModified(files, 3);
        expect(files.map((f) => f.path)).toEqual(before);
    });

    it('keeps the workspace’s order for what was opened, and skips what is gone', () => {
        const byPath = new Map(files.map((f) => [f.path, f]));
        const opened = recentlyOpened(
            ['Old.md', 'Deleted.md', 'Projects/Zenith.md', 'Old.md'],
            (path) => byPath.get(path) ?? null,
            5
        );
        expect(opened.map((e) => e.path)).toEqual(['Old.md', 'Projects/Zenith.md']);
    });

    it('stops at the limit', () => {
        const byPath = new Map(files.map((f) => [f.path, f]));
        const lookup = (path: string) => byPath.get(path) ?? null;
        expect(
            recentlyOpened(
                files.map((f) => f.path),
                lookup,
                1
            )
        ).toHaveLength(1);
        expect(recentlyModified(files, 0)).toEqual([]);
    });

    it('asks for more rows the wider the card', () => {
        expect(RECENT_LIMIT.sm).toBeLessThan(RECENT_LIMIT.md);
        expect(RECENT_LIMIT.md).toBeLessThan(RECENT_LIMIT.lg);
    });

    it('shows changed notes unless told otherwise', () => {
        expect(normalizeRecentSettings(undefined).recentBy).toBe('modified');
        expect(normalizeRecentSettings({ recentBy: 'opened' }).recentBy).toBe('opened');
        expect(normalizeRecentSettings({ recentBy: 'starred' }).recentBy).toBe('modified');
    });
});

// ── Quick note ───────────────────────────────────────

describe('quick note — the line that is written', () => {
    const at = new Date(2026, 9, 8, 9, 5);

    it('is a list item with the hour in front', () => {
        expect(captureLine('  call the bank ', at, true)).toBe('- 09:05 call the bank');
    });

    it('leaves the hour out when asked', () => {
        expect(captureLine('call the bank', at, false)).toBe('- call the bank');
    });

    it('folds a pasted paragraph into one line', () => {
        expect(captureLine('one\n  two\r\nthree', at, false)).toBe('- one two three');
    });

    it('keeps a task or a list item typed as one, with no second dash and no hour', () => {
        expect(captureLine('- [ ] buy milk', at, true)).toBe('- [ ] buy milk');
        expect(captureLine('* idea', at, true)).toBe('* idea');
        expect(captureLine('1. first', at, true)).toBe('1. first');
    });

    it('does not take a dash inside a sentence for a list', () => {
        expect(captureLine('-5 degrees today', at, false)).toBe('- -5 degrees today');
    });

    it('writes nothing for an empty line', () => {
        expect(captureLine('   \n ', at, true)).toBe('');
    });
});

describe('quick note — where it goes', () => {
    it('writes to today’s note for whoever keeps the journal', () => {
        expect(captureTarget(normalizeCaptureSettings(undefined), true)).toBe('daily');
    });

    it('writes to a note when there is no journal, even if set to the daily note', () => {
        expect(captureTarget(normalizeCaptureSettings(undefined), false)).toBe('note');
        expect(captureTarget(normalizeCaptureSettings({ captureTo: 'daily' }), false)).toBe('note');
    });

    it('keeps the choice once it is made', () => {
        expect(captureTarget(normalizeCaptureSettings({ captureTo: 'note' }), true)).toBe('note');
    });

    it('reads the note’s path as a Markdown file', () => {
        expect(capturePath('Inbox')).toBe('Inbox.md');
        expect(capturePath(' /Notes/Inbox.md/ ')).toBe('Notes/Inbox.md');
        expect(capturePath('Notes\\Inbox')).toBe('Notes/Inbox.md');
        expect(capturePath('[[Inbox#Later|in]]')).toBe('Inbox.md');
        expect(capturePath('  ')).toBe('');
    });

    it('puts the time in front unless that was switched off', () => {
        expect(normalizeCaptureSettings({}).captureStamp).toBe(true);
        expect(normalizeCaptureSettings({ captureStamp: false }).captureStamp).toBe(false);
    });
});

describe('quick note — into a daily note', () => {
    const note = [
        '# 8 October',
        '',
        '## Tasks',
        '- [ ] one',
        '',
        '## Notes',
        '- earlier',
        '',
        '## Later',
        'x',
    ];

    it('goes to the end of the notes section', () => {
        const out = fileInDailyNote(note.join('\n'), '- 09:05 new', ['Notes']).split('\n');
        expect(out.slice(5, 9)).toEqual(['## Notes', '- earlier', '- 09:05 new', '']);
        expect(out.slice(9)).toEqual(['## Later', 'x']);
    });

    it('finds the section under the name another language gave it', () => {
        const ru = note.join('\n').replace('## Notes', '## Заметки');
        const out = fileInDailyNote(ru, '- new', ['Notes', 'notes', 'заметки', '笔记']);
        expect(out).toContain('## Заметки\n- earlier\n- new\n');
    });

    it('goes to the end of a note that has no such section', () => {
        expect(fileInDailyNote('# Day\nText', '- new', ['Notes'])).toBe('# Day\nText\n- new\n');
    });
});

describe('quick note — what the card remembers', () => {
    it('shows the newest first and no more than it has room for', () => {
        let list = withCaptured([], 'first', new Date(2026, 9, 8, 9, 5));
        for (let i = 0; i < CAPTURED_SHOWN + 2; i++) {
            list = withCaptured(list, `line ${i}`, new Date(2026, 9, 8, 10, i));
        }
        expect(list).toHaveLength(CAPTURED_SHOWN);
        expect(list[0]).toEqual({ text: `line ${CAPTURED_SHOWN + 1}`, time: '10:05' });
    });
});

// ── Timer ────────────────────────────────────────────

describe('timer — where it stands', () => {
    const NOW = 1_800_000_000_000;

    it('is idle until started', () => {
        expect(timerState(DEFAULT_TIMER_SETTINGS, NOW)).toEqual({ kind: 'idle' });
    });

    it('counts whole seconds, and never shows zero while running', () => {
        const running = { timerMinutes: 5, timerEndsAt: NOW + 5 * 60_000 };
        expect(timerState(running, NOW)).toEqual({ kind: 'running', left: 300 });
        expect(timerState(running, NOW + 299_400)).toEqual({ kind: 'running', left: 1 });
    });

    it('says the time is up, and stops saying so after a while', () => {
        const ended = { timerMinutes: 5, timerEndsAt: NOW };
        expect(timerState(ended, NOW)).toEqual({ kind: 'done' });
        expect(timerState(ended, NOW + TIMER_DONE_MS - 1)).toEqual({ kind: 'done' });
        expect(timerState(ended, NOW + TIMER_DONE_MS)).toEqual({ kind: 'idle' });
    });

    it('draws minutes and seconds, and hours once there are any', () => {
        expect(formatClock(1500)).toBe('25:00');
        expect(formatClock(59)).toBe('0:59');
        expect(formatClock(3723)).toBe('1:02:03');
        expect(formatClock(-4)).toBe('0:00');
    });
});

describe('timer — settings read back from data.json', () => {
    it('keeps the length inside what the card can count', () => {
        expect(clampMinutes(0)).toBe(1);
        expect(clampMinutes('90')).toBe(90);
        expect(clampMinutes(1e9)).toBe(TIMER_MAX_MINUTES);
        expect(clampMinutes('abc')).toBe(DEFAULT_TIMER_SETTINGS.timerMinutes);
    });

    it('treats anything that is not a moment as not running', () => {
        expect(normalizeTimerSettings({ timerEndsAt: 'soon' }).timerEndsAt).toBe(0);
        expect(normalizeTimerSettings({ timerEndsAt: -5 }).timerEndsAt).toBe(0);
        expect(normalizeTimerSettings(undefined)).toEqual(DEFAULT_TIMER_SETTINGS);
    });
});

describe('timer — what the scheduler is told', () => {
    const config = {
        'picture.timer': { timerMinutes: 5, timerEndsAt: 1000 },
        'picture.timer#2': { timerMinutes: 25, timerEndsAt: 5000 },
        'picture.timer#3': { timerMinutes: 15, timerEndsAt: 0 },
        // Another widget's bucket that happens to hold the same key.
        'picture.text': { timerEndsAt: 1000 },
    };

    it('finds every running timer due in the window, and nothing else', () => {
        expect(timerEvents(config, 0, 2000)).toEqual([
            { key: 'timer:picture.timer:1000', at: 1000, instanceId: 'picture.timer', minutes: 5 },
        ]);
        expect(timerEvents(config, 0, 10_000).map((e) => e.instanceId)).toEqual([
            'picture.timer',
            'picture.timer#2',
        ]);
    });

    it('takes the start of the window and leaves its end', () => {
        expect(timerEvents(config, 1000, 5000).map((e) => e.at)).toEqual([1000]);
    });

    it('gives a restarted timer a new key, so it is told again', () => {
        const again = { 'picture.timer': { timerMinutes: 5, timerEndsAt: 9000 } };
        expect(timerEvents(again, 0, 10_000)[0].key).not.toBe(timerEvents(config, 0, 2000)[0].key);
    });

    it('changes its signature when a timer starts or stops, and not otherwise', () => {
        const before = timerSignature(config);
        expect(timerSignature({ ...config, 'picture.text': { text: 'edited' } })).toBe(before);
        expect(
            timerSignature({ ...config, 'picture.timer#3': { timerMinutes: 15, timerEndsAt: 7 } })
        ).not.toBe(before);
    });
});
