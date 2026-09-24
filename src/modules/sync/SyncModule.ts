import { Notice } from 'obsidian';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BaseModule } from '../../core/IModule';
import { useZenithStore } from '../../store';
import { SyncQuickModal } from './SyncQuickModal';
import { syncSettingsSchema } from './settings.schema';
import { SettingsSyncService } from './services/settingsSync';
import { FileSyncService } from './services/fileSync';
import { FileSyncAuto } from './services/fileSyncAuto';
import { SyncProgressNotice } from './SyncProgressNotice';
import { SyncStatusBar } from './components/SyncStatusBar';
import { DROPBOX_PROTOCOL_ACTION } from './services/remotes/appIds';
import { DropboxRemote } from './services/remotes/dropboxRemote';
import type { SettingsSchema } from '../../settings/schema/types';
import { syncTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';
import { translateNow } from '../../core/i18n';

/**
 * SyncModule — keeps Zenith's settings consistent across devices.
 *
 * The problem it exists for: settings are persisted as one blob and read once
 * at load, so two devices open at the same time each hold a full copy and
 * whichever saves last overwrites every setting the other changed — dashboard
 * presets, installed modules, folder icons, trackers, all of it. Merging per
 * field turns "two devices changed two different settings" back into what it
 * looks like to the person using them, which is nothing at all.
 *
 * The transport is whatever already carries the vault — Obsidian Sync, Remotely
 * Save, Syncthing, iCloud, git. This module adds no network of its own; it only
 * makes what travels mergeable. See `syncTypes` for why each device writes only
 * its own file.
 */
export class SyncModule extends BaseModule {
    readonly id = 'sync';
    readonly name = 'Sync';
    readonly description = 'Merge settings across your devices instead of overwriting them.';
    readonly icon = 'refresh-cw';

    getTranslations(): TranslationTable {
        return syncTranslations;
    }

    private service: SettingsSyncService | null = null;
    private files: FileSyncService | null = null;
    /** Presses the file engine's button so the user does not have to. */
    private auto: FileSyncAuto | null = null;
    /** Reports a file run wherever the user is; see `SyncProgressNotice`. */
    private progress: SyncProgressNotice | null = null;
    private disposers: Array<() => void> = [];

    async onload(): Promise<void> {
        this.service = new SettingsSyncService(this.plugin);
        this.plugin.settingsSync = this.service;

        this.files = new FileSyncService(
            this.plugin,
            this.service.deviceId,
            () => this.service?.getStatus().deviceName ?? 'device'
        );
        this.plugin.fileSync = this.files;

        // The engine still has no timer of its own — it is a thing that plans
        // and applies, and it knows nothing about when. The scheduler above it
        // is what turns "I will sync when you ask" into "it is already synced",
        // and it is the only thing in the plugin allowed to start a run
        // nobody asked for.
        this.auto = new FileSyncAuto(this.plugin, this.files);
        this.plugin.fileSyncAuto = this.auto;

        // A transfer takes minutes and the page it was started from is the one
        // page nobody stays on. The notice is how the run follows them out.
        this.progress = new SyncProgressNotice(this.files);

        await this.applyEnabledState();

        // Both settings restart the service rather than reconfigure it: it
        // holds a poll timer, a store subscription and a logical clock, and
        // rebuilding those is simpler to reason about than mutating them live.
        this.disposers.push(
            useZenithStore.subscribe(
                (s) => `${s.settings.syncEnabled}|${s.settings.syncPollSeconds}`,
                () => {
                    void this.applyEnabledState();
                }
            )
        );

        // The scheduler is restarted for the same reason: it holds a timer, a
        // set of vault listeners and a focus handler, all built from settings
        // that were read once. The backend fields are in the key as well as the
        // switches, because editing a server address is how a configuration
        // goes from unusable to usable, and the engine should start watching
        // the moment it does rather than at the next reload.
        this.disposers.push(
            useZenithStore.subscribe(
                (s) =>
                    [
                        s.settings.syncFilesEnabled,
                        s.settings.syncFilesAuto,
                        s.settings.syncFilesIntervalMinutes,
                        s.settings.syncRemoteKind,
                        s.settings.syncRemoteUrl,
                        s.settings.syncS3Endpoint,
                        s.settings.syncEncryptionEnabled,
                    ].join('|'),
                () => {
                    this.files?.refresh();
                    this.restartAuto();
                }
            )
        );

        this.addViewCommand({
            id: 'open-sync',
            name: 'Open sync',
            callback: () => this.activateView(),
        });

        this.addCommand({
            id: 'sync-now',
            name: 'Sync settings now',
            callback: () => {
                void this.syncNow();
            },
        });

        this.addCommand({
            id: 'sync-files-now',
            name: 'Sync note files now',
            callback: () => {
                void this.auto?.run(true);
            },
        });

        this.restartAuto();

        // Dropbox sends the user back here after they approve. Registered on the
        // plugin because the callback arrives whether or not anything of ours is
        // open — that is the point of it.
        this.plugin.registerObsidianProtocolHandler(DROPBOX_PROTOCOL_ACTION, (params) => {
            void this.finishDropboxAuth(params);
        });

        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'sync.view',
                labelKey: 'nav.sync',
                descriptionKey: 'nav.sync.desc',
                icon: 'refresh-cw',
                order: 70,
                onClick: () => void this.activateView(),
            })
        );

        // The ribbon, beside Zenith's own icon.
        //
        // Registered here rather than in `main.ts` — where the `brain` icon
        // lives — so that it arrives and leaves with the module. An icon for a
        // module somebody switched off is a button that reports on nothing,
        // and `main.ts` has no way to know when that happened.
        const ribbon = this.plugin.addRibbonIcon('refresh-cw', translateNow('sync.quick.title'), () =>
            void this.activateView()
        );
        this.disposers.push(() => ribbon.remove());

        if (this.files) this.mountStatusBar(this.files);
    }

    /**
     * The status bar item, bottom right. Removed by hand for the same reason
     * the ribbon icon is: the module can be switched off while the plugin
     * stays loaded, and the plugin's own cleanup would leave it behind.
     *
     * Obsidian does not show a status bar on phones, so there this is simply
     * never seen — the progress notice and the dialog are what mobile has.
     */
    private mountStatusBar(files: FileSyncService): void {
        const host = this.plugin.addStatusBarItem();
        host.addClass('mod-clickable', 'zenith-syncbar-host');
        host.addEventListener('click', () => void this.activateView());

        const root = createRoot(host);
        root.render(createElement(SyncStatusBar, { service: files }));
        this.disposers.push(() => {
            root.unmount();
            host.remove();
        });
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.progress?.dispose();
        this.progress = null;
        this.auto?.stop();
        this.auto = null;
        this.service?.stop();
        this.service = null;
        this.files = null;
        this.plugin.settingsSync = null;
        this.plugin.fileSync = null;
        this.plugin.fileSyncAuto = null;
    }

    /** Rebuild the scheduler from the settings as they stand now. */
    private restartAuto(): void {
        this.auto?.stop();
        this.auto?.start();
    }

    /**
     * Open the quick dialog.
     *
     * Named `activateView` still, because that is the verb every caller in the
     * plugin already uses for "show me this module" — the launcher, the
     * command, the held-plan notice. What changed is that showing it no longer
     * costs a tab.
     */
    async activateView(): Promise<void> {
        new SyncQuickModal(this.plugin.app, this.plugin).open();
    }

    getSettingsSchema(): SettingsSchema {
        return syncSettingsSchema;
    }

    /** Start or stop the service to match the current settings. */
    private async applyEnabledState(): Promise<void> {
        if (!this.service) return;
        const { syncEnabled, syncPollSeconds } = useZenithStore.getState().settings;

        this.service.stop();
        if (!syncEnabled) return;

        // Clamped rather than trusted: this comes back from `data.json`, and a
        // zero or negative interval would spin the poll timer flat out.
        const seconds = Math.min(600, Math.max(5, Math.round(syncPollSeconds) || 20));
        await this.service.start(seconds * 1000);
    }

    /**
     * Finish an authorization the browser has just handed back.
     *
     * Runs outside any view, so everything it has to say it says with a notice.
     * The three ways this legitimately fails — the user pressed Cancel, the
     * callback does not match anything this device started, the exchange itself
     * was refused — are each worth a different sentence, because the thing to
     * do about them is different.
     */
    private async finishDropboxAuth(params: Record<string, string>): Promise<void> {
        const pending = this.plugin.oauthPending;

        if (params.error) {
            pending.cancel();
            new Notice(
                `Zenith: Dropbox did not authorize this device — ${params.error_description || params.error}`
            );
            return;
        }

        const claimed = pending.take(params.state ?? '');
        if (!claimed || !params.code) {
            // Either nothing was in flight, or this callback answers a request
            // we never made. Both are the same instruction to the user, and
            // saying which would tell whoever sent it how close they got.
            new Notice(
                'Zenith: that Dropbox link does not match an authorization started here. Press Connect again.'
            );
            return;
        }

        const result = await DropboxRemote.completeAuthorization({
            // The id the flow began with, not whatever is in settings now — a
            // code is only valid for the app that asked for it.
            clientId: claimed.clientId,
            code: params.code,
            verifier: claimed.verifier,
            redirectUri: claimed.redirectUri,
        });

        if (!result.ok) {
            new Notice(translateNow('notice.dropboxFailed', { error: result.error.message }));
            return;
        }

        useZenithStore.getState().updateSettings({ syncDropboxTokens: result.tokens });
        this.files?.refresh();
        new Notice(translateNow('notice.dropboxConnected'));
    }

    private async syncNow(): Promise<void> {
        if (!this.service?.getStatus().enabled) {
            new Notice(translateNow('notice.syncOff'));
            return;
        }
        await this.service.pull();
        await this.service.publish();
        const { error } = this.service.getStatus();
        new Notice(error ? `Zenith: sync failed — ${error}` : 'Zenith: settings synced.');
    }
}
