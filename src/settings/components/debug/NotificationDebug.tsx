import React, { useState } from 'react';
import { Notice, Platform } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import { useFeature } from '../../../core/useFeature';
import { VIEW_TYPE_TASKS } from '../../../core/constants';
import type { EventSource, SourceEvent } from '../../../core/scheduler';
import { NotificationCenterModal } from '../../../core/notifications/NotificationCenterModal';
import type { NotificationDraft } from '../../../core/notifications/NotificationCenter';
import {
    isQuiet,
    unreadCount,
    type OpenTarget,
} from '../../../core/notifications/notificationState';
import { ActionButton, Select, SettingRow, TextInput, Toggle } from '../../controls';
import type ZenithPlugin from '../../../main';

/** The source every test notification comes from. */
const DEBUG_SOURCE = 'debug';

interface DebugEvent extends SourceEvent {
    draft: Omit<NotificationDraft, 'key' | 'at' | 'source'>;
}

/**
 * A source that exists only while it has something scheduled.
 *
 * Scheduled tests go through the real scheduler — the same timer, the same
 * late check, the same popup rules — which is the point of scheduling one
 * rather than sending it now. It unregisters itself once it has nothing left,
 * so it does not linger in the list of sources on the Notifications page.
 */
class DebugSource implements EventSource<DebugEvent> {
    readonly id = DEBUG_SOURCE;
    pending: DebugEvent[] = [];
    private dispose: (() => void) | null = null;
    private seq = 0;

    constructor(private readonly plugin: ZenithPlugin) {
        // "Mark done" on a test does nothing but take it off the list.
        plugin.notifications.registerActions(DEBUG_SOURCE, {
            complete: () => Promise.resolve(true),
        });
    }

    key(): string {
        return `debug:${Date.now()}:${++this.seq}`;
    }

    schedule(draft: DebugEvent['draft'], inMs: number): void {
        this.pending.push({ key: this.key(), at: Date.now() + inMs, draft });
        if (this.dispose) this.plugin.scheduler.reschedule();
        else this.dispose = this.plugin.scheduler.register(this);
    }

    events(from: number, to: number): DebugEvent[] {
        return this.pending.filter((e) => e.at >= from && e.at < to);
    }

    deliver(event: DebugEvent, late: boolean): void {
        this.pending = this.pending.filter((e) => e.key !== event.key);
        this.plugin.notifications.notify(
            { ...event.draft, key: event.key, at: event.at, source: DEBUG_SOURCE },
            late
        );
        if (this.pending.length === 0 && this.dispose) {
            const dispose = this.dispose;
            this.dispose = null;
            dispose();
        }
    }
}

/** One per plugin instance, so a reload starts clean. */
const sources = new WeakMap<ZenithPlugin, DebugSource>();
function debugSource(plugin: ZenithPlugin): DebugSource {
    let source = sources.get(plugin);
    if (!source) {
        source = new DebugSource(plugin);
        sources.set(plugin, source);
    }
    return source;
}

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="zenith-debug__fact">
        <span className="zenith-debug__fact-key">{label}</span>
        <span className="zenith-debug__fact-val">{value}</span>
    </div>
);

type Target = 'none' | 'tasks' | 'prayer';

const TARGETS: Record<Target, OpenTarget | undefined> = {
    none: undefined,
    tasks: { view: VIEW_TYPE_TASKS },
    prayer: { module: 'prayer' },
};

/**
 * Send test notifications, and see what the center and the scheduler believe.
 *
 * Nothing here bypasses the real rules. A test sent during quiet hours does
 * not pop up, a silenced source stays silent, and with the center switched off
 * a missed one goes nowhere — which is exactly what needs checking. The facts
 * below the buttons say which of those is in force right now.
 */
