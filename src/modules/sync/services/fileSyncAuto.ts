import { Notice, debounce, type EventRef } from 'obsidian';
import { useZenithStore } from '../../../store';
import { translateNow } from '../../../core/i18n';
import { autoHold, planSignature, type AutoHold } from '../autoPolicy';
import type { FileSyncService } from './fileSync';
import type ZenithPlugin from '../../../main';

/**
 * File sync, without being asked.
 *
 * The engine underneath has always been able to do this; what it lacked was
 * anyone to press the button. Every run began with the user opening the sync
 * page and working through Test → Preview → Apply, which is the right ceremony
 * for a tool you distrust and far too much for one you rely on. A vault that
 * only syncs when you remember to sync it is a vault that is usually stale.
 *
 * So this presses the button, and the whole design is about when NOT to:
 *
 *   · it previews first, always — the automatic path and the manual one run
 *     the same two steps in the same order, and the only difference is who
 *     approves the plan;
 *   · it applies only what `autoHold` clears, and leaves everything else
 *     sitting on the sync page as a plan waiting to be read;
 *   · it never starts a run on top of one the user began, and never discards a
 *     plan they are looking at.
 *
 * Four things wake it: startup, a timer, the window regaining focus, and the
 * vault going quiet after an edit. The last is the one that makes it feel
 * immediate rather than scheduled, and also the one most able to make a
 * nuisance of itself — see `QUIET_MS` and `MIN_GAP_MS`.
 */

/**
 * How long the vault must be still before an edit counts as finished.
 *
 * Long enough to cover a writing session's natural pauses. A shorter window
 * turns one paragraph into three separate syncs of the same file.
 */
const QUIET_MS = 20_000;

/**
 * The floor between two automatic runs, whatever woke them.
 *
 * A run lists both sides in full, so the cost is per-run rather than
 * per-changed-file, and four triggers with no floor between them would put
 * that cost on a server several times a minute.
 */
const MIN_GAP_MS = 60_000;

/**
 * How long after load the first run waits.
 *
 * Obsidian is still opening files and other plugins are still starting; a
 * listing that races that is a listing of a vault half-loaded.
 */
const STARTUP_DELAY_MS = 8_000;


export class FileSyncAuto {
    private timer: number | null = null;
    private eventRefs: EventRef[] = [];
    private disposers: Array<() => void> = [];
    private started = false;

    /** Epoch ms of the last automatic attempt, successful or not. */
    private lastRunAt = 0;

    /**
     * Set for the length of a run, and for a moment after it.
     *
     * A pull writes files, and those writes raise the same vault events a
     * user's typing does. Without this the engine would notice its own
     * downloads and schedule another run to sync them.
     */
    private muted = false;

    /** The last held plan we told the user about. See `planSignature`. */
    private announced: string | null = null;

    private readonly onVaultChange = debounce(() => void this.run(), QUIET_MS, false);

    constructor(
        private readonly plugin: ZenithPlugin,
        private readonly files: FileSyncService
    ) {}

    /** Begin watching. Safe to call when automatic sync is off — it no-ops. */
    start(): void {
        if (this.started) return;
        const { syncFilesEnabled, syncFilesAuto } = useZenithStore.getState().settings;
        if (!syncFilesEnabled || !syncFilesAuto) return;

        this.started = true;

        // Registered one by one rather than over a list of event names: each
        // of these is a separate overload with its own callback signature, and
        // a loop would have to widen them to something neither side means.
        const { vault } = this.plugin.app;
        const touched = () => {
            if (this.muted) return;
            this.onVaultChange();
        };
        this.eventRefs.push(
            vault.on('create', touched),
            vault.on('modify', touched),
            vault.on('delete', touched),
            vault.on('rename', touched)
        );

        // Focus is when a device is most likely to be behind: the user has
        // just come back to it, probably from the other one.
        const onFocus = () => void this.run();
        window.addEventListener('focus', onFocus);
        this.disposers.push(() => window.removeEventListener('focus', onFocus));

        const minutes = intervalMinutes();
        this.timer = window.setInterval(() => void this.run(), minutes * 60_000);
        this.plugin.registerInterval(this.timer);

        const startup = window.setTimeout(() => void this.run(), STARTUP_DELAY_MS);
        this.disposers.push(() => window.clearTimeout(startup));
    }

