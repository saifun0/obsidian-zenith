import { BaseModule } from '../../core/IModule';
import { mediaSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { MediaBannerService } from './MediaBannerService';
import { MediaPickerModal } from './MediaPickerModal';
import type ZenithPlugin from '../../main';
import { mediaTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * MediaModule — shows a chosen image/GIF as a banner above the file-explorer
 * folder tree, with a picker (URL / vault path / saved / all vault images).
 *
 * Has no dedicated view; "activate" opens the picker. Toggling the module off
 * removes the banner (the service is module-scoped).
 */
export class MediaModule extends BaseModule {
    readonly id = 'media';
    readonly name = 'Media Banner';
    readonly description = 'Show a GIF or image above the file explorer, with an easy picker.';
    readonly icon = 'image';

    getTranslations(): TranslationTable {
        return mediaTranslations;
    }

    private banner: MediaBannerService | null = null;
    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.banner = new MediaBannerService(this.plugin);
        this.banner.start();

        this.addCommand({
            id: 'open-media-picker',
            name: 'Open image / GIF picker',
            callback: () => new MediaPickerModal(this.plugin.app).open(),
        });

        // No view to open, so the launcher button opens the picker — the same
        // thing "activate" does for this module.
        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'media.picker',
                labelKey: 'nav.media',
                descriptionKey: 'nav.media.desc',
                icon: 'image',
                order: 60,
                onClick: ({ app }) => {
                    new MediaPickerModal(app).open();
                },
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.banner?.stop();
        this.banner = null;
    }

    async activateView(): Promise<void> {
        new MediaPickerModal(this.plugin.app).open();
    }

    getSettingsSchema(): SettingsSchema {
        return mediaSettingsSchema;
    }
}
