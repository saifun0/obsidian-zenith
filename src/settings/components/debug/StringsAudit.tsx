import React, { useState } from 'react';
import {
    DICTS,
    LOCALES,
    contributedTranslations,
    hasTranslation,
    translate,
    useTranslation,
    type Locale,
} from '../../../core/i18n';
import { TextInput } from '../../controls';
import { Badge } from '../../../components/shared';

/**
 * Which language answers which key.
 *
 * Worth its own tab because a missing translation is invisible: `translate`
 * falls back to English before giving up, so a key with no Russian renders
 * perfectly — in the wrong language, inside an otherwise Russian interface. The
 * parity test covers Zenith's own dictionary; nothing covers what a module
 * contributes, and a module is exactly the thing shipped by someone who has not
 * run our tests.
 *
 * The lookup box answers the question the layering makes hard to hold in your
 * head: for one key, what does each locale have, where did it come from, and
 * what will actually be rendered.
 */

interface Gap {
    key: string;
    source: string;
    missing: Locale[];
}

function collectGaps(): Gap[] {
    const gaps: Gap[] = [];

    for (const [handle, table] of contributedTranslations()) {
        const keys = new Set<string>();
        for (const locale of LOCALES) {
            for (const key of Object.keys(table[locale] ?? {})) keys.add(key);
        }
        for (const key of keys) {
            // Zenith's own dictionary counts as an answer: a module that only
            // fills the Russian for an English-only core key has no gap.
            const missing = LOCALES.filter(
                (locale) => table[locale]?.[key] === undefined && DICTS[locale][key] === undefined
            );
            if (missing.length > 0) gaps.push({ key, source: handle, missing });
        }
    }

    return gaps.sort((a, b) => a.key.localeCompare(b.key));
}

export const StringsAudit: React.FC = () => {
    const t = useTranslation();
    const [lookup, setLookup] = useState('');

    // Recomputed every render rather than memoised: the source is a live Map
    // whose contents can change without its size doing so, and there are a
    // dozen chunks holding a few keys each.
    const contributed = Array.from(contributedTranslations());
    const gaps = collectGaps();

    const key = lookup.trim();
    const known = key !== '' && LOCALES.some((locale) => hasTranslation(locale, key));

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-settings__section-label">{t('debug.strings.lookup')}</div>
            <TextInput
                value={lookup}
                placeholder="module.canvas.name"
                monospace
                onChange={setLookup}
            />
            {key !== '' &&
                (known ? (
                    <div className="zenith-debug__facts">
                        {LOCALES.map((locale) => (
                            <div className="zenith-debug__fact" key={locale}>
                                <span className="zenith-debug__fact-key">
                                    {locale}
                                    {DICTS[locale][key] !== undefined && (
                                        <Badge text={t('debug.strings.fromZenith')} />
                                    )}
                                </span>
                                <span className="zenith-debug__fact-val">
                                    {translate(locale, key)}
                                </span>
                            </div>
                        ))}
                        <div className="zenith-debug__fact">
                            <span className="zenith-debug__fact-key">
                                {t('debug.strings.resolved')} · {t.locale}
                            </span>
                            <span className="zenith-debug__fact-val">{t(key)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="zenith-settings__empty-note">{t('debug.strings.notFound')}</div>
                ))}

            <div className="zenith-settings__section-label">{t('debug.strings.core')}</div>
            <div className="zenith-debug__facts">
                {LOCALES.map((locale) => (
                    <div className="zenith-debug__fact" key={locale}>
                        <span className="zenith-debug__fact-key">{locale}</span>
                        <span className="zenith-debug__fact-val">
                            {t.plural('debug.strings.keys', Object.keys(DICTS[locale]).length)}
                        </span>
                    </div>
                ))}
                <div className="zenith-debug__fact">
                    <span className="zenith-debug__fact-key">{t('debug.strings.active')}</span>
                    <span className="zenith-debug__fact-val">{t.locale}</span>
                </div>
            </div>

            <div className="zenith-settings__section-label">{t('debug.strings.contributed')}</div>
            {contributed.length === 0 ? (
                <div className="zenith-settings__empty-note">{t('debug.strings.noChunks')}</div>
            ) : (
                <div className="zenith-debug__facts">
                    {contributed.map(([handle, table]) => (
                        <div className="zenith-debug__fact" key={handle}>
                            <span className="zenith-debug__fact-key">
                                <code>{handle}</code>
                            </span>
                            <span className="zenith-debug__fact-val">
                                {LOCALES.map(
                                    (locale) =>
                                        `${locale}: ${Object.keys(table[locale] ?? {}).length}`
                                ).join(' · ')}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="zenith-settings__section-label">{t('debug.strings.gaps')}</div>
            {gaps.length === 0 ? (
                <div className="zenith-settings__empty-note">{t('debug.strings.noGaps')}</div>
            ) : (
                <div className="zenith-debug__table">
                    {gaps.map((gap) => (
                        <div className="zenith-debug__row" key={`${gap.source}:${gap.key}`}>
                            <div className="zenith-debug__row-main">
                                <code className="zenith-debug__row-id">{gap.key}</code>
                                {gap.missing.map((locale) => (
                                    <Badge key={locale} text={locale} variant="warning" />
                                ))}
                            </div>
                            <code className="zenith-debug__row-key">{gap.source}</code>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