    stop(): void {
        this.onVaultChange.cancel();
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
        for (const ref of this.eventRefs) this.plugin.app.vault.offref(ref);
        this.eventRefs = [];
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.started = false;
    }

    /**
     * One automatic round: look, then decide whether to act.
     *
     * `force` is what the "Sync now" button passes. It skips the rate limit
     * and the online check — a person who just pressed a button has a right to
     * an answer, even a failure — but it does NOT skip `autoHold`. An explicit
     * press still means "do the safe thing", not "do anything".
     */
    async run(force = false): Promise<void> {
        if (!this.shouldRun(force)) return;

        this.lastRunAt = Date.now();
        this.muted = true;
        try {
            const plan = await this.files.preview();
            if (!plan) return;

            // Nothing to do. Discarded rather than left behind: a plan of zero
            // items on the page is an empty review nobody asked for.
            if (plan.actionable === 0) {
                this.files.discard();
                this.announced = null;
                return;
            }

            const { syncConflictAction } = useZenithStore.getState().settings;
            const hold = autoHold(plan, syncConflictAction);
            if (hold) {
                this.hold(plan.actionable, planSignature(plan), hold);
                return;
            }

            await this.files.apply(plan);
            this.announced = null;
        } finally {
            // Held past the run itself, so the last writes of a pull have
            // raised their events and been ignored before we start listening
            // to the vault again.
            window.setTimeout(() => {
                this.muted = false;
            }, 1_000);
        }
    }

    // ── Deciding whether to start ────────────────────

    private shouldRun(force: boolean): boolean {
        const { syncFilesEnabled, syncFilesAuto } = useZenithStore.getState().settings;
        if (!syncFilesEnabled) return false;
        if (!syncFilesAuto && !force) return false;

        const status = this.files.getStatus();
        if (!status.configured) return false;

        // Never two at once. This one holds even for a forced run: a second
        // engine over the same files is the one thing no caller may ask for.
        if (status.running) return false;

        // A forced run is the user pressing a button, and a button that
        // silently declines is a button that looks broken. Everything below
        // this line is about runs nobody asked for.
        if (force) return true;

        // Never over the top of a plan someone is reading. Recomputing it
        // under them would swap the list they are halfway through for a
        // different one — which is exactly what holding it back was for.
        if (status.plan) return false;

        // `navigator.onLine` is only ever trustworthy when false, which is
        // exactly the direction this needs: it skips a run that was certain to
        // fail and never blocks one that might work.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

        return Date.now() - this.lastRunAt >= MIN_GAP_MS;
    }

    /**
     * Leave the plan for the user, and say so once.
     *
     * The plan stays in the service's status, which is what puts it on the
     * sync page ready to review. The notice exists because that page is not
     * open — if it were, none of this would be automatic.
     *
     * Announced per distinct plan rather than per run: a vault nobody is
     * touching produces the same held plan every few minutes, and being told
     * about it each time is how a user learns to dismiss the one warning that
     * mattered.
     */
    private hold(actionable: number, signature: string, reason: AutoHold): void {
        if (this.announced === signature) return;
        this.announced = signature;

        const fragment = document.createDocumentFragment();
        const root = fragment.createDiv({ cls: 'zenith-syncnotice' });
        root.createDiv({
            cls: 'zenith-syncnotice__title',
            text: translateNow('sync.auto.held'),
        });
        root.createDiv({
            cls: 'zenith-syncnotice__rate',
            text: translateNow(`sync.auto.held.${reason}`, { count: String(actionable) }),
        });
        const link = root.createDiv({
            cls: 'zenith-syncnotice__link',
            text: translateNow('sync.auto.held.open'),
        });
        link.addEventListener('click', () => {
            void this.plugin.moduleManager.get('sync')?.activateView();
        });

        new Notice(fragment, 15_000);
    }
}

/** Clamped rather than trusted: this comes back from `data.json`. */
function intervalMinutes(): number {
    const raw = useZenithStore.getState().settings.syncFilesIntervalMinutes;
    if (!Number.isFinite(raw)) return 15;
    return Math.min(720, Math.max(1, Math.round(raw)));
}
