import { Notice, Platform } from 'obsidian';
import { useZenithStore } from '../../store';
import { featureEnabled } from '../features';
import { openFileAtLine } from '../openInVault';
import { resolveLocale, translate } from '../i18n';
import type { EventSource, Scheduler, SourceEvent } from '../scheduler';
import {
    addRecord,
    isQuiet,
    markRead,
    removeRecord,
    snoozeRecord,
    snoozeUntil,
    wakeRecord,
    type NotificationRecord,
    type NotificationState,
    type OpenTarget,
    type SnoozeChoice,
} from './notificationState';
import type ZenithPlugin from '../../main';

/** What a source hands over to be told. */
export interface NotificationDraft {
    /** The scheduler event's key — one occurrence, one record. */
    key: string;
    source: string;
    title: string;
    body?: string;
    at: number;
    open?: OpenTarget;
    /** The source registered a way to mark this done. */
    completable?: boolean;
}

/** What a source can do with its own notifications beyond opening them. */
export interface SourceActions {
    /** Mark the thing done. Resolves false when it could not be. */
    complete?: (record: NotificationRecord) => Promise<boolean>;
}

interface SnoozeEvent extends SourceEvent {
    id: string;
}

/**
 * The notification center: where every reminder is recorded, and how it is
 * shown.
 *
 * Two ways out, and they are separate on purpose. A record goes into the
 * center — unless the center is switched off — whether or not anyone saw it
 * pop up; a popup is shown only when the moment is now, the hours are not
 * quiet, and the source is not one the user asked to keep silent. That is
 * what lets "nothing is lost" and "nothing wakes me at night" both be true.
 *
 * On a computer the popup can also be the system's own notification. On a
 * phone it can only ever be inside Obsidian — a plugin cannot reach the phone's
 * notifications — and the settings say so rather than letting anyone expect
 * otherwise.
 */
export class NotificationCenter implements EventSource<SnoozeEvent> {
    readonly id = 'center';
    private readonly actions = new Map<string, SourceActions>();

    constructor(
        private readonly plugin: ZenithPlugin,
        private readonly scheduler: Scheduler
    ) {}

    // ── State ───────────────────────────────────────

    private get state(): NotificationState {
        return useZenithStore.getState().notifications;
    }

    private update(change: (state: NotificationState) => NotificationState): void {
        useZenithStore.getState().updateNotifications(change);
    }

    private get recording(): boolean {
        return featureEnabled(useZenithStore.getState().settings, 'notify.center');
    }

    /** What a source may do with its records, beyond opening them. */
    registerActions(source: string, actions: SourceActions): () => void {
        this.actions.set(source, actions);
        return () => {
            if (this.actions.get(source) === actions) this.actions.delete(source);
        };
    }

    canComplete(record: NotificationRecord): boolean {
        return !!record.completable && !!this.actions.get(record.source)?.complete;
    }

    // ── Telling ─────────────────────────────────────

    /**
     * Tell the user about something, now or — `late` — after the fact.
     *
     * Late is recorded as missed and never pops up: "it is time for maghrib",
     * two hours after maghrib, is a wrong statement about the present. With
     * the center off there is nowhere to keep a missed one, which is the one
     * case in which it is dropped.
     */
    notify(draft: NotificationDraft, late: boolean): void {
        const now = Date.now();
        const record: NotificationRecord = {
            id: `${draft.key}@${now}`,
            key: draft.key,
            source: draft.source,
            title: draft.title,
            body: draft.body,
            at: draft.at,
            createdAt: now,
            open: draft.open,
            completable: draft.completable,
            ...(late ? { missed: true } : {}),
        };
        if (this.recording) this.update((s) => addRecord(s, record, now));
        if (!late) this.popup(record);
    }

    /** Show it, if the hour and the source allow. */
    private popup(record: NotificationRecord): void {
        const { settings } = useZenithStore.getState();
        if (settings.notifyMuted.includes(record.source)) return;
        if (isQuiet(Date.now(), settings.notifyQuietFrom, settings.notifyQuietTo)) return;

        const fragment = createFragment((frag) => {
            const box = frag.createDiv({ cls: 'zenith-notice' });
            box.createDiv({ cls: 'zenith-notice__title', text: record.title });
            if (record.body) box.createDiv({ cls: 'zenith-notice__body', text: record.body });
            if (record.open) {
                box.addClass('is-clickable');
                box.addEventListener('click', () => void this.open(record));
            }
        });
        new Notice(fragment, 10_000);

        if (settings.notifySystem && Platform.isDesktopApp) this.system(record);
    }

    /**
     * The operating system's own notification. Asked for once, the first time
     * it is needed; a refusal is respected silently, since the in-app notice
     * has already been shown.
     */
    private system(record: NotificationRecord): void {
        if (typeof window.Notification === 'undefined') return;
        const show = () => {
            const n = new window.Notification(record.title, { body: record.body ?? '' });
            n.onclick = () => {
                window.focus();
                void this.open(record);
            };
        };
        if (window.Notification.permission === 'granted') {
            show();
        } else if (window.Notification.permission === 'default') {
            void window.Notification.requestPermission().then((p) => {
                if (p === 'granted') show();
            });
        }
    }

    // ── Acting on a record ──────────────────────────

    async open(record: NotificationRecord): Promise<void> {
        this.update((s) => markRead(s, record.id, Date.now()));
        const target = record.open;
        if (!target) return;
        if ('path' in target) {
            await openFileAtLine(this.plugin.app, target.path, target.line);
            return;
        }
        if ('module' in target) {
            await this.plugin.moduleManager.get(target.module)?.activateView();
            return;
        }
        const { workspace } = this.plugin.app;
        const existing = workspace.getLeavesOfType(target.view);
        if (existing.length > 0) {
            await workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getLeaf('tab');
        await leaf.setViewState({ type: target.view, active: true });
        await workspace.revealLeaf(leaf);
    }

    snooze(record: NotificationRecord, choice: SnoozeChoice): void {
        this.update((s) => snoozeRecord(s, record.id, snoozeUntil(choice, Date.now())));
        this.scheduler.reschedule();
    }

    dismiss(record: NotificationRecord): void {
        this.update((s) => removeRecord(s, record.id));
    }

    async complete(record: NotificationRecord): Promise<void> {
        const complete = this.actions.get(record.source)?.complete;
        if (!complete) return;
        const ok = await complete(record);
        if (ok) this.update((s) => removeRecord(s, record.id));
        else new Notice(translate(resolveLocale(useZenithStore.getState().settings.language), 'notify.completeFailed'));
    }

    // ── Snoozes, as a source of their own ───────────

    events(from: number, to: number): SnoozeEvent[] {
        return this.state.records
            .filter((r) => r.snoozedUntil !== undefined && r.snoozedUntil >= from && r.snoozedUntil < to)
            .map((r) => ({ key: `snooze:${r.id}:${r.snoozedUntil}`, at: r.snoozedUntil!, id: r.id }));
    }

    /**
     * A snooze coming round. Back in the list as unread — and, when its time
     * is now rather than hours ago, shown again.
     */
    deliver(event: SnoozeEvent, late: boolean): void {
        const record = this.state.records.find((r) => r.id === event.id);
        if (!record) return;
        this.update((s) => wakeRecord(s, record.id));
        if (!late) this.popup(record);
    }
}
