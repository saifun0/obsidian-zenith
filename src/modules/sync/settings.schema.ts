import { coreSchema } from '../../settings/schema/types';
import { HAS_SHIPPED_DROPBOX, HAS_SHIPPED_ONEDRIVE } from './services/remotes/appIds';

/**
 * Sync settings, as data.
 *
 * Two groups, because there are two separate things here and conflating them
 * would be misleading. Merging settings is quiet, safe and on by default;
 * syncing files moves the user's notes to a server and can delete them, so it is
 * off until asked for and it never runs on a timer.
 *
 * What settings travel is deliberately NOT configurable. That is a property of
 * each setting, decided once in `statePolicy` where the compiler checks the list
 * is complete, rather than seventy checkboxes for the user to reason about.
 */
export const syncSettingsSchema = coreSchema({
    moduleId: 'sync',
    groups: [
        {
            id: 'sync',
            titleKey: 'sync.settings.stateGroup',
            fields: [
                {
                    type: 'toggle',
                    key: 'syncEnabled',
                    labelKey: 'sync.settings.enabled',
                    descKey: 'sync.settings.enabled.desc',
                    default: true,
                },
                {
                    type: 'number',
                    key: 'syncPollSeconds',
                    labelKey: 'sync.settings.pollSeconds',
                    descKey: 'sync.settings.pollSeconds.desc',
                    default: 20,
                    min: 5,
                    max: 600,
                    step: 5,
                    unitKey: 'settings.secondsUnit',
                    showIf: (v) => v.syncEnabled === true,
                },
                {
                    type: 'heading',
                    key: 'whatSyncs',
                    labelKey: 'sync.settings.whatSyncs',
                    descKey: 'sync.settings.whatSyncs.desc',
                },
                {
                    type: 'action',
                    key: 'openSync',
                    labelKey: 'sync.title',
                    descKey: 'sync.desc',
                    buttonKey: 'sync.settings.open',
                    cta: true,
                    run: ({ plugin }) => {
                        void plugin.moduleManager.get('sync')?.activateView();
                    },
                },
            ],
        },
        {
            id: 'syncFiles',
            titleKey: 'sync.settings.filesGroup',
            descKey: 'sync.settings.filesGroup.desc',
            fields: [
                {
                    type: 'toggle',
                    key: 'syncFilesEnabled',
                    labelKey: 'sync.settings.files',
                    descKey: 'sync.settings.files.desc',
                    noteKey: 'sync.settings.files.note',
                    default: false,
                },
                {
                    type: 'heading',
                    key: 'serverHeading',
                    labelKey: 'sync.settings.server',
                    descKey: 'sync.settings.server.desc',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'segmented',
                    key: 'syncRemoteKind',
                    labelKey: 'sync.settings.kind',
                    descKey: 'sync.settings.kind.desc',
                    default: 'webdav',
                    options: [
                        { value: 'webdav', labelKey: 'sync.settings.kind.webdav' },
                        { value: 's3', labelKey: 'sync.settings.kind.s3' },
                        { value: 'dropbox', labelKey: 'sync.settings.kind.dropbox' },
                        { value: 'onedrive', labelKey: 'sync.settings.kind.onedrive' },
                    ],
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'text',
                    key: 'syncRemoteUrl',
                    labelKey: 'sync.settings.url',
                    descKey: 'sync.settings.url.desc',
                    default: '',
                    placeholder: 'https://host/remote.php/dav/files/me',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'webdav',
                },
                {
                    type: 'text',
                    key: 'syncRemoteUser',
                    labelKey: 'sync.settings.user',
                    default: '',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'webdav',
                },
                {
                    type: 'text',
                    key: 'syncRemotePassword',
                    secret: true,
                    labelKey: 'sync.settings.password',
                    // Said plainly rather than left to assumption: Obsidian
                    // offers plugins no keychain, so this sits in `data.json` in
                    // the vault like every other plugin credential.
                    noteKey: 'sync.settings.password.note',
                    default: '',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'webdav',
                },
                {
                    type: 'text',
                    key: 'syncRemoteDir',
                    labelKey: 'sync.settings.remoteDir',
                    descKey: 'sync.settings.remoteDir.desc',
                    default: '',
                    placeholder: 'my-vault',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'webdav',
                },
                {
                    type: 'text',
                    key: 'syncS3Endpoint',
                    labelKey: 'sync.settings.s3Endpoint',
                    descKey: 'sync.settings.s3Endpoint.desc',
                    default: '',
                    placeholder: 'https://s3.eu-central-1.amazonaws.com',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3Bucket',
                    labelKey: 'sync.settings.s3Bucket',
                    default: '',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3Region',
                    labelKey: 'sync.settings.s3Region',
                    descKey: 'sync.settings.s3Region.desc',
                    default: '',
                    placeholder: 'us-east-1',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3AccessKey',
                    labelKey: 'sync.settings.s3Access',
                    default: '',
                    monospace: true,
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3Secret',
                    secret: true,
                    labelKey: 'sync.settings.s3Secret',
                    noteKey: 'sync.settings.password.note',
                    default: '',
                    monospace: true,
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3Prefix',
                    labelKey: 'sync.settings.s3Prefix',
                    descKey: 'sync.settings.s3Prefix.desc',
                    default: '',
                    placeholder: 'my-vault',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'toggle',
                    key: 'syncS3PathStyle',
                    labelKey: 'sync.settings.s3PathStyle',
                    descKey: 'sync.settings.s3PathStyle.desc',
                    default: false,
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncDropboxClientId',
                    labelKey: 'sync.settings.dropboxClientId',
                    // Two readings of the same field. With a registration in the
                    // build it is an override and the copy should say so; with
                    // none it is required, and offering to leave it empty would
                    // be an instruction that does not work.
                    descKey: HAS_SHIPPED_DROPBOX
                        ? 'sync.settings.dropboxClientId.optional'
                        : 'sync.settings.dropboxClientId.desc',
                    noteKey: HAS_SHIPPED_DROPBOX
                        ? 'sync.settings.ownApp.optional'
                        : 'sync.settings.ownApp.note',
                    default: '',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'dropbox',
                },
                {
                    type: 'text',
                    key: 'syncOnedriveClientId',
                    labelKey: 'sync.settings.onedriveClientId',
                    descKey: HAS_SHIPPED_ONEDRIVE
                        ? 'sync.settings.onedriveClientId.optional'
                        : 'sync.settings.onedriveClientId.desc',
                    noteKey: HAS_SHIPPED_ONEDRIVE
                        ? 'sync.settings.ownApp.optional'
                        : 'sync.settings.ownApp.note',
                    default: '',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncRemoteKind === 'onedrive',
                },
                {
                    type: 'text',
                    key: 'syncOauthFolder',
                    labelKey: 'sync.settings.oauthFolder',
                    descKey: 'sync.settings.oauthFolder.desc',
                    default: '',
                    placeholder: 'my-vault',
                    showIf: (v) =>
                        v.syncFilesEnabled === true &&
                        (v.syncRemoteKind === 'dropbox' || v.syncRemoteKind === 'onedrive'),
                },
                {
                    type: 'heading',
                    key: 'encryptionHeading',
                    labelKey: 'sync.settings.encryption',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'toggle',
                    key: 'syncEncryptionEnabled',
                    labelKey: 'sync.settings.encrypt',
                    descKey: 'sync.settings.encrypt.desc',
                    // Said before the switch is flipped, not after: turning this
                    // on points the device at what is, as far as the engine is
                    // concerned, a different remote. An existing folder is
                    // refused rather than mixed into.
                    noteKey: 'sync.settings.encrypt.note',
                    default: false,
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'text',
                    key: 'syncEncryptionPassword',
                    secret: true,
                    labelKey: 'sync.settings.encryptPassword',
                    descKey: 'sync.settings.encryptPassword.desc',
                    validate: (value, v) =>
                        v.syncEncryptionEnabled === true && !String(value ?? '').trim()
                            ? 'sync.settings.encryptPassword.required'
                            : null,
                    // Two warnings in one note, both worth the space: it lives in
                    // `data.json` like every other credential here, and unlike
                    // every other credential here, losing it loses the data.
                    noteKey: 'sync.settings.encryptPassword.note',
                    default: '',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncEncryptionEnabled === true,
                },
                {
                    type: 'heading',
                    key: 'scopeHeading',
                    labelKey: 'sync.settings.scope',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'folder',
                    key: 'syncLocalRoot',
                    labelKey: 'sync.settings.localRoot',
                    descKey: 'sync.settings.localRoot.desc',
                    default: '',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'toggle',
                    key: 'syncIncludeConfigDir',
                    labelKey: 'sync.settings.includeConfig',
                    descKey: 'sync.settings.includeConfig.desc',
                    noteKey: 'sync.settings.includeConfig.note',
                    default: false,
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'heading',
                    key: 'safetyHeading',
                    labelKey: 'sync.settings.safety',
                    descKey: 'sync.settings.safety.desc',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'segmented',
                    key: 'syncConflictAction',
                    labelKey: 'sync.settings.conflict',
                    descKey: 'sync.settings.conflict.desc',
                    default: 'smart',
                    options: [
                        { value: 'smart', labelKey: 'sync.settings.conflict.smart' },
                        { value: 'keep_newer', labelKey: 'sync.settings.conflict.newer' },
                        { value: 'keep_larger', labelKey: 'sync.settings.conflict.larger' },
                        { value: 'keep_both', labelKey: 'sync.settings.conflict.both' },
                    ],
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'slider',
                    key: 'syncProtectPercent',
                    labelKey: 'sync.settings.protect',
                    descKey: 'sync.settings.protect.desc',
                    default: 25,
                    min: 1,
                    max: 100,
                    step: 1,
                    unitKey: 'sync.settings.percentUnit',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'number',
                    key: 'syncMaxFileMb',
                    labelKey: 'sync.settings.maxFile',
                    descKey: 'sync.settings.maxFile.desc',
                    default: 100,
                    min: 0,
                    max: 5000,
                    step: 10,
                    unitKey: 'sync.settings.mbUnit',
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'number',
                    key: 'syncConcurrency',
                    labelKey: 'sync.settings.concurrency',
                    descKey: 'sync.settings.concurrency.desc',
                    default: 4,
                    min: 1,
                    max: 16,
                    step: 1,
                    showIf: (v) => v.syncFilesEnabled === true,
                },
            ],
        },
    ],
});
