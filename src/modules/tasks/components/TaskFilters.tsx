import React, { useState, type FC } from 'react';
import { PRIORITIES } from '../../../core/constants';
import type { TaskFilterState } from './TasksApp';
import { useTranslation } from '../../../core/i18n';
import { Popover, usePopover } from '../../../components/shared';
import { Dropdown } from '../../../components/ui/fields';

// ── Props ────────────────────────────────────────────

/** Eight rows at 34px, plus the menu's own padding. */
const SUGGESTIONS_H = 280;

interface TaskFiltersProps {
    filters: TaskFilterState;
    onFilterChange: (filters: TaskFilterState) => void;
    allTags: string[];
    /** The groupings on offer; see `groupModes`. */
    groups: readonly TaskFilterState['group'][];
    /** Filters third-party modules registered; none, and the row is not drawn. */
    moduleFilters?: Array<{ value: string; label: string }>;
    moduleFilter?: string;
    onModuleFilter?: (value: string) => void;
}

// ── Component ────────────────────────────────────────

export const TaskFilters: FC<TaskFiltersProps> = ({
    filters,
    onFilterChange,
    allTags,
    groups,
    moduleFilters = [],
    moduleFilter = '',
    onModuleFilter,
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
            <Dropdown
                className="zenith-task-filters__select"
                value={filters.priority}
                options={[
                    { value: 'all', label: t('tasks.filter.allPriorities') },
                    ...PRIORITIES.map((p) => ({
                        value: p,
                        label: p.charAt(0).toUpperCase() + p.slice(1),
                    })),
                ]}
                onChange={(v) =>
                    onFilterChange({ ...filters, priority: v as TaskFilterState['priority'] })
                }
            />

            {moduleFilters.length > 0 && onModuleFilter && (
                <Dropdown
                    className="zenith-task-filters__select"
                    value={moduleFilter}
                    options={[{ value: '', label: t('tasks.filter.moduleAll') }, ...moduleFilters]}
                    onChange={onModuleFilter}
                />
            )}

            {/* Due-date filter — "no date" is the one that can't be reached any
                other way, and it's where forgotten tasks pile up. */}
            <Dropdown
                className="zenith-task-filters__select"
                value={filters.due}
                options={(['all', 'overdue', 'today', 'week', 'none'] as const).map((d) => ({
                    value: d,
                    label: t('tasks.filter.due', { name: t(`tasks.due.${d}`) }),
                }))}
                onChange={(v) => onFilterChange({ ...filters, due: v as TaskFilterState['due'] })}
            />

            {/* Tag Filter */}
            <>
                <input
                    {...tags.anchorProps}
                    type="text"
                    className="zenith-input zenith-task-filters__input"
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
            <Dropdown
                className="zenith-task-filters__select"
                value={filters.sort}
                options={(['manual', 'created', 'dueDate', 'priority'] as const).map((s) => ({
                    value: s,
                    label: t('content.sortBy', { name: t(`tasks.sort.${s}`) }),
                }))}
                onChange={(v) => onFilterChange({ ...filters, sort: v as TaskFilterState['sort'] })}
            />

            {/* Group (applies on the All tab) — only the groupings that are
                switched on, and nothing at all when "none" is the only one. */}
            {groups.length > 1 && (
                <Dropdown
                    className="zenith-task-filters__select"
                    value={filters.group}
                    options={groups.map((g) => ({
                        value: g,
                        label: t('tasks.filter.groupBy', { name: t(`tasks.group.${g}`) }),
                    }))}
                    onChange={(v) =>
                        onFilterChange({ ...filters, group: v as TaskFilterState['group'] })
                    }
                />
            )}
        </>
    );
};
