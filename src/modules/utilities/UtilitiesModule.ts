import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { PictureWidget } from './components/PictureWidget';
import { PictureSettings } from './components/PictureSettings';
import { TextSettings, TextWidget } from './components/TextWidget';
import { LinksSettings, LinksWidget } from './components/LinksWidget';
import { RecentSettings, RecentWidget } from './components/RecentWidget';
import { CaptureSettings, CaptureWidget } from './components/CaptureWidget';
import { TimerSettings, TimerWidget } from './components/TimerWidget';
import { TimerReminderService } from './timerReminders';
import { TIMER_WIDGET_ID } from './timer';
import { utilitiesTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';
import type ZenithPlugin from '../../main';

/**
 * UtilitiesModule — the small cards a board is furnished with: a text or a
 * note, a picture, links, recent notes, a line to write a thought on, a timer.
 *
 * None of them belongs to a view. Each is a thing the user puts on the board
 * and fills in themselves, which is why they are in one module rather than in
 * the dashboard's own: the whole set can be switched off without losing the
 * dashboard, and a board that wants none of it does not list it.
 *
 * It began as the picture module, and its id is still `picture`. The id is
 * what settings, saved profiles and every other device of the same vault know
 * the module by; a new one would switch it off wherever an older build still
 * runs, and take the pictures off those boards with it. The widgets' ids keep
 * the same head for the same reason — and because the gallery files a widget
 * under its module by that head.
 *
 * It has no settings page. What a card shows belongs to that card — a board
 * may hold three texts — so each is set up on the back of its own card.
 *
 * Has no view of its own, so "activate" opens the dashboard the way the
 * navigator and weather modules do.
 */
export class UtilitiesModule extends BaseModule {
    readonly id = 'picture';
    readonly name = 'Utilities';
    readonly description =
        'Small cards for the dashboard: a text or a note, a picture, links, recent notes, a quick note and a timer.';
    readonly icon = 'shapes';

    getTranslations(): TranslationTable {
        return utilitiesTranslations;
    }

    private disposers: Array<() => void> = [];
    private timers: TimerReminderService | null = null;

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'picture.text',
                title: 'Text',
                titleKey: 'widget.utilities.text',
                icon: 'letter-text',
                description: 'Your own words, or the top of a note from the vault.',
                descriptionKey: 'widget.utilities.text.desc',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 78,
                // Content the user supplies: two of them are two different
                // things. The same goes for every card below that says so.
                multiple: true,
                settings: TextSettings,
                component: TextWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'picture.frame',
                title: 'Picture',
                titleKey: 'widget.picture',
                icon: 'image',
                description: 'A photo or a GIF, from a link or from the vault.',
                descriptionKey: 'widget.picture.desc',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 80,
                multiple: true,
                settings: PictureSettings,
                component: PictureWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'picture.links',
                title: 'Links',
                titleKey: 'widget.utilities.links',
                icon: 'link',
                description: 'Notes and addresses you go back to, a tap away.',
                descriptionKey: 'widget.utilities.links.desc',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 82,
                multiple: true,
                settings: LinksSettings,
                component: LinksWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'picture.recent',
                title: 'Recent notes',
                titleKey: 'widget.utilities.recent',
                icon: 'history',
                description: 'The notes you last changed, or the files you last opened.',
                descriptionKey: 'widget.utilities.recent.desc',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 84,
                settings: RecentSettings,
                component: RecentWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'picture.capture',
                title: 'Quick note',
                titleKey: 'widget.utilities.capture',
                icon: 'pen-line',
                description:
                    'A line to write a thought on, filed in today’s note or one you choose.',
                descriptionKey: 'widget.utilities.capture.desc',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 86,
                multiple: true,
                settings: CaptureSettings,
                component: CaptureWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: TIMER_WIDGET_ID,
                title: 'Timer',
                titleKey: 'widget.utilities.timer',
                icon: 'timer',
                description: 'A countdown that tells you when the time is up.',
                descriptionKey: 'widget.utilities.timer.desc',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 88,
                multiple: true,
                settings: TimerSettings,
                component: TimerWidget,
            })
        );

        this.timers = new TimerReminderService(this.plugin);
        this.timers.start();
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.timers?.stop();
        this.timers = null;
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_DASHBOARD);
    }
}
