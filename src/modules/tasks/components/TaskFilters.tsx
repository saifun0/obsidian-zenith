import React, { useState, useRef, useEffect, type FC } from 'react';
import { PRIORITIES } from '../../../core/constants';
import type { TaskFilterState } from './TasksApp';
import { useTranslation } from '../../../core/i18n';

// ── Props ────────────────────────────────────────────

interface TaskFiltersProps {
    filters: TaskFilterState;
    onFilterChange: (filters: TaskFilterState) => void;
    allTags: string[];
}

// ── Component ────────────────────────────────────────

export const TaskFilters: FC<TaskFiltersProps> = ({
    filters,
    onFilterChange,
    allTags,
}) => {
    const t = useTranslation();
    const [tagInput, setTagInput] = useState(filters.tag);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtered suggestions
    const suggestions = tagInput
        ? allTags.filter(
              (t) =>
                  t.toLowerCase().includes(tagInput.toLowerCase()) &&
                  t.toLowerCase() !== tagInput.toLowerCase()
          )
        : allTags;

    const handleTagChange = (value: string) => {
        setTagInput(value);
        onFilterChange({ ...filters, tag: value });
        setShowSuggestions(true);
    };

    const selectTag = (tag: string) => {
        setTagInput(tag);
        onFilterChange({ ...filters, tag });
        setShowSuggestions(false);
    };

    return (
        <>
            {/* Priority Filter */}
            <select
                className="zenith-task-filters__select"
                value={filters.priority}
                onChange={(e) =>
                    onFilterChange({
                        ...filters,
                        priority: e.target.value as TaskFilterState['priority'],
                    })
                }
            >
                <option value="all">{t('tasks.filter.allPriorities')}</option>
                {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                ))}
            </select>

            {/* Due-date filter — "no date" is the one that can't be reached any
                other way, and it's where forgotten tasks pile up. */}
            <select
                className="zenith-task-filters__select"
                value={filters.due}
                onChange={(e) =>
                    onFilterChange({ ...filters, due: e.target.value as TaskFilterState['due'] })
                }
            >
                {(['all', 'overdue', 'today', 'week', 'none'] as const).map((d) => (
                    <option key={d} value={d}>
                        {t('tasks.filter.due', { name: t(`tasks.due.${d}`) })}
                    </option>
                ))}
            </select>

            {/* Tag Filter */}
            <div style={{ position: 'relative' }}>
                <input
                    ref={inputRef}
                    type="text"
                    className="zenith-task-filters__input"
                    placeholder={t('tasks.filter.tagPlaceholder')}
                    value={tagInput}
                    onChange={(e) => handleTagChange(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                />
                {showSuggestions && suggestions.length > 0 && (
                    <div
                        ref={suggestionsRef}
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '4px',
                            maxHeight: '150px',
                            overflowY: 'auto',
                            zIndex: 30,
                            marginTop: '4px'
                        }}
                    >
                        {suggestions.slice(0, 8).map((tag) => (
                            <div
                                key={tag}
                                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.85rem' }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectTag(tag)}
                            >
                                #{tag}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Sort */}
            <select
                className="zenith-task-filters__select"
                value={filters.sort}
                onChange={(e) =>
                    onFilterChange({
                        ...filters,
                        sort: e.target.value as TaskFilterState['sort'],
                    })
                }
            >
                <option value="manual">{t('content.sortBy', { name: t('tasks.sort.manual') })}</option>
                <option value="created">{t('content.sortBy', { name: t('tasks.sort.created') })}</option>
                <option value="dueDate">{t('content.sortBy', { name: t('tasks.sort.dueDate') })}</option>
                <option value="priority">{t('content.sortBy', { name: t('tasks.sort.priority') })}</option>
            </select>

            {/* Group (applies on the All tab) */}
            <select
                className="zenith-task-filters__select"
                value={filters.group}
                onChange={(e) =>
                    onFilterChange({
                        ...filters,
                        group: e.target.value as TaskFilterState['group'],
                    })
                }
            >
                <option value="smart">{t('tasks.filter.groupBy', { name: t('tasks.group.smart') })}</option>
                <option value="file">{t('tasks.filter.groupBy', { name: t('tasks.group.file') })}</option>
                <option value="none">{t('tasks.filter.groupBy', { name: t('tasks.group.none') })}</option>
            </select>
        </>
    );
};
