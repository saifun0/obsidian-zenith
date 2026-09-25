import { coreSchema } from '../../settings/schema/types';
import { SyncSettingsPanel } from './components/SyncSettingsPanel';
import { HAS_SHIPPED_DROPBOX, HAS_SHIPPED_ONEDRIVE } from './services/remotes/appIds';
import { scalarText } from '../../core/scalarText';

/**
 * Sync settings, as data.
 *
 * Two things live here and conflating them would be misleading. Merging
 * settings is quiet, safe and on by default; syncing files moves the user's
 * notes to a server and can delete them, so it stays off until asked for.
 *
 * What settings travel is deliberately NOT configurable. That is a property of
 * each setting, decided once in `statePolicy` where the compiler checks the
 * list is complete, rather than seventy checkboxes for the user to reason
 * about.
 *
 * ── The shape of the page ──
 *
 * It was twenty-five fields in a column with the state panel at the bottom,
 * which put the answer to "is it working" below every knob that might have
 * broken it — including the ones nobody has ever touched. A page ordered that
 * way asks the reader to configure a thing before it will tell them what the
 * thing is doing.
 *
 * So the state comes first, and the configuration is ordered by how often it
 * is true that somebody needs it:
 *
 *   · the switch, and for files the server — you cannot sync without these;
 *   · how often, which is now a switch and a number rather than a workflow;
 *   · and then three folds holding everything with a defensible default:
 *     encryption, scope, and the safety and throughput knobs.
 *
 * The last three are `collapsible` rather than `showIf`. A hidden field cannot
 * be discovered; a fold still says the group's name, which is the whole
 * difference between "this is advanced" and "this does not exist".
 *
 * They were subpages before they were folds, and the reason that was wrong is
 * specific to this page: three of its four sections lived behind a chevron
 * that replaced the screen, so setting up a server meant leaving the panel
 * that reports whether the server works — once per section, each time
 * returning to the top of a page that had scrolled. Nothing here is long
 * enough to earn a page of its own.
 */
