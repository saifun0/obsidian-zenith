import React, { useMemo, type FC } from 'react';
import { Menu } from 'obsidian';
import { Check, Clock, ExternalLink, X } from 'lucide-react';
import { useZenithStore } from '../../store';
import { useTranslation, type Translator } from '../i18n';
import { useNow } from '../useNow';
import type { NotificationCenter } from './NotificationCenter';
import {
    clearRead,
    markAllRead,
    splitByDay,
    visibleRecords,
    type NotificationRecord,
    type SnoozeChoice,
} from './notificationState';

const SNOOZES: SnoozeChoice[] = ['10m', '1h', 'tomorrow'];

function when(record: NotificationRecord, today: boolean, t: Translator): string {
    const date = new Date(record.at);
    const time = date.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });
    if (today) return time;
    return `${date.toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The center's list: today, then earlier.
 *
 * Every action is a visible button rather than something revealed on hover,
 * because this opens on a phone as often as anywhere, and a phone has no
 * hover. Snoozing asks how long through Obsidian's own menu for the same
 * reason — it is the one popup that already works under a thumb.
 */
export const NotificationList: FC<{ center: NotificationCenter }> = ({ center }) => {
    const t = useTranslation();
    const state = useZenithStore((s) => s.notifications);
    const update = useZenithStore((s) => s.updateNotifications);
    const now = useNow(60_000).getTime();

    const { today, earlier } = useMemo(
        () => splitByDay(visibleRecords(state, now), now),
        [state, now]
    );

    const snooze = (record: NotificationRecord, e: React.MouseEvent) => {
        const menu = new Menu();
        for (const choice of SNOOZES) {
            menu.addItem((item) =>
                item
                    .setTitle(t(`notify.snooze.${choice}`))
                    .onClick(() => center.snooze(record, choice))
            );
        }
        menu.showAtMouseEvent(e.nativeEvent);
    };

    const row = (record: NotificationRecord, isToday: boolean) => (
        <li
            key={record.id}
            className={`zenith-notify__item ${record.readAt ? '' : 'is-unread'} ${
                record.missed ? 'is-missed' : ''
            }`}
        >
            <div className="zenith-notify__text">
                <span className="zenith-notify__title">{record.title}</span>
                {record.body && <span className="zenith-notify__body">{record.body}</span>}
                <span className="zenith-notify__meta">
                    {when(record, isToday, t)}
                    {record.missed && (
                        <span className="zenith-notify__missed">{t('notify.missed')}</span>
                    )}
                </span>
            </div>
            <div className="zenith-notify__actions">
                {record.open && (
                    <button
                        type="button"
                        className="zenith-notify__action"
                        aria-label={t('notify.open')}
                        title={t('notify.open')}
                        onClick={() => void center.open(record)}
                    >
                        <ExternalLink size={14} />
                    </button>
                )}
                {center.canComplete(record) && (
                    <button
                        type="button"
                        className="zenith-notify__action"
                        aria-label={t('notify.complete')}
                        title={t('notify.complete')}
                        onClick={() => void center.complete(record)}
                    >
                        <Check size={14} />
                    </button>
                )}
                <button
                    type="button"
                    className="zenith-notify__action"
                    aria-label={t('notify.snooze')}
                    title={t('notify.snooze')}
                    onClick={(e) => snooze(record, e)}
                >
                    <Clock size={14} />
                </button>
                <button
                    type="button"
                    className="zenith-notify__action"
                    aria-label={t('notify.dismiss')}
                    title={t('notify.dismiss')}
                    onClick={() => center.dismiss(record)}
                >
                    <X size={14} />
                </button>
            </div>
        </li>
    );

    if (today.length === 0 && earlier.length === 0) {
        return <div className="zenith-notify__empty">{t('notify.empty')}</div>;
    }

    return (
        <div className="zenith-notify">
            <div className="zenith-notify__bar">
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm"
                    onClick={() => update((s) => markAllRead(s, Date.now()))}
                >
                    {t('notify.markAllRead')}
                </button>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm"
                    onClick={() => update((s) => clearRead(s, Date.now()))}
                >
                    {t('notify.clearRead')}
                </button>
            </div>
            {today.length > 0 && (
                <section>
                    <h3 className="zenith-notify__day">{t('notify.today')}</h3>
                    <ul className="zenith-notify__list">{today.map((r) => row(r, true))}</ul>
                </section>
            )}
            {earlier.length > 0 && (
                <section>
                    <h3 className="zenith-notify__day">{t('notify.earlier')}</h3>
                    <ul className="zenith-notify__list">{earlier.map((r) => row(r, false))}</ul>
                </section>
            )}
        </div>
    );
};
