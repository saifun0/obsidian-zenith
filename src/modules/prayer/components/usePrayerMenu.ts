import { useCallback } from 'react';
import { Menu } from 'obsidian';
import type React from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { PRAYER_STATUSES, type PrayerId, type PrayerStatus } from '../prayerConfig';
import { setPrayerStatus } from '../prayerActions';

/** Icon per status, in the same vocabulary Obsidian's own menus use. */
const STATUS_ICON: Record<PrayerStatus, string> = {
    ontime: 'check',
    late: 'clock',
    missed: 'x',
};

/**
 * The full status picker, on right-click.
 *
 * A tap already records the common answer (see `statusForTap`), so this is for
 * the rest: admitting a miss, or undoing a mis-tap. It uses Obsidian's own menu
 * rather than a custom popover — it lands in the right place, closes on the
 * right events, and looks like the rest of the app.
 *
 * Desktop-only by nature: on mobile there is no right-click, which is why the
 * view gives every prayer a visible set of buttons instead of hiding the
 * choice behind a gesture.
 */
export function usePrayerMenu(date: string): (
    e: React.MouseEvent,
    prayer: PrayerId,
    current: PrayerStatus | undefined
) => void {
    const { app } = useApp();
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);

    return useCallback(
        (e, prayer, current) => {
            e.preventDefault();
            e.stopPropagation();

            const menu = new Menu();
            for (const status of PRAYER_STATUSES) {
                menu.addItem((item) =>
                    item
                        .setTitle(t(`prayer.status.${status}`))
                        .setIcon(STATUS_ICON[status])
                        .setChecked(current === status)
                        .onClick(() => {
                            void setPrayerStatus(app, settings, date, prayer, status);
                        })
                );
            }

            if (current) {
                menu.addSeparator();
                menu.addItem((item) =>
                    item
                        .setTitle(t('prayer.status.clear'))
                        .setIcon('rotate-ccw')
                        .onClick(() => {
                            void setPrayerStatus(app, settings, date, prayer, null);
                        })
                );
            }

            menu.showAtMouseEvent(e.nativeEvent);
        },
        [app, settings, date, t]
    );
}
