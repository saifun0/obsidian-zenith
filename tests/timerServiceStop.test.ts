import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { TimerService } from '../src/modules/tasks/services/timerService';
import { useZenithStore } from '../src/store';
import { startSession } from '../src/modules/tasks/services/taskTimer';

/**
 * Stopping a timer whose write does not land.
 *
 * The session is cleared before the write so the button answers the press at
 * once — which is right, and was half a design. The other half was missing:
 * nothing put it back. A failed write therefore did not lose the update, it
 * lost the RECORD of the work, because the only copy of the start time had
 * already been dropped. Twenty tracked minutes, gone, with nothing left to
 * retry from.
 *
 * Both failures are covered here because they arrive by different doors:
 * `setSpentInFile` returns false when the note is not where it was, and throws
 * when the vault itself refuses. The throwing one used to be the quieter of
 * the two — uncaught, it became an unhandled rejection inside a click handler.
 */

// The failure paths build a Notice, and building one resolves the locale,
// which reads `window.localStorage` from deep inside `translate`. That is why
// a service with no DOM of its own still needs a window to fail in.
(globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: () => 'en' },
};

const START = Date.UTC(2026, 7, 11, 12, 0, 0);
const TWENTY_MINUTES_LATER = START + 20 * 60_000;

/** A vault whose write fails in the way the test asks for. */
function fakeApp(mode: 'missing' | 'throws' | 'works') {
    const file = new TFile();
    file.path = 'Tasks.md';

    return {
        vault: {
            getAbstractFileByPath: () => (mode === 'missing' ? null : file),
            process: (_f: unknown, fn: (data: string) => string) => {
                if (mode === 'throws') throw new Error('vault said no');
                fn('- [ ] Ship it');
                return Promise.resolve('');
            },
        },
    } as unknown as App;
}

function runningSession() {
    useZenithStore.getState().updateSettings({
        activeTimer: startSession({
            filePath: 'Tasks.md',
            lineNumber: 1,
            title: 'Ship it',
            now: START,
        }),
    });
}

const activeTimer = () => useZenithStore.getState().settings.activeTimer;

describe('stopping a timer when the write fails', () => {
    beforeEach(() => {
        runningSession();
        // Twenty minutes of work to lose.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(TWENTY_MINUTES_LATER));
    });

    afterEach(() => vi.useRealTimers());

    it('puts the session back when the note is no longer there', async () => {
        const before = activeTimer();

        const written = await new TimerService(fakeApp('missing')).stopRunning();

        expect(written).toBe(0);
        expect(activeTimer()).toEqual(before);
    });

    it('puts the session back when the vault throws', async () => {
        const before = activeTimer();

        // The throw must not escape either: uncaught in a click handler it is
        // an unhandled rejection nobody sees.
        const written = await new TimerService(fakeApp('throws')).stopRunning();

        expect(written).toBe(0);
        expect(activeTimer()).toEqual(before);
    });

    it('clears the session when the write lands', async () => {
        await new TimerService(fakeApp('works')).stopRunning();
        expect(activeTimer()).toBeNull();
    });
});
