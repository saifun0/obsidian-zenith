import React, { useState, type FC } from 'react';
import { PRIORITIES } from '../../../core/constants';
import type { TaskFilterState } from './TasksApp';
import { useTranslation } from '../../../core/i18n';
import { Popover, usePopover } from '../../../components/shared';

// ── Props ────────────────────────────────────────────

/** Eight rows at 34px, plus the menu's own padding. */
const SUGGESTIONS_H = 280;

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
    // The suggestion list was a div positioned inside the field's own box, with
    // twelve inline style properties, no Escape and no roles — so it was clipped
    // by the filter bar, and unreachable without a mouse. It is the plugin's
    // popover now, like every other menu.
    const tags = usePopover<HTMLInputElement>();

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
        tags.setOpen(true);
    };

    const selectTag = (tag: string) => {
        setTagInput(tag);
        onFilterChange({ ...filters, tag });
        tags.close();
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
            <>
                <input
                    {...tags.anchorProps}
                    type="text"
                    className="zenith-task-filters__input"
                    placeholder={t('tasks.filter.tagPlaceholder')}
                    value={tagInput}
                    onChange={(e) => handleTagChange(e.target.value)}
                    onFocus={() => tags.setOpen(true)}
                />
                <Popover
                    anchor={tags.anchor}
                    open={tags.open && suggestions.length > 0}
                    onClose={tags.close}
                    width={0}
                    height={SUGGESTIONS_H}
                    matchWidth
                    role="listbox"
                    label={t('tasks.filter.tagPlaceholder')}
                    className="zenith-pop--scroll"
                >
                    {suggestions.slice(0, 8).map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="zenith-pop__item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectTag(tag)}
                        >
                            #{tag}
                        </button>
                    ))}
                </Popover>
            </>

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
