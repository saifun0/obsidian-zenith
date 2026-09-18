import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { PictureWidget } from './components/PictureWidget';
import { PictureSettings } from './components/PictureSettings';
import { pictureTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';
import type ZenithPlugin from '../../main';

/**
 * PictureModule — a photograph or a GIF as a widget.
 *
 * A module rather than a widget folded into the dashboard so that it can be
 * switched off whole — the dashboard's own module is not something anyone
 * wants to lose in order to be rid of a photograph.
 *
 * It has no settings page. Where the picture comes from belongs to one card
 * rather than to the module: a board may hold several pictures, and a page that
 * can only say "the picture" has no way to say which. Each copy is configured
 * on the back of its own card instead — see `PictureSettings`.
 *
 * Has no view of its own — the widget lives on the dashboard, so "activate"
 * opens the dashboard the way the navigator and weather modules do.
 */
export class PictureModule extends BaseModule {
    readonly id = 'picture';
    readonly name = 'Picture';
    readonly description = 'A photo or GIF on the dashboard, from a link or from the vault.';
    readonly icon = 'image';

    getTranslations(): TranslationTable {
        return pictureTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'picture.frame',
                title: 'Picture',
                titleKey: 'widget.picture',
                icon: 'image',
                description: 'A photo or a GIF, from a link or from the vault.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 80,
                component: PictureWidget,
                // The one widget on the board whose content the user supplies,
                // so two of them are two different things rather than the same
                // thing drawn twice.
                multiple: true,
                settings: PictureSettings,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_DASHBOARD);
    }
}
