import React, { useState, type FC } from 'react';
import { FuzzySuggestModal, Menu, Notice, type App, type TFile } from 'obsidian';
import { MoreHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useZenithStore } from '../../store';
import { useTranslation, type Translator } from '../../core/i18n';
import { getTodayString } from '../../core/dateUtils';
import { PromptModal } from '../../core/PromptModal';
import { Modal } from '../../components/shared/Modal';
import { ActionButton, SettingRow, Toggle } from '../controls';
import { ProfilePreview } from '../../core/profiles/ProfilePreview';
import {
    captureProfile,
    exportableProfile,
    parseProfile,
    serializeProfile,
    type ImportReport,
    type Profile,
    type StoredProfile,
} from '../../core/profiles/profiles';
import { TEMPLATES, templateProfile } from '../../core/profiles/templates';
import { exportToVault, profileFiles, undoProfile } from '../../core/profiles/profileActions';
import { DEFAULT_SETTINGS } from '../../store/settingsSlice';

interface Previewing {
    profile: Profile;
    name: string;
    template?: boolean;
    report?: ImportReport;
}

/** A stored profile's name as shown — the upgrade snapshot is named by the interface. */
export function storedName(p: StoredProfile, t: Translator): string {
    return p.kind === 'before' ? t('profiles.before') : p.name;
}

/** Pick a JSON file from the vault. */
class ProfileFileModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        private readonly onPick: (file: TFile) => void
    ) {
        super(app);
    }
    getItems(): TFile[] {
        return profileFiles(this.app);
    }
    getItemText(file: TFile): string {
        return file.path;
    }
    onChooseItem(file: TFile): void {
        this.onPick(file);
    }
}

/**
 * Settings → Profiles.
 *
 * Everything that changes the setup goes through the same preview: a
 * template, a profile of your own, an imported file. Nothing is applied from
 * this page without having been shown first what it will do.
 */
