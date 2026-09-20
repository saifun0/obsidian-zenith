import { Notice, type App } from 'obsidian';
import { useZenithStore } from '../../../store';
import { translate, resolveLocale } from '../../../core/i18n';
import { TaskWriter } from './taskWriter';
import { parseTaskText, formatDuration } from './taskFormat';
import { isDue, isWorthWriting, startSession, totalAfter, type TimerSession } from './taskTimer';

/**
 * The running timer, and the two things it has to do off-screen: announce a
 * countdown that has finished, and write the elapsed time into the task.
 *
 * It is a service rather than a hook because neither of those may depend on the
 * task list being open. You start a timer, switch to the note you are working
 * in, and the countdown still has to reach you.
 *
 * Writing happens once, on stop. The alternative — writing every minute — would
 * rewrite a file sixty times an hour, fight Obsidian's sync, and put a task's
 * line in every conflict resolution the user ever sees.
 */
export class TimerService {
    private ticker: number | undefined;

    constructor(private readonly app: App) {}

    /** Begin watching. Safe to call twice. */
    start(): void {
        if (this.ticker !== undefined) return;
        // Ten seconds is enough for a notification nobody is timing to the
        // second, and cheap enough to leave running for days.
        this.ticker = window.setInterval(() => void this.check(), 10_000);
        void this.check();
    }

    stop(): void {
        if (this.ticker !== undefined) window.clearInterval(this.ticker);
        this.ticker = undefined;
    }

    private get session(): TimerSession | null {
        return useZenithStore.getState().settings.activeTimer;
    }

    private setSession(session: TimerSession | null): void {
        useZenithStore.getState().updateSettings({ activeTimer: session });
    }

    private t(key: string, params?: Record<string, string | number>): string {
        const locale = resolveLocale(useZenithStore.getState().settings.language);
        return translate(locale, key, params);
    }

    /** Announce a countdown that has run out, once. */
    private async check(): Promise<void> {
        const session = this.session;
        if (!session || !isDue(session, Date.now())) return;

        new Notice(this.t('tasks.timer.done', { name: session.title }), 10_000);
        // Marked rather than stopped: the clock keeps running past zero so the
        // time really spent is still what gets recorded.
        this.setSession({ ...session, notified: true });
    }

    /**
     * Start timing a line, stopping whatever was running first.
     *
     * The task's current total is read from the file rather than taken from the
     * caller: the line may have been edited by hand since the list was rendered,
     * and adding to a stale total would quietly lose the difference.
     */
    async startFor(args: {
        filePath: string;
        lineNumber: number;
        title: string;
        countdownMinutes?: number;
    }): Promise<void> {
        await this.stopRunning();

        const spentMinutes = await this.readSpent(args.filePath, args.lineNumber);
        this.setSession(
            startSession({
                filePath: args.filePath,
                lineNumber: args.lineNumber,
                title: args.title,
                countdownMinutes: args.countdownMinutes,
                spentMinutes,
                now: Date.now(),
            })
        );
    }

    /**
     * Stop the running session and add its time to the task.
     *
     * Returns the minutes written, or 0 when the session was too short to
     * round up to one — in which case the file is left untouched.
     *
     * The session is cleared before the write, so the button answers the press
     * immediately — and put back if the write does not land. That second half
     * was missing: the session was dropped first and never restored, so a
     * failed write did not lose the update, it lost the RECORD of the work.
     * Twenty tracked minutes with nothing left to retry from, because the only
     * copy of the start time had already been thrown away.
     *
     * Restoring it resumes from the original start rather than from now, which
     * is the honest reading: nothing was written, so the timer never stopped.
     */
    async stopRunning(): Promise<number> {
        const session = this.session;
        if (!session) return 0;

        const now = Date.now();
        this.setSession(null);
        if (!isWorthWriting(session, now)) return 0;

        const total = totalAfter(session, now);
        try {
            const ok = await this.writeSpent(session.filePath, session.lineNumber, total);
            if (!ok) {
                this.setSession(session);
                new Notice(this.t('tasks.error.update'));
                return 0;
            }
        } catch (err) {
            // `setSpentInFile` reaches the vault, so this can throw rather than
            // return false — a sync writing the same file, a disk that said no.
            // Uncaught it became an unhandled rejection in a click handler: no
            // notice, no log, and a timer that appeared to stop.
            console.error('Zenith: failed to write the tracked time:', err);
            this.setSession(session);
            new Notice(this.t('tasks.error.update'));
            return 0;
        }
        return total - session.baseMinutes;
    }

    /** Read the `⏱` total currently on a line. */
    private async readSpent(filePath: string, lineNumber: number): Promise<number> {
        const body = await new TaskWriter(this.app).readLineBody(filePath, lineNumber);
        if (body === null) return 0;
        return parseTaskText(body, { priority: 'none', tags: [] }).spentMinutes ?? 0;
    }

    /**
     * Write the new total onto the line, leaving everything else as it is.
     *
     * A surgical replacement rather than a rebuild from parsed fields: the line
     * may carry markers this plugin doesn't know about, and rewriting it from
     * what we understood would silently drop them.
     */
    private async writeSpent(
        filePath: string,
        lineNumber: number,
        minutes: number
    ): Promise<boolean> {
        return new TaskWriter(this.app).setSpentInFile(
            filePath,
            lineNumber,
            formatDuration(minutes)
        );
    }
}