export const NotificationDebug: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const state = useZenithStore((s) => s.notifications);
    const update = useZenithStore((s) => s.updateNotifications);
    const centerOn = useFeature('notify.center');
    // Every second, for the countdown to the next scheduled test.
    const now = useNow(1000).getTime();

    const [title, setTitle] = useState(() => t('debug.notify.defaultTitle'));
    const [body, setBody] = useState(() => t('debug.notify.defaultBody'));
    const [target, setTarget] = useState<Target>('none');
    const [completable, setCompletable] = useState(true);
    const [, repaint] = useState(0);

    const source = debugSource(plugin);
    const draft = (): DebugEvent['draft'] => ({
        title: title.trim() || t('debug.notify.defaultTitle'),
        body: body.trim() || undefined,
        open: TARGETS[target],
        completable,
    });

    const sendNow = (late: boolean) => {
        const at = late ? Date.now() - 60 * 60_000 : Date.now();
        plugin.notifications.notify(
            { ...draft(), key: source.key(), at, source: DEBUG_SOURCE },
            late
        );
    };

    const schedule = (ms: number) => {
        source.schedule(draft(), ms);
        repaint((n) => n + 1);
        new Notice(t('debug.notify.scheduled', { seconds: Math.round(ms / 1000) }));
    };

    const quiet = isQuiet(now, settings.notifyQuietFrom, settings.notifyQuietTo);
    const next = source.pending.reduce((min, e) => Math.min(min, e.at), Infinity);
    const permission =
        typeof window.Notification === 'undefined' ? '—' : window.Notification.permission;
    const time = (at: number) => new Date(at).toLocaleString(t.locale);

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-settings__section-label">{t('debug.notify.compose')}</div>
            <div className="zenith-settings__card">
                <SettingRow label={t('debug.notify.title')}>
                    <TextInput value={title} onChange={setTitle} />
                </SettingRow>
                <SettingRow label={t('debug.notify.body')}>
                    <TextInput value={body} onChange={setBody} />
                </SettingRow>
                <SettingRow label={t('debug.notify.opens')}>
                    <Select
                        value={target}
                        options={(['none', 'tasks', 'prayer'] as Target[]).map((v) => ({
                            value: v,
                            label: t(`debug.notify.opens.${v}`),
                        }))}
                        onChange={(v) => setTarget(v as Target)}
                    />
                </SettingRow>
                <SettingRow label={t('debug.notify.completable')} compact>
                    <Toggle checked={completable} onChange={setCompletable} />
                </SettingRow>
            </div>

            <div className="zenith-debug__toolbar">
                <ActionButton label={t('debug.notify.now')} cta onClick={() => sendNow(false)} />
                <ActionButton label={t('debug.notify.missed')} onClick={() => sendNow(true)} />
                <ActionButton label={t('debug.notify.in10s')} onClick={() => schedule(10_000)} />
                <ActionButton label={t('debug.notify.in1m')} onClick={() => schedule(60_000)} />
            </div>
            <p className="zenith-debug__note">{t('debug.notify.hint')}</p>

            <div className="zenith-settings__section-label">{t('debug.notify.state')}</div>
            <div className="zenith-debug__facts">
                <Fact
                    label={t('debug.notify.center')}
                    value={t(centerOn ? 'debug.notify.on' : 'debug.notify.off')}
                />
                <Fact
                    label={t('debug.notify.records')}
                    value={t('debug.notify.recordsValue', {
                        count: state.records.length,
                        unread: unreadCount(state, now),
                    })}
                />
                <Fact
                    label={t('debug.notify.watermark')}
                    value={state.watermark === null ? '—' : time(state.watermark)}
                />
                <Fact
                    label={t('debug.notify.sources')}
                    value={plugin.scheduler.sourceIds().join(', ') || '—'}
                />
                <Fact
                    label={t('debug.notify.pending')}
                    value={
                        source.pending.length === 0
                            ? '—'
                            : t('debug.notify.pendingValue', {
                                  count: source.pending.length,
                                  seconds: Math.max(0, Math.round((next - now) / 1000)),
                              })
                    }
                />
                <Fact
                    label={t('debug.notify.quiet')}
                    value={t(quiet ? 'debug.notify.yes' : 'debug.notify.no')}
                />
                <Fact
                    label={t('debug.notify.muted')}
                    value={settings.notifyMuted.join(', ') || '—'}
                />
                <Fact
                    label={t('debug.notify.system')}
                    value={
                        Platform.isDesktopApp
                            ? `${t(settings.notifySystem ? 'debug.notify.on' : 'debug.notify.off')} · ${permission}`
                            : t('debug.notify.systemMobile')
                    }
                />
            </div>

            <div className="zenith-debug__toolbar">
                <ActionButton
                    label={t('debug.notify.openCenter')}
                    onClick={() => new NotificationCenterModal(plugin).open()}
                />
                {Platform.isDesktopApp && typeof window.Notification !== 'undefined' && (
                    <ActionButton
                        label={t('debug.notify.askPermission')}
                        onClick={() =>
                            void window.Notification.requestPermission().then(() =>
                                repaint((n) => n + 1)
                            )
                        }
                    />
                )}
                <ActionButton
                    label={t('debug.notify.clear')}
                    danger
                    onClick={() => update((s) => ({ ...s, records: [] }))}
                />
            </div>
        </div>
    );
};