export const ProfilesSettings: FC = () => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [previewing, setPreviewing] = useState<Previewing | null>(null);
    const [exporting, setExporting] = useState<StoredProfile | Profile | null>(null);
    const [pasting, setPasting] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const today = getTodayString();
    const profiles = settings.profiles;
    const undo = settings.profileUndo;

    const setProfiles = (next: StoredProfile[]) => updateSettings({ profiles: next });

    /** Read a profile's text and preview it — or say why it could not be read. */
    const openText = (text: string) => {
        const result = parseProfile(text, DEFAULT_SETTINGS);
        if (!result.ok) {
            new Notice(t(`profiles.import.error.${result.error}`));
            return;
        }
        setPreviewing({
            profile: result.profile,
            name: result.profile.name || t('profiles.import.unnamed'),
            report: result.report,
        });
    };

    const saveCurrent = async () => {
        const name = await new PromptModal(app, {
            title: t('profiles.save'),
            placeholder: t('profiles.namePlaceholder'),
            confirmText: t('common.save'),
            cancelText: t('common.cancel'),
            maxLength: 80,
        }).ask();
        if (!name?.trim()) return;
        const profile = captureProfile(settings, name.trim(), today, { paths: true, place: true });
        setProfiles([...profiles, { ...profile, id: `p-${Date.now().toString(36)}` }]);
        new Notice(t('profiles.saved', { name: name.trim() }));
    };

    const rename = async (p: StoredProfile) => {
        const name = await new PromptModal(app, {
            title: t('profiles.rename'),
            initial: storedName(p, t),
            confirmText: t('common.save'),
            cancelText: t('common.cancel'),
            maxLength: 80,
        }).ask();
        if (!name?.trim()) return;
        // A renamed snapshot is the user's own profile from then on.
        setProfiles(
            profiles.map((x) => (x.id === p.id ? { ...x, name: name.trim(), kind: undefined } : x))
        );
    };

    const menu = (p: StoredProfile, e: React.MouseEvent) => {
        const m = new Menu();
        m.addItem((i) => i.setTitle(t('profiles.rename')).setIcon('pencil').onClick(() => void rename(p)));
        m.addItem((i) =>
            i
                .setTitle(t('profiles.export'))
                .setIcon('upload')
                .onClick(() => setExporting({ ...p, name: storedName(p, t) }))
        );
        m.addItem((i) =>
            i.setTitle(t('common.delete')).setIcon('trash-2').onClick(() => setDeleting(p.id))
        );
        m.showAtMouseEvent(e.nativeEvent);
    };

    return (
        <div className="zenith-settings__content">
            {undo && (
                <div className="zenith-settings__card">
                    <SettingRow
                        label={t('profiles.undo', { name: undo.name })}
                        desc={new Date(undo.at).toLocaleString(t.locale)}
                        group
                        compact
                    >
                        <ActionButton
                            label={t('profiles.undo.button')}
                            onClick={() => {
                                if (undoProfile()) new Notice(t('profiles.undone'));
                            }}
                        />
                    </SettingRow>
                </div>
            )}

            <h3 className="zenith-settings__section-label">{t('profiles.templates')}</h3>
            <div className="zenith-settings__card">
                {TEMPLATES.map((tpl) => {
                    const name = t(`profiles.template.${tpl.id}`);
                    return (
                        <SettingRow
                            key={tpl.id}
                            label={name}
                            desc={t(`profiles.template.${tpl.id}.desc`)}
                            group
                            compact
                        >
                            <ActionButton
                                label={t('profiles.review')}
                                onClick={() =>
                                    setPreviewing({
                                        profile: templateProfile(tpl, name, today),
                                        name,
                                        template: true,
                                    })
                                }
                            />
                        </SettingRow>
                    );
                })}
            </div>

            <h3 className="zenith-settings__section-label">{t('profiles.mine')}</h3>
            <div className="zenith-settings__card">
                {profiles.length === 0 && (
                    <div className="zenith-settings__empty-note">{t('profiles.mine.empty')}</div>
                )}
                {profiles.map((p) =>
                    deleting === p.id ? (
                        <SettingRow
                            key={p.id}
                            label={t('profiles.delete.confirm', { name: storedName(p, t) })}
                            group
                        >
                            <ActionButton
                                label={t('common.delete')}
                                danger
                                onClick={() => {
                                    setProfiles(profiles.filter((x) => x.id !== p.id));
                                    setDeleting(null);
                                }}
                            />
                            <ActionButton label={t('common.cancel')} onClick={() => setDeleting(null)} />
                        </SettingRow>
                    ) : (
                        <SettingRow
                            key={p.id}
                            label={storedName(p, t)}
                            desc={p.createdAt}
                            group
                            compact
                        >
                            <ActionButton
                                label={t('profiles.review')}
                                onClick={() => setPreviewing({ profile: p, name: storedName(p, t) })}
                            />
                            <button
                                type="button"
                                className="zenith-settings__icon-btn"
                                aria-label={t('profiles.more')}
                                onClick={(e) => menu(p, e)}
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </SettingRow>
                    )
                )}
                <SettingRow label={t('profiles.save')} desc={t('profiles.save.desc')} group compact>
                    <ActionButton label={t('profiles.save.button')} onClick={() => void saveCurrent()} />
                </SettingRow>
            </div>

            <h3 className="zenith-settings__section-label">{t('profiles.import')}</h3>
            <div className="zenith-settings__card">
                <SettingRow label={t('profiles.import.file')} desc={t('profiles.import.file.desc')} group compact>
                    <ActionButton
                        label={t('profiles.import.choose')}
                        onClick={() =>
                            new ProfileFileModal(app, (file) => {
                                void app.vault.read(file).then(openText);
                            }).open()
                        }
                    />
                </SettingRow>
                <SettingRow label={t('profiles.import.paste')} desc={t('profiles.import.paste.desc')} group compact>
                    <ActionButton label={t('profiles.import.pasteButton')} onClick={() => setPasting(true)} />
                </SettingRow>
            </div>

            {previewing && (
                <ProfilePreview
                    profile={previewing.profile}
                    name={previewing.name}
                    template={previewing.template}
                    report={previewing.report}
                    onClose={() => setPreviewing(null)}
                />
            )}
            {exporting && (
                <ExportDialog profile={exporting} onClose={() => setExporting(null)} />
            )}
            {pasting && (
                <PasteDialog
                    onClose={() => setPasting(false)}
                    onRead={(text) => {
                        setPasting(false);
                        openText(text);
                    }}
                />
            )}
        </div>
    );
};