export const syncSettingsSchema = coreSchema({
    moduleId: 'sync',
    groups: [
        // First, because it is the answer to the question anybody arriving
        // here is actually asking.
        {
            id: 'syncStatus',
            titleKey: 'sync.settings.statusGroup',
            descKey: 'sync.settings.statusGroup.desc',
            fields: [{ type: 'custom', key: 'syncDashboard', render: SyncSettingsPanel }],
        },
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
                // How often to ask the other devices. It used to sit on a
                // subpage called "More", with one other row for company — a
                // navigation step to save four lines of page.
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
                    type: 'action',
                    key: 'openSync',
                    labelKey: 'sync.settings.openTab',
                    descKey: 'sync.settings.openTab.desc',
                    buttonKey: 'sync.settings.open',
                    run: ({ plugin }) => {
                        void plugin.moduleManager.get('sync')?.activateView();
                    },
                    showIf: (v) => v.syncEnabled === true,
                },
                // Last in the group, because it is a statement about the rows
                // above rather than a control of its own: what travels is
                // decided in `statePolicy`, and this is where the page says so.
                {
                    type: 'heading',
                    key: 'whatSyncs',
                    labelKey: 'sync.settings.whatSyncs',
                    descKey: 'sync.settings.whatSyncs.desc',
                    showIf: (v) => v.syncEnabled === true,
                },
            ],
        },

        // ── Note files ───────────────────────────────
        {
            id: 'syncFiles',
            titleKey: 'sync.settings.filesGroup',
            descKey: 'sync.settings.filesGroup.desc',
            fields: [
                {
                    type: 'toggle',
                    key: 'syncFilesEnabled',
                    labelKey: 'sync.settings.files',
                    noteKey: 'sync.settings.files.note',
                    default: false,
                },
                // Stacked, not right-aligned. Four options is a strip wider
                // than the column a row leaves for its control, and squeezing
                // the label to fit it turned a one-line description into four.
                {
                    type: 'segmented',
                    key: 'syncRemoteKind',
                    labelKey: 'sync.settings.kind',
                    descKey: 'sync.settings.kind.desc',
                    layout: 'stack',
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
                    placeholderKey: 'sync.settings.oauthFolder.hint',
                    default: '',
                    showIf: (v) =>
                        v.syncFilesEnabled === true &&
                        (v.syncRemoteKind === 'dropbox' || v.syncRemoteKind === 'onedrive'),
                },

                // The automatic switch sits with the server rather than in the
                // advanced fold, because it is the difference between a vault
                // that is synced and one that could be — which is not a detail.
                {
                    type: 'toggle',
                    key: 'syncFilesAuto',
                    labelKey: 'sync.settings.auto',
                    descKey: 'sync.settings.auto.desc',
                    noteKey: 'sync.settings.auto.note',
                    default: true,
                    showIf: (v) => v.syncFilesEnabled === true,
                },
                {
                    type: 'number',
                    key: 'syncFilesIntervalMinutes',
                    labelKey: 'sync.settings.autoInterval',
                    default: 15,
                    min: 1,
                    max: 720,
                    step: 5,
                    unitKey: 'sync.settings.minutesUnit',
                    showIf: (v) => v.syncFilesEnabled === true && v.syncFilesAuto === true,
                },
            ],
        },

        // ── Folded: a default that is right until it is not ──
        {
            id: 'syncEncryption',
            titleKey: 'sync.settings.encryption',
            showIf: (v) => v.syncFilesEnabled === true,
            // Marked when the password is missing, because that is not an
            // advanced preference any more — it is the reason sync is refusing
            // to run, and it is on a page the user has no reason to open.
            alertIf: (v) =>
                v.syncEncryptionEnabled === true && !scalarText(v.syncEncryptionPassword).trim(),
            fields: [
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
                },
                {
                    type: 'text',
                    key: 'syncEncryptionPassword',
                    secret: true,
                    labelKey: 'sync.settings.encryptPassword',
                    descKey: 'sync.settings.encryptPassword.desc',
                    validate: (value, v) =>
                        v.syncEncryptionEnabled === true && !scalarText(value).trim()
                            ? 'sync.settings.encryptPassword.required'
                            : null,
                    // Two warnings in one note, both worth the space: it lives in
                    // `data.json` like every other credential here, and unlike
                    // every other credential here, losing it loses the data.
                    noteKey: 'sync.settings.encryptPassword.note',
                    default: '',
                    monospace: true,
                    layout: 'stack',
                    showIf: (v) => v.syncEncryptionEnabled === true,
                },
            ],
        },
        {
            id: 'syncScope',
            titleKey: 'sync.settings.scope',
            showIf: (v) => v.syncFilesEnabled === true,
            fields: [
                {
                    type: 'folder',
                    key: 'syncLocalRoot',
                    labelKey: 'sync.settings.localRoot',
                    placeholderKey: 'sync.settings.localRoot.hint',
                    default: '',
                },
                {
                    type: 'toggle',
                    key: 'syncIncludeConfigDir',
                    labelKey: 'sync.settings.includeConfig',
                    descKey: 'sync.settings.includeConfig.desc',
                    noteKey: 'sync.settings.includeConfig.note',
                    default: false,
                },
            ],
        },
        {
            id: 'syncSafety',
            titleKey: 'sync.settings.safety',
            descKey: 'sync.settings.safety.desc',
            showIf: (v) => v.syncFilesEnabled === true,
            fields: [
                {
                    type: 'segmented',
                    key: 'syncConflictAction',
                    labelKey: 'sync.settings.conflict',
                    descKey: 'sync.settings.conflict.desc',
                    // Named here rather than only in `autoPolicy`, because this
                    // is where the choice is made: two of these four discard a
                    // version, and a run that would do that is held back for
                    // review instead of applied.
                    noteKey: 'sync.settings.conflict.note',
                    layout: 'stack',
                    default: 'smart',
                    options: [
                        { value: 'smart', labelKey: 'sync.settings.conflict.smart' },
                        { value: 'keep_newer', labelKey: 'sync.settings.conflict.newer' },
                        { value: 'keep_larger', labelKey: 'sync.settings.conflict.larger' },
                        { value: 'keep_both', labelKey: 'sync.settings.conflict.both' },
                    ],
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
                },
                // S3 addressing and the region live down here with the rest of
                // the knobs. They are properties of a particular server rather
                // than decisions, and every S3 form in existence gets them
                // wrong by putting them beside the bucket.
                {
                    type: 'text',
                    key: 'syncS3Region',
                    labelKey: 'sync.settings.s3Region',
                    descKey: 'sync.settings.s3Region.desc',
                    default: '',
                    placeholder: 'us-east-1',
                    showIf: (v) => v.syncRemoteKind === 's3',
                },
                {
                    type: 'text',
                    key: 'syncS3Prefix',
                    labelKey: 'sync.settings.s3Prefix',
                    placeholderKey: 'sync.settings.s3Prefix.hint',
                    default: '',
                    showIf: (v) => v.syncRemoteKind === 's3',
                },
                {
                    type: 'toggle',
                    key: 'syncS3PathStyle',
                    labelKey: 'sync.settings.s3PathStyle',
                    descKey: 'sync.settings.s3PathStyle.desc',
                    default: false,
                    showIf: (v) => v.syncRemoteKind === 's3',
                },
            ],
        },
    ],
});
