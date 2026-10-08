import React, { useCallback, useEffect, useState, type FC } from 'react';
import { TFile } from 'obsidian';
import { FileText, FileX, FolderOpen } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { pickVaultFile } from '../../../components/shared/VaultFilePickerModal';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import {
    TEXT_ALIGNS,
    TEXT_SIZES,
    TEXT_SOURCES,
    noteBody,
    noteName,
    normalizeTextSettings,
    textState,
    type TextAlign,
    type TextSize,
    type TextSource,
} from '../textSource';
import { Markdown } from './Markdown';

/**
 * A note's text, kept current.
 *
 * `undefined` while the first read is under way, `null` when the path names no
 * note. The vault is listened to rather than polled: an edit to the note shows
 * on the card as it is saved, and a note that arrives later — a sync, or the
 * vault still being read at startup — fills a card that had found nothing.
 */
function useNoteBody(path: string, onRenamed: (path: string) => void): string | null | undefined {
    const { app } = useApp();
    const [read, setRead] = useState<{ path: string; body: string | null } | null>(null);

    useEffect(() => {
        let stale = false;
        const load = async () => {
            const file = app.vault.getAbstractFileByPath(path);
            const body = file instanceof TFile ? noteBody(await app.vault.cachedRead(file)) : null;
            if (!stale) setRead({ path, body });
        };
        void load();

        const again = (file: { path: string }) => {
            if (file.path === path) void load();
        };
        const refs = [
            app.vault.on('modify', again),
            app.vault.on('create', again),
            app.vault.on('delete', again),
            // A note moved or renamed is still the note this card shows.
            app.vault.on('rename', (file, oldPath) => {
                if (oldPath === path) onRenamed(file.path);
                else again(file);
            }),
        ];
        return () => {
            stale = true;
            refs.forEach((ref) => app.vault.offref(ref));
        };
    }, [app, path, onRenamed]);

    // What was read for another path is not this note's text.
    return read?.path === path ? read.body : undefined;
}

const NoteText: FC<{ path: string; className: string; onRenamed: (path: string) => void }> = ({
    path,
    className,
    onRenamed,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const body = useNoteBody(path, onRenamed);

    if (body === undefined) return null;
    if (body === null) {
        return (
            <p className="zenith-util__note">
                <FileX size={13} />
                {t('utilities.text.missing')}
            </p>
        );
    }

    return (
        <div className={className}>
            <div className="zenith-utext__scroll">
                {body ? (
                    <Markdown markdown={body} sourcePath={path} />
                ) : (
                    <p className="zenith-util__note">{t('utilities.text.blank')}</p>
                )}
            </div>
            {/* The one way from the card to the note it is showing. */}
            <button
                type="button"
                className="zenith-utext__source"
                title={path}
                onClick={() => void app.workspace.openLinkText(path, '', false)}
            >
                <FileText size={12} />
                <span>{noteName(path)}</span>
            </button>
        </div>
    );
};

/**
 * Words on the board: typed on the back of the card, or the top of a note.
 *
 * Drawn as Markdown either way, so a list is a list and a `[[link]]` opens —
 * and a plain sentence is still a plain sentence. The card adds nothing of its
 * own around it; size and alignment are the two things a line of text can ask
 * for, and both are on the back.
 */
export const TextWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.text' }) => {
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTextSettings);
    const onRenamed = useCallback((path: string) => setConfig({ textPath: path }), [setConfig]);

    const state = textState(config);
    const className = `zenith-utext is-${config.textSize} is-${config.textAlign}`;

    if (state.kind === 'empty') {
        return <p className="zenith-util__note">{t('utilities.text.empty')}</p>;
    }
    if (state.kind === 'note') {
        return <NoteText path={state.path} className={className} onRenamed={onRenamed} />;
    }
    return (
        <div className={className}>
            <div className="zenith-utext__scroll">
                <Markdown markdown={state.markdown} sourcePath="" />
            </div>
        </div>
    );
};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

/**
 * What this card says, chosen on the card itself — in the same rows and pill
 * groups as the size controls above it.
 */
export const TextSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeTextSettings);

    const fromNote = config.textSource === 'note';
    const path = config.textPath.trim();
    const missing = path.length > 0 && !(app.vault.getAbstractFileByPath(path) instanceof TFile);

    const pick = () =>
        pickVaultFile(app, t('utilities.pick.note'), (next) => setConfig({ textPath: next }), {
            notesOnly: true,
        });

    return (
        <>
            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('utilities.text.source')}</span>
                <span className="zenith-widget-settings__presets">
                    {TEXT_SOURCES.map((source: TextSource) => (
                        <button
                            key={source}
                            className={source === config.textSource ? 'is-active' : ''}
                            aria-pressed={source === config.textSource}
                            onClick={() => setConfig({ textSource: source })}
                        >
                            {t(`utilities.text.source.${source}`)}
                        </button>
                    ))}
                </span>
            </div>

            {fromNote ? (
                <div className="zenith-util-settings__field">
                    <input
                        type="text"
                        className={`zenith-input zenith-input--sm is-mono zenith-util-settings__input${missing ? ' is-invalid' : ''}`}
                        value={config.textPath}
                        placeholder={t('utilities.path.placeholder')}
                        spellCheck={false}
                        onChange={(e) => setConfig({ textPath: e.target.value })}
                        onPointerDown={stop}
                    />
                    <button
                        className="zenith-util-settings__browse"
                        onClick={pick}
                        aria-label={t('utilities.pick.note')}
                        title={t('utilities.pick.note')}
                    >
                        <FolderOpen size={13} />
                    </button>
                </div>
            ) : (
                <textarea
                    className="zenith-input zenith-util-settings__text"
                    value={config.text}
                    rows={4}
                    placeholder={t('utilities.text.placeholder')}
                    onChange={(e) => setConfig({ text: e.target.value })}
                    onPointerDown={stop}
                />
            )}

            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('utilities.text.size')}</span>
                <span className="zenith-widget-settings__presets">
                    {TEXT_SIZES.map((size: TextSize) => (
                        <button
                            key={size}
                            className={size === config.textSize ? 'is-active' : ''}
                            aria-pressed={size === config.textSize}
                            onClick={() => setConfig({ textSize: size })}
                        >
                            {t(`utilities.text.size.${size}`)}
                        </button>
                    ))}
                </span>
            </div>

            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">{t('utilities.text.align')}</span>
                <span className="zenith-widget-settings__presets">
                    {TEXT_ALIGNS.map((align: TextAlign) => (
                        <button
                            key={align}
                            className={align === config.textAlign ? 'is-active' : ''}
                            aria-pressed={align === config.textAlign}
                            onClick={() => setConfig({ textAlign: align })}
                        >
                            {t(`utilities.text.align.${align}`)}
                        </button>
                    ))}
                </span>
            </div>
        </>
    );
};