/**
 * Export: to a file in the vault, or to the clipboard — which works on a
 * phone, where there is no file dialog to hand the file to.
 *
 * Folders and the user's place stay out unless asked for: someone else's
 * vault has other folders, and a profile passed on should not say where its
 * owner lives.
 */
const ExportDialog: FC<{ profile: Profile; onClose: () => void }> = ({ profile, onClose }) => {
    const t = useTranslation();
    const { app } = useApp();
    const [paths, setPaths] = useState(false);
    const [place, setPlace] = useState(false);
    const out = () => exportableProfile(profile, { paths, place });

    const footer = (
        <>
            <button
                className="zenith-btn zenith-btn--ghost"
                onClick={() => {
                    void navigator.clipboard.writeText(serializeProfile(out())).then(
                        () => new Notice(t('profiles.export.copied')),
                        () => new Notice(t('profiles.export.copyFailed'))
                    );
                    onClose();
                }}
            >
                {t('profiles.export.copy')}
            </button>
            <button
                className="zenith-btn zenith-btn--primary"
                onClick={() => {
                    void exportToVault(app, out()).then((path) =>
                        new Notice(t('profiles.export.written', { path }))
                    );
                    onClose();
                }}
            >
                {t('profiles.export.file')}
            </button>
        </>
    );

    return (
        <Modal title={t('profiles.export.title', { name: profile.name })} onClose={onClose} size="sm" footer={footer}>
            <div className="zenith-settings__card">
                <SettingRow label={t('profiles.export.paths')} desc={t('profiles.export.paths.desc')} compact>
                    <Toggle checked={paths} onChange={setPaths} />
                </SettingRow>
                <SettingRow label={t('profiles.export.place')} desc={t('profiles.export.place.desc')} compact>
                    <Toggle checked={place} onChange={setPlace} />
                </SettingRow>
            </div>
            <p className="zenith-profile-preview__hint">{t('profiles.export.never')}</p>
        </Modal>
    );
};

/** Paste a profile's JSON — what the clipboard export produces on another device. */
const PasteDialog: FC<{ onClose: () => void; onRead: (text: string) => void }> = ({
    onClose,
    onRead,
}) => {
    const t = useTranslation();
    const [text, setText] = useState('');

    const footer = (
        <>
            <button
                className="zenith-btn zenith-btn--ghost"
                onClick={() =>
                    void navigator.clipboard.readText().then(setText, () =>
                        new Notice(t('profiles.import.clipboardFailed'))
                    )
                }
            >
                {t('profiles.import.fromClipboard')}
            </button>
            <button
                className="zenith-btn zenith-btn--primary"
                disabled={!text.trim()}
                onClick={() => onRead(text)}
            >
                {t('profiles.review')}
            </button>
        </>
    );

    return (
        <Modal title={t('profiles.import.paste')} onClose={onClose} size="md" footer={footer}>
            <textarea
                className="zenith-input zenith-field__textarea zenith-profile-paste"
                rows={10}
                value={text}
                placeholder={'{ "zenith": "profile", … }'}
                onChange={(e) => setText(e.target.value)}
            />
        </Modal>
    );
};
