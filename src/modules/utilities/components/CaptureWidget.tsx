import React, { useState, type FC } from 'react';
import { Notice, TFile } from 'obsidian';
import { ArrowRight, FolderOpen } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { pickVaultFile } from '../../../components/shared/VaultFilePickerModal';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps, WidgetSettingsProps } from '../../dashboard/widgets';
import {
    CAPTURE_TARGETS,
    captureLine,
    capturePath,
    captureTarget,
    normalizeCaptureSettings,
    withCaptured,
    type CaptureTarget,
    type CapturedLine,
} from '../capture';
import { CaptureError, captureToDaily, captureToNote, dailyNote } from '../captureWriter';
import { noteName } from '../textSource';

/**
 * A line to write a thought on, filed the moment Enter is pressed.
 *
 * It goes to today's daily note for whoever keeps the journal, or to a note of
 * the user's choosing, as one more item in a list — with the hour in front of
 * it unless that is switched off. Under the line the card says where it
 * writes, and that is also the way to the note. What was just filed stays in
 * view below it: the proof it was written, without a pop-up to say so.
 */
export const CaptureWidget: FC<DashboardWidgetProps> = ({ instanceId = 'picture.capture' }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config] = useWidgetConfig(instanceId, normalizeCaptureSettings);
    const journalOn = useZenithStore((s) => s.settings.activeModuleIds.includes('journal'));

    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [filed, setFiled] = useState<CapturedLine[]>([]);

    const target = captureTarget(config, journalOn);
    const path = capturePath(config.capturePath);

    if (target === 'note' && !path) {
        return <p className="zenith-util__note">{t('utilities.capture.empty')}</p>;
    }

    const submit = async () => {
        const now = new Date();
        const line = captureLine(text, now, config.captureStamp);
        if (!line || busy) return;
        setBusy(true);
        try {
            if (target === 'daily') {
                await captureToDaily(app, useZenithStore.getState().settings, line);
            } else {
                await captureToNote(app, config.capturePath, line);
            }
            setFiled((list) => withCaptured(list, text, now));
            setText('');
        } catch (err) {
            // The words stay in the field: a line that could not be filed is
            // not one to throw away.
            if (err instanceof CaptureError) {
                new Notice(t(`utilities.capture.error.${err.reason}`));
            } else {
                console.error('Zenith: could not file a quick note:', err);
                new Notice(t('utilities.capture.error'));
            }
        } finally {
            setBusy(false);
        }
    };

    const openTarget = async () => {
        if (target === 'note') {
            if (app.vault.getAbstractFileByPath(path) instanceof TFile) {
                await app.workspace.openLinkText(path, '', false);
            }
            return;
        }
        // Today's note is made by the first line filed in it, or by this.
        try {
            const file = await dailyNote(app, useZenithStore.getState().settings);
            await app.workspace.getLeaf(false).openFile(file);
        } catch (err) {
            console.error('Zenith: could not open the daily note:', err);
            new Notice(t('utilities.capture.error'));
        }
    };

    return (
        <div className="zenith-ucapture">
            <form
                className="zenith-ucapture__form"
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <input
                    type="text"
                    className="zenith-ucapture__input"
                    value={text}
                    placeholder={t('utilities.capture.placeholder')}
                    aria-label={t('widget.utilities.capture')}
                    disabled={busy}
                    enterKeyHint="done"
                    onChange={(e) => setText(e.target.value)}
                />
            </form>

            <button
                type="button"
                className="zenith-ucapture__target"
                title={target === 'note' ? path : undefined}
                onClick={() => void openTarget()}
            >
                <ArrowRight size={12} />
                <span>{target === 'daily' ? t('utilities.capture.daily') : noteName(path)}</span>
            </button>

            {filed.length > 0 && (
                <ul className="zenith-ucapture__filed" aria-label={t('utilities.capture.filed')}>
                    {filed.map((line, i) => (
                        <li key={`${line.time}:${i}:${line.text}`}>
                            <span className="zenith-ucapture__time">{line.time}</span>
                            <span className="zenith-ucapture__text">{line.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/** A field on the back of a card, which must not start a drag or a flip. */
const stop = (e: React.PointerEvent) => e.stopPropagation();

export const CaptureSettings: FC<WidgetSettingsProps> = ({ instanceId }) => {
    const { app } = useApp();
    const t = useTranslation();
    const [config, setConfig] = useWidgetConfig(instanceId, normalizeCaptureSettings);
    const journalOn = useZenithStore((s) => s.settings.activeModuleIds.includes('journal'));

    const target = captureTarget(config, journalOn);
    const path = capturePath(config.capturePath);
    const occupied = path ? app.vault.getAbstractFileByPath(path) : null;
    // A path naming something that is not a note; a note not there yet is made.
    const invalid = occupied !== null && !(occupied instanceof TFile);

    const pick = () =>
        pickVaultFile(app, t('utilities.pick.note'), (next) => setConfig({ capturePath: next }), {
            notesOnly: true,
        });

    return (
        <>
            {/* Without the journal there is one place to write, and nothing to choose. */}
            {journalOn && (
                <div className="zenith-widget-settings__row">
                    <span className="zenith-widget-settings__label">
                        {t('utilities.capture.to')}
                    </span>
                    <span className="zenith-widget-settings__presets">
                        {CAPTURE_TARGETS.map((to: CaptureTarget) => (
                            <button
                                key={to}
                                className={to === target ? 'is-active' : ''}
                                aria-pressed={to === target}
                                onClick={() => setConfig({ captureTo: to })}
                            >
                                {t(`utilities.capture.to.${to}`)}
                            </button>
                        ))}
                    </span>
                </div>
            )}

            {target === 'note' && (
                <div className="zenith-util-settings__field">
                    <input
                        type="text"
                        className={`zenith-input zenith-input--sm is-mono zenith-util-settings__input${invalid ? ' is-invalid' : ''}`}
                        value={config.capturePath}
                        placeholder={t('utilities.capture.path.placeholder')}
                        spellCheck={false}
                        onChange={(e) => setConfig({ capturePath: e.target.value })}
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
            )}

            <div className="zenith-widget-settings__row">
                <span className="zenith-widget-settings__label">
                    {t('utilities.capture.stamp')}
                </span>
                <span className="zenith-widget-settings__presets">
                    {[true, false].map((on) => (
                        <button
                            key={String(on)}
                            className={on === config.captureStamp ? 'is-active' : ''}
                            aria-pressed={on === config.captureStamp}
                            onClick={() => setConfig({ captureStamp: on })}
                        >
                            {t(on ? 'utilities.capture.stamp.on' : 'utilities.capture.stamp.off')}
                        </button>
                    ))}
                </span>
            </div>
        </>
    );
};
