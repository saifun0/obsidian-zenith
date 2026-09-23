import React, { type FC } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';

export interface SearchFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    size?: 'sm' | 'md';
    /** Layout only — how wide, how it flexes. The look is the field's. */
    className?: string;
    autoFocus?: boolean;
    id?: string;
    'aria-label'?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * A search box: a glyph, the query, and a way to empty it.
 *
 * There were four, one over each view — tasks, library, projects, the widget
 * sheet — at 28, 34 and 34px, with the glyph at two sizes and the clear button
 * drawn three different ways. Each had also had to defeat Obsidian's own input
 * ring separately. One component, one set of rules.
 */
export const SearchField: FC<SearchFieldProps> = ({
    value,
    onChange,
    placeholder,
    size = 'md',
    className = '',
    autoFocus,
    id,
    onKeyDown,
    ...aria
}) => {
    const t = useTranslation();
    return (
        <div
            className={[
                'zenith-input zenith-search',
                size === 'sm' ? 'zenith-input--sm' : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <Search size={14} className="zenith-field-icon" aria-hidden="true" />
            <input
                type="text"
                id={id}
                value={value}
                placeholder={placeholder}
                autoFocus={autoFocus}
                autoComplete="off"
                spellCheck={false}
                aria-label={aria['aria-label'] ?? placeholder}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    // Escape empties a query before it does anything else.
                    if (e.key === 'Escape' && value) {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange('');
                        return;
                    }
                    onKeyDown?.(e);
                }}
            />
            {value && (
                <button
                    type="button"
                    className="zenith-field-btn"
                    aria-label={t('common.clear')}
                    title={t('common.clear')}
                    onClick={() => onChange('')}
                >
                    <X size={13} />
                </button>
            )}
        </div>
    );
};
