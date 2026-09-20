import { Notice } from 'obsidian';
import { translatorNow } from '../../core/i18n';
import { countLine, doneLine, progressRatio, rateLine } from './progressFormat';
import type { FileSyncService, FileSyncStatus } from './services/fileSync';
import type { SyncProgress } from './services/SyncEngine';

/**
 * A file run, reported where the user is rather than where the run was started.
 *
 * A sync of a real vault takes minutes, and the only place it said so was a line
 * of text inside the sync page — which is the one page nobody stays on, because
 * they pressed Apply and went back to writing. So the run follows them: a
 * notice that stays up for as long as the transfer does, carrying a bar, the
 * count, the rate and what is left.
 *
 * It is a controller rather than a component on purpose. Nothing about a
 * transfer belongs to a view that may or may not be mounted, and Obsidian's
 * notices are the one surface that outlives the tab the work was begun in.
 *
 * Held together by three rules:
 *   · the notice appears only for a run that MOVES something, so pressing
 *     Preview does not flash a bar for the half second it takes to list a
 *     server;
 *   · it never disappears while the run is going, whatever the timeout would
 *     have been — `0` and `hide()` rather than a duration;
 *   · it always ends with a sentence, so a run that finished and a run that was
 *     interrupted do not look the same.
 */

/** How long the finished line stays up before the notice closes itself. */
const LINGER_MS = 5000;
/** How long an error stays up. Longer: there is something to read and act on. */
const ERROR_LINGER_MS = 12000;
/**
 * Redraw at most this often.
 *
 * The engine reports every settled file and a fast server settles a lot of
 * small ones per frame; without this the notice's text nodes are rewritten
 * hundreds of times a second to say the same thing.
 */
const FRAME_MS = 120;

interface NoticeParts {
    notice: Notice;
    title: HTMLElement;
    count: HTMLElement;
    fill: HTMLElement;
    rate: HTMLElement;
    file: HTMLElement;
}

export class SyncProgressNotice {
    private parts: NoticeParts | null = null;
    private unsubscribe: (() => void) | null = null;
    private closeTimer: number | null = null;
    private lastDrawAt = 0;
    /** The last progress seen, so the closing line can report the whole run. */
    private last: SyncProgress | null = null;
    private wasRunning = false;

    constructor(service: FileSyncService) {
        this.unsubscribe = service.subscribe((status) => this.onStatus(status));
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.clearTimer();
        this.parts?.notice.hide();
        this.parts = null;
    }

    // ── Reacting to the service ──────────────────────

    private onStatus(status: FileSyncStatus): void {
        if (status.running && status.progress) {
            this.last = status.progress;
            this.draw(status.progress);
            this.wasRunning = true;
            return;
        }

        if (!status.running && this.wasRunning) {
            this.wasRunning = false;
            this.finish(status);
        }
    }

    /**
     * The run stopped. Say how it stopped.
     *
     * An error takes the whole notice over: a bar that stopped at 40% with a
     * red line under it is the clearest way to say "this is where it broke",
     * and the alternative — a silent close plus an error buried on the sync
     * page — is how a half-transferred vault goes unnoticed.
     */
    private finish(status: FileSyncStatus): void {
        if (!this.parts) return;
        const t = translatorNow();

        if (status.error) {
            this.parts.title.setText(t('sync.progress.failed'));
            this.parts.count.setText('');
            this.parts.rate.setText(status.error);
            this.parts.rate.addClass('is-error');
            this.parts.file.setText('');
            this.close(ERROR_LINGER_MS);
            return;
        }

        const p = this.last;
        this.parts.title.setText(t('sync.progress.done'));
        this.parts.count.setText(p ? countLine(p) : '');
        this.parts.fill.style.width = '100%';
        this.parts.rate.setText(p ? doneLine(p, Date.now(), t) : '');
        this.parts.file.setText('');
        this.close(LINGER_MS);
    }

    // ── The notice itself ────────────────────────────

    private draw(p: SyncProgress): void {
        const now = Date.now();
        const parts = this.parts ?? this.open();

        // The first and last frames always draw: the first is what puts the
        // notice on screen, and the last is the one that says 40 of 40 rather
        // than leaving the count one file short for ever.
        const forced = now - this.lastDrawAt >= FRAME_MS || p.done >= p.total;
        if (!forced) return;
        this.lastDrawAt = now;

        const t = translatorNow();
        parts.count.setText(countLine(p));
        parts.fill.style.width = `${Math.round(progressRatio(p) * 100)}%`;
        parts.rate.setText(rateLine(p, now, t));
        parts.file.setText(p.key);
    }

    private open(): NoticeParts {
        this.clearTimer();
        const t = translatorNow();

        // Built as a fragment rather than by writing into `messageEl` after the
        // fact: a notice constructed from a string keeps that string as a text
        // node, and appending to it leaves the raw message sitting above the
        // bar.
        const fragment = document.createDocumentFragment();
        const root = fragment.createDiv({ cls: 'zenith-syncnotice' });

        const head = root.createDiv({ cls: 'zenith-syncnotice__head' });
        const title = head.createSpan({
            cls: 'zenith-syncnotice__title',
            text: t('sync.progress.title'),
        });
        const count = head.createSpan({ cls: 'zenith-syncnotice__count' });

        const bar = root.createDiv({ cls: 'zenith-syncnotice__bar' });
        const fill = bar.createDiv({ cls: 'zenith-syncnotice__fill' });

        const rate = root.createDiv({ cls: 'zenith-syncnotice__rate' });
        // The path goes inside a `<bdi>`: the line is `direction: rtl` so the
        // ellipsis eats the start rather than the filename, and without the
        // isolation that direction also reorders a path beginning with digits.
        const file = root.createDiv({ cls: 'zenith-syncnotice__file' }).createEl('bdi');

        // Zero, so it stays up for as long as the run does. Every other exit
        // from this notice is `close()`.
        const notice = new Notice(fragment, 0);
        this.parts = { notice, title, count, fill, rate, file };
        this.lastDrawAt = 0;
        return this.parts;
    }

    private close(after: number): void {
        this.clearTimer();
        const parts = this.parts;
        this.parts = null;
        this.last = null;
        this.closeTimer = window.setTimeout(() => {
            parts?.notice.hide();
            this.closeTimer = null;
        }, after);
    }

    private clearTimer(): void {
        if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
        this.closeTimer = null;
    }
}
