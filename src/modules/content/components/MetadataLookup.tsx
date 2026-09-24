import React, { useState, type FC } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import {
    extensions,
    useExtensions,
    type MetadataProviderEntry,
    type MetadataResult,
} from '../../../core/extensions/registry';

/**
 * Filling an item in from somewhere else — offered only when a module has
 * registered a provider for this type. Zenith itself looks nothing up: the
 * library works from what you type, and a lookup is a module's, with the
 * network permission the user agreed to.
 *
 * Nothing is saved by choosing a result: it fills the form, and the form is
 * still the user's to change or discard.
 */
export const MetadataLookup: FC<{
    typeId: string;
    query: string;
    onPick: (result: MetadataResult) => void;
}> = ({ typeId, query, onPick }) => {
    const t = useTranslation();
    const providers = useExtensions(extensions.metadataProviders).filter(
        (p) => !p.types || p.types.includes(typeId)
    );
    const [busy, setBusy] = useState<string | null>(null);
    const [results, setResults] = useState<MetadataResult[] | null>(null);

    if (!providers.length) return null;

    const search = async (provider: MetadataProviderEntry) => {
        setBusy(`${provider.moduleId}:${provider.id}`);
        try {
            setResults((await provider.search(query.trim(), typeId)).slice(0, 6));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="zenith-form__lookup">
            <span className="zenith-form__lookup-head">
                {providers.map((provider) => {
                    const key = `${provider.moduleId}:${provider.id}`;
                    return (
                        <button
                            key={key}
                            type="button"
                            className="zenith-form__lookup-button"
                            disabled={!query.trim() || busy !== null}
                            onClick={() => void search(provider)}
                        >
                            {busy === key ? (
                                <Loader2 size={12} className="zenith-spin" />
                            ) : (
                                <Search size={12} />
                            )}
                            {t('content.form.lookup', { name: provider.label })}
                        </button>
                    );
                })}
            </span>
            {results && results.length === 0 && (
                <span className="zenith-text--muted">{t('content.form.lookupNone')}</span>
            )}
            {results?.map((result, i) => (
                <button
                    key={i}
                    type="button"
                    className="zenith-form__lookup-result"
                    onClick={() => {
                        onPick(result);
                        setResults(null);
                    }}
                >
                    <b>{result.title}</b>
                    <span className="zenith-text--muted">
                        {[result.creator, result.year].filter(Boolean).join(' · ')}
                    </span>
                </button>
            ))}
        </div>
    );
};
