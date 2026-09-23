import {
    EMPTY_NOTIFICATIONS,
    normalizeNotifications,
    type NotificationState,
} from '../core/notifications/notificationState';
import type { ZenithSliceCreator } from './types';

/**
 * The notification center's records — on this device only.
 *
 * In the store so the bell and the list re-render as records arrive, and out
 * of `settings` so they never reach a profile, an export or the settings sync:
 * `main.ts` persists this beside the settings in `data.json`, not inside them.
 */
export interface NotificationSlice {
    notifications: NotificationState;
    /** Replace the state through a pure change from `notificationState.ts`. */
    updateNotifications: (change: (state: NotificationState) => NotificationState) => void;
    /** What `data.json` held, checked before it is believed. */
    loadNotifications: (raw: unknown) => void;
}

export const createNotificationSlice: ZenithSliceCreator<NotificationSlice> = (set) => ({
    notifications: EMPTY_NOTIFICATIONS,

    updateNotifications: (change) =>
        set((state) => {
            const next = change(state.notifications);
            return next === state.notifications ? {} : { notifications: next };
        }),

    loadNotifications: (raw) => set(() => ({ notifications: normalizeNotifications(raw) })),
});
