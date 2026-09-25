import React, { useMemo, useState } from 'react';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { ActionButton, TextInput, Toggle } from '../../controls';
import { maskSecrets, narrowEntries } from './inspect';

/**
 * What Zenith currently believes, as JSON.
 *
 * Settings hold Dropbox tokens and the vault encryption password, and the
 * obvious use of a page like this is to copy what it shows into a bug report.
 * So secrets are masked by default and revealing them is a deliberate switch.
 * The rules live in `inspect.ts`, with tests — see the note there.
 */

const Dump: React.FC<{ title: string; value: unknown; empty: string }> = ({
    title,
    value,
    empty,
}) => {
    const t = useTranslation();
    const [copied, setCopied] = useState(false);
    const text = JSON.stringify(value, null, 2);
    const isEmpty = !value || Object.keys(value).length === 0;

    const copy = () => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="zenith-debug__dump">
            <div className="zenith-debug__dump-head">
                <span className="zenith-settings__section-label">{title}</span>
                <ActionButton label={copied ? t('debug.copied') : t('debug.copy')} onClick={copy} />
            </div>
            {isEmpty ? (
                <div className="zenith-settings__empty-note">{empty}</div>
            ) : (
                <pre className="zenith-debug__json">{text}</pre>
            )}
        </div>
    );
};

export const StateInspector: React.FC = () => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const availableModules = useZenithStore((s) => s.availableModules);

    const [reveal, setReveal] = useState(false);
    const [query, setQuery] = useState('');

    const shownSettings = useMemo(
        () => narrowEntries(maskSecrets(settings, '', reveal) as Record<string, unknown>, query),
        [settings, reveal, query]
    );

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-debug__toolbar">
                <TextInput value={query} placeholder={t('debug.filter')} onChange={setQuery} />
                <label className="zenith-debug__switch">
                    <Toggle checked={reveal} onChange={setReveal} />
                    <span>{t('debug.state.showSecrets')}</span>
                </label>
            </div>

            {!reveal && <div className="zenith-debug__note">{t('debug.state.masked')}</div>}

            <Dump title={t('debug.state.settings')} value={shownSettings} empty={t('debug.empty')} />
            <Dump
                title={t('debug.state.discovered')}
                value={availableModules}
                empty={t('debug.empty')}
            />
        </div>
    );
};
