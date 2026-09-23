import { Modal } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { useZenithStore } from '../../store';
import { translateNow } from '../i18n';
import { NotificationList } from './NotificationList';
import { markAllRead } from './notificationState';
import type ZenithPlugin from '../../main';

/**
 * The notification center, opened from the bell or the command.
 *
 * A modal rather than a popover under the bell: the command opens it from
 * anywhere, with no bell on screen to hang a popover from, and on a phone a
 * modal is the one surface that is always the right size.
 *
 * Closing it counts as having read what was in it. The list shows unread ones
 * as unread while it is open — that is the point of opening it — and the badge
 * should not still be asking once they have been seen.
 */
export class NotificationCenterModal extends Modal {
    private root: Root | null = null;

    constructor(private readonly plugin: ZenithPlugin) {
        super(plugin.app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(translateNow('notify.title'));
        contentEl.addClass('zenith-root', 'zenith-notify-modal');

        this.root = createRoot(contentEl.createDiv());
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.plugin.app, plugin: this.plugin } },
                createElement(NotificationList, { center: this.plugin.notifications })
            )
        );
    }

    onClose(): void {
        useZenithStore.getState().updateNotifications((s) => markAllRead(s, Date.now()));
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
