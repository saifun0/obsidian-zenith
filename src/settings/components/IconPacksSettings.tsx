import React, { useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../core/i18n';
import { CustomIcon, useIconSources } from '../../components/shared/CustomIcon';

/** How many sample glyphs to show per pack before trailing off. */
const PREVIEW = 8;

/**
 * IconPacksSettings — what is installed, what it contributed, and what it
 * couldn't.
 *
 * The failure list is the point of this panel. Packs are folders a user copied
 * in from somewhere, so "I dropped in 40 icons and 38 showed up" is a normal
 * outcome; without somewhere to read *which* two were rejected and why, the
 * only symptom is an icon that silently isn't there.
 */
export const IconPacksSettings: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const sources = useIconSources();
    const [reloading, setReloading] = useState(false);

    const reload = async () => {
        if (reloading) return;
        setReloading(true);
        try {
            await plugin.loadIconPacks();
        } finally {
            setReloading(false);
        }
    };

    const reportFor = (id: string) => plugin.iconPackReports.find((r) => r.id === id);

    return (
        <>
            <div className="zenith-settings__section-label">{t('settings.iconPacks')}</div>
            <div className="zenith-settings__item-desc zenith-settings__item-desc--block">
                {t('settings.iconPacks.desc')}
            </div>

            <div className="zenith-settings__item">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t('settings.iconPacks.reload')}</span>
                    <span className="zenith-settings__item-desc">
                        {t('settings.iconPacks.reload.desc')}
                    </span>
                </div>
                <div className="zenith-settings__item-control">
                    <button
                        className="zenith-settings__inline-btn"
                        disabled={reloading}
                        onClick={() => void reload()}
                    >
                        <RotateCw size={13} className={reloading ? 'zenith-spin' : ''} />
                        {t('common.refresh')}
                    </button>
                </div>
            </div>

            {sources.length === 0 ? (
                <div className="zenith-settings__empty-note">{t('settings.iconPacks.empty')}</div>
            ) : (
                <div className="zenith-settings__widget-list">
                    {sources.map((source) => {
                        const report = reportFor(source.id);
                        return (
                            <div key={source.id} className="zenith-iconpack">
                                <div className="zenith-iconpack__head">
                                    <span className="zenith-iconpack__name">{source.label}</span>
                                    <span className="zenith-iconpack__meta">
                                        {source.kind === 'module'
                                            ? t('settings.iconPacks.fromModule')
                                            : (source.author ?? source.id)}
                                    </span>
                                    <span className="zenith-iconpack__count">
                                        {t.plural('settings.iconPacks.icons', source.icons.length)}
                                    </span>
                                </div>

                                {source.icons.length > 0 && (
                                    <div className="zenith-iconpack__preview">
                                        {source.icons.slice(0, PREVIEW).map((icon) => (
                                            <span
                                                key={icon.id}
                                                className="zenith-iconpack__glyph"
                                                title={icon.name}
                                            >
                                                <CustomIcon svg={icon.svg} size={18} />
                                            </span>
                                        ))}
                                        {source.icons.length > PREVIEW && (
                                            <span className="zenith-iconpack__more">
                                                +{source.icons.length - PREVIEW}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {report && report.skipped.length > 0 && (
                                    <ul className="zenith-iconpack__skipped">
                                        {report.skipped.map((skip) => (
                                            <li key={skip.file}>
                                                <AlertTriangle size={12} />
                                                <code>{skip.file}</code>
                                                <span>{skip.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};
