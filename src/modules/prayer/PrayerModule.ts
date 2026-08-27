import { Notice } from 'obsidian';
import { BaseModule } from '../../core/IModule';
import { PRAYER_BLOCK_LANG, VIEW_TYPE_PRAYER } from '../../core/constants';
import { getTodayString } from '../../core/dateUtils';
import { resolveLocale, translate } from '../../core/i18n';
import { useZenithStore } from '../../store';
import { addDays } from '../journal/services/journalDates';
import type { SettingsSchema } from '../../settings/schema/types';
import { PrayerModal } from './PrayerModal';
import { PrayerBlockRenderer } from './PrayerCodeBlock';
import { PrayerReminderService } from './PrayerReminderService';
import { PrayerWidget } from './components/PrayerWidget';
import { prayerSettingsSchema } from './settings.schema';
import { setPrayerStatus, statusForTap } from './prayerActions';
import { prayerCalcOptions, prayerPlaceOf } from './prayerOptions';
import { PRAYERS } from './prayerConfig';
import { currentPrayer, formatClock, minutesOfDay, prayerTimes } from './prayerTimes';
import type ZenithPlugin from '../../main';

/**
 * PrayerModule — prayer times and a record of what was prayed.
 *
 * Times are computed on the device from the chosen coordinates, so the module
 * works offline and sends nothing anywhere. What was prayed goes into the daily
 * note's frontmatter (`fajr: ontime`), which means the log is ordinary Markdown:
 * greppable, syncable, and still readable if Zenith is ever uninstalled.
 */
export class PrayerModule extends BaseModule {
    readonly id = 'prayer';
    readonly name = 'Prayer';
    readonly description = 'Prayer times, computed locally, and a record of what you prayed.';
    readonly icon = 'moon-star';

    private disposers: Array<() => void> = [];
    private reminders: PrayerReminderService | null = null;

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        // The tracker used to be a view of its own. Vaults that had one open
        // still carry that leaf in their saved layout, and with no view type
        // registered for it Obsidian would leave an empty tab behind — so the
        // stale ones are cleared once the workspace has finished restoring.
        this.plugin.app.workspace.onLayoutReady(() => {
            this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_PRAYER);
        });

        this.registerCodeBlock(PRAYER_BLOCK_LANG, (_source, el, ctx) => {
            ctx.addChild(new PrayerBlockRenderer(el, this.plugin, ctx.sourcePath));
        });

        this.addCommand({
            id: 'open-prayer',
            name: 'Open Prayer tracker',
            callback: () => this.activateView(),
        });

        // The fast path: record the prayer whose time it is without opening
        // anything — which is the whole interaction, most days.
        this.addCommand({
            id: 'mark-current-prayer',
            name: 'Mark the current prayer as prayed',
            callback: () => void this.markCurrent(),
        });

        this.addCommand({
            id: 'prayer-times-today',
            name: "Show today's prayer times",
            callback: () => this.showTimes(),
        });

        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'prayer.times',
                title: 'Prayer',
                icon: 'moon-star',
                description: "The next prayer, a countdown, and today's five at a tap.",
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 25,
                component: PrayerWidget,
            }),
            this.plugin.registerNavAction({
                id: 'prayer.view',
                labelKey: 'nav.prayer',
                descriptionKey: 'nav.prayer.desc',
                icon: 'moon-star',
                order: 25,
                onClick: ({ app, plugin }) => new PrayerModal(app, plugin).open(),
            })
        );

        this.reminders = new PrayerReminderService();
        this.reminders.start();
    }

    async onunload(): Promise<void> {
        this.reminders?.stop();
        this.reminders = null;
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    /**
     * The module's "open me" entry point. Named for the interface it satisfies;
     * there is no view behind it any more, only the modal.
     */
    async activateView(): Promise<void> {
        new PrayerModal(this.plugin.app, this.plugin).open();
    }

    getSettingsSchema(): SettingsSchema {
        return prayerSettingsSchema;
    }

    /** Today's times, or null when there's nowhere to compute them for. */
    private today() {
        const { settings } = useZenithStore.getState();
        const place = prayerPlaceOf(settings);
        const locale = resolveLocale(settings.language);
        if (!place) {
            new Notice(translate(locale, 'prayer.noPlaceHint'));
            return null;
        }
        const now = new Date();
        return {
            settings,
            locale,
            now,
            times: prayerTimes(place, now, prayerCalcOptions(settings, now)).times,
        };
    }

    private async markCurrent(): Promise<void> {
        const context = this.today();
        if (!context) return;

        const { settings, locale, now, times } = context;
        const nowMinutes = minutesOfDay(now);
        const active = currentPrayer(times, nowMinutes);
        if (!active) return;

        // Before fajr the open window is yesterday's isha, so the record has to
        // land on yesterday — recording it against today would leave a hole in
        // the night that just passed and a false entry in the day ahead.
        const date = active.fromYesterday ? addDays(getTodayString(), -1) : getTodayString();

        const ok = await setPrayerStatus(
            this.plugin.app,
            settings,
            date,
            active.id,
            statusForTap(times, active.id, nowMinutes)
        );
        if (ok) {
            new Notice(
                `${translate(locale, `prayer.${active.id}`)} — ${translate(locale, 'prayer.status.ontime')}`
            );
        }
    }

    private showTimes(): void {
        const context = this.today();
        if (!context) return;

        const { locale, times } = context;
        const lines = PRAYERS.map(
            (id) => `${translate(locale, `prayer.${id}`)} — ${formatClock(times[id], locale)}`
        );
        new Notice(lines.join('\n'), 8000);
    }
}
