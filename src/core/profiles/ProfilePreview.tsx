import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import { useTranslation, type Translator } from '../i18n';
import { getFeature } from '../features';
import { localizeModule } from '../moduleLabels';
import { Modal } from '../../components/shared/Modal';
import { Segmented } from '../../settings/controls';
import { applyProfile, moduleContext } from './profileActions';
import {
    diffProfile,
    isEmptyDiff,
    profilePatch,
    type ApplyMode,
    type ImportReport,
    type Profile,
} from './profiles';

interface ProfilePreviewProps {
    profile: Profile;
    /** What the dialog and the undo button call it. */
    name: string;
    /** A built-in template — it leaves sync alone. */
    template?: boolean;
    /** What an import left out. */
    report?: ImportReport;
    onClose: () => void;
    onApplied?: () => void;
}

/**
 * What a profile would change, before it changes anything.
 *
 * The diff is worked out against the settings as they are now, and again when
 * the mode changes, so what is listed is exactly what "Apply" will do. The
 * features of a module going off are not listed one by one: the module going
 * off already says it.
 */
export const ProfilePreview: FC<ProfilePreviewProps> = ({
    profile,
    name,
    template = false,
    report,
    onClose,
    onApplied,
}) => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const available = useZenithStore((s) => s.availableModules);
    const [mode, setMode] = useState<ApplyMode>('replace');

    const diff = useMemo(
        () => diffProfile(settings, profilePatch(settings, profile, mode, moduleContext(template))),
        [settings, profile, mode, template]
    );

    const moduleName = (id: string) => {
        const manifest = available.find((m) => m.id === id);
        return manifest ? localizeModule(t, manifest).name : id;
    };
    const featureName = (id: string) => {
        const def = getFeature(id);
        return def ? t(def.labelKey) : id;
    };

    const missingModules = profile.modules.filter((id) => !available.some((m) => m.id === id));
    const skipped = [
        ...(report?.unknownSettings ?? []),
        ...(report?.rejectedSettings ?? []),
        ...(report?.unknownFeatures ?? []),
    ];

    const apply = () => {
        if (applyProfile(profile, mode, template, name)) {
            new Notice(t('profiles.applied', { name }));
        }
        onApplied?.();
        onClose();
    };

    const footer = (
        <>
            <button className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
            </button>
            <button
                className="zenith-btn zenith-btn--primary"
                onClick={apply}
                disabled={isEmptyDiff(diff)}
            >
                {t('profiles.apply')}
            </button>
        </>
    );

    return (
        <Modal title={t('profiles.preview.title', { name })} onClose={onClose} size="md" footer={footer}>
            <div className="zenith-profile-preview">
                <Segmented
                    value={mode}
                    options={[
                        { value: 'replace', label: t('profiles.mode.replace') },
                        { value: 'add', label: t('profiles.mode.add') },
                    ]}
                    onChange={(v) => setMode(v as ApplyMode)}
                />
                <p className="zenith-profile-preview__hint">{t(`profiles.mode.${mode}.desc`)}</p>

                {isEmptyDiff(diff) ? (
                    <p className="zenith-profile-preview__empty">{t('profiles.preview.nothing')}</p>
                ) : (
                    <>
                        <Change
                            t={t}
                            label="profiles.preview.on"
                            names={[...diff.modulesOn.map(moduleName), ...diff.featuresOn.map(featureName)]}
                        />
                        <Change
                            t={t}
                            label="profiles.preview.off"
                            names={[...diff.modulesOff.map(moduleName), ...diff.featuresOff.map(featureName)]}
                        />
                        {diff.settingsChanged.length > 0 && (
                            <p className="zenith-profile-preview__line">
                                {t.plural('profiles.preview.settings', diff.settingsChanged.length)}
                            </p>
                        )}
                    </>
                )}

                {(missingModules.length > 0 || skipped.length > 0) && (
                    <div className="zenith-profile-preview__report">
                        {missingModules.length > 0 && (
                            <p>{t('profiles.report.modules', { list: missingModules.join(', ') })}</p>
                        )}
                        {skipped.length > 0 && (
                            <p>{t('profiles.report.skipped', { list: skipped.join(', ') })}</p>
                        )}
                    </div>
                )}

                <p className="zenith-profile-preview__hint">{t('profiles.preview.undo')}</p>
            </div>
        </Modal>
    );
};

const Change: FC<{ t: Translator; label: string; names: string[] }> = ({ t, label, names }) =>
    names.length === 0 ? null : (
        <p className="zenith-profile-preview__line">
            <span className="zenith-profile-preview__label">{t(label)}</span> {names.join(', ')}
        </p>
    );
