import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, AlertCircle, RotateCw } from 'lucide-react';
import type { MetadataProviderId } from '../../../core/contentTypes';
import { providerSearchable } from '../services/metadata';
import type { MetadataResult } from '../services/metadata/types';
import { useMetadataSearch } from './useMetadataSearch';
import { useTranslation } from '../../../core/i18n';

/**
 * One line of context under the title. Year + creator earn their place; the
 * alternative title only appears when there's no creator, since three fields
 * always truncated to nothing useful ("2024 · PIERROT FILMS · BLEACH: Se…").
 */
function subtitleFor(r: MetadataResult): string {
    const parts = [r.year, r.creator].filter(Boolean);
    if (parts.length === 0 && r.subtitle) return r.subtitle;
    return parts.join(' · ');
}

interface MetadataPickerProps {
    provider: MetadataProviderId;
    value: string;
    onValueChange: (title: string) => void;
    onPick: (result: MetadataResult) => void;
    /** Suppress searching right after a pick, so the filled title doesn't re-query. */
    suppressed: boolean;
    inputId?: string;
    placeholder?: string;
}

/**
 * MetadataPicker — the title field and its auto-fill dropdown.
 *
 * The list is keyboard-driven (↑/↓/Enter/Escape), closes on outside clicks, and
 * says *why* it's empty instead of showing a blank panel. Each row keeps the
 * poster thumb at a fixed size and truncates long titles, so results from
 * chatty sources (Wikipedia) can't blow out the layout.
 */
export const MetadataPicker: React.FC<MetadataPickerProps> = ({
    provider,
    value,
    onValueChange,
    onPick,
    suppressed,
    inputId = 'content-title',
    placeholder,
}) => {
    const t = useTranslation();
    const canSearch = providerSearchable(provider);
    const { results, state, retry } = useMetadataSearch(provider, value, canSearch && !suppressed);

    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // A source badge on every row is pure repetition when they all agree —
    // name the source once above the list instead.
    const sources = useMemo(
        () => [...new Set(results.map((r) => r.sourceName).filter((s): s is string => !!s))],
        [results]
    );
    const mixedSources = sources.length > 1;

    // Any new outcome re-opens the panel and resets the highlight.
    useEffect(() => {
        setActive(0);
        if (state === 'ready' || state === 'empty' || state === 'error' || state === 'searching') setOpen(true);
        if (state === 'off' || state === 'short') setOpen(false);
    }, [state, results]);

    useEffect(() => {
        if (suppressed) setOpen(false);
    }, [suppressed]);

    // Close when clicking anywhere else in the dialog.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Keep the highlighted row in view during keyboard navigation.
    useEffect(() => {
        if (!open) return;
        listRef.current?.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const choose = (r: MetadataResult) => {
        setOpen(false);
        onPick(r);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Escape dismisses the dropdown first; only a second press should reach
        // the dialog and close it.
        if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            return;
        }
        if (!open || results.length === 0) {
            if (e.key === 'ArrowDown' && results.length > 0) {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
            // Enter picks a highlighted result instead of submitting the form.
            e.preventDefault();
            choose(results[active]);
        }
    };

    const searching = state === 'searching';

    return (
        <div className="zenith-picker" ref={wrapRef}>
            <div className="zenith-picker__input-wrap">
                {canSearch &&
                    (searching ? (
                        <Loader2 size={15} className="zenith-spin zenith-picker__icon" />
                    ) : (
                        <Search size={15} className="zenith-picker__icon" />
                    ))}
                <input
                    id={inputId}
                    type="text"
                    className={`zenith-input zenith-field__input ${canSearch ? 'zenith-picker__input' : ''}`}
                    placeholder={
                        placeholder ??
                        t(canSearch ? 'content.picker.placeholder' : 'content.form.titleLabel')
                    }
                    value={value}
                    autoComplete="off"
                    onChange={(e) => onValueChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    required
                />
            </div>

            {canSearch && open && (
                <div className="zenith-picker__panel">
                    {state === 'searching' && results.length === 0 && (
                        <div className="zenith-picker__note">{t('content.picker.searching')}</div>
                    )}

                    {state === 'empty' && (
                        <div className="zenith-picker__note">
                            {t('content.picker.empty')}
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="zenith-picker__note zenith-picker__note--error">
                            <AlertCircle size={14} />
                            <span>{t('content.picker.error')}</span>
                            <button type="button" className="zenith-picker__retry" onClick={retry}>
                                <RotateCw size={12} /> {t('common.tryAgain')}
                            </button>
                        </div>
                    )}

                    {results.length > 0 && !mixedSources && sources[0] && (
                        <div className="zenith-picker__origin">
                            {t('content.picker.from', { source: sources[0] })}
                        </div>
                    )}

                    {results.length > 0 && (
                        <ul className="zenith-picker__list" ref={listRef} role="listbox">
                            {results.map((r, i) => (
                                <li key={`${r.sourceId ?? r.title}-${i}`} role="option" aria-selected={i === active}>
                                    <button
                                        type="button"
                                        className={`zenith-picker__result ${i === active ? 'is-active' : ''}`}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => choose(r)}
                                    >
                                        <span
                                            className="zenith-picker__thumb"
                                            style={
                                                r.coverUrl ? { backgroundImage: `url("${r.coverUrl}")` } : undefined
                                            }
                                        />
                                        <span className="zenith-picker__body">
                                            <span className="zenith-picker__title">{r.title}</span>
                                            <span className="zenith-picker__sub">
                                                {subtitleFor(r) || t('content.picker.noDetails')}
                                            </span>
                                        </span>
                                        <span className="zenith-picker__meta">
                                            {r.rating != null && r.rating > 0 && (
                                                <span className="zenith-picker__score">{r.rating.toFixed(1)}</span>
                                            )}
                                            {mixedSources && r.sourceName && (
                                                <span className="zenith-picker__source">{r.sourceName}</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};
