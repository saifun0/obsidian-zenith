import React, { useState, useEffect, useCallback, useMemo, useRef, type FC } from 'react';
import {
    RotateCw,
    Plus,
    CheckSquare,
    SlidersHorizontal,
    Search,
    BarChart3,
    CalendarDays,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { TASK_TABS, PRIORITIES } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { queryTasks, type DueFilter } from '../services/taskFilter';
import type { Priority } from '../../../core/constants';
import { Tabs } from '../../../components/shared/Tabs';
import { IconButton } from '../../../components/shared/IconButton';
import { Popover, usePopover } from '../../../components/shared';
import { TaskList } from './TaskList';
import { TaskFilters } from './TaskFilters';
import { TaskStats } from './TaskStats';
import { TaskEditorModal } from './TaskEditorModal';

/** The filters panel: five controls in a column, plus its own padding. */
const FILTERS_W = 250;
const FILTERS_H = 300;

// ── Filter Types ─────────────────────────────────────

export interface TaskFilterState {
    priority: Priority | 'all';
    tag: string;
    /** `manual` = file order; the only mode where drag-to-reorder sticks. */
    sort: 'manual' | 'dueDate' | 'priority' | 'created';
    /** Grouping used on the "All" tab: date buckets, by source file, or flat. */
    group: 'smart' | 'file' | 'none';
    /** Deadline filter, including "no date at all". */
    due: DueFilter;
}

const DEFAULT_FILTERS: TaskFilterState = {
    priority: 'all',
    tag: '',
    sort: 'manual',
    group: 'smart',
    due: 'all',
};

const SORTS: TaskFilterState['sort'][] = ['manual', 'dueDate', 'priority', 'created'];
const GROUPS: TaskFilterState['group'][] = ['smart', 'file', 'none'];
const DUES: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];

/** Narrow the untrusted strings that come back from `data.json`. */
function restoreFilters(saved: {
    priority: string;
    tag: string;
    sort: string;
    group: string;
    due?: string;
}): TaskFilterState {
    return {
        priority: PRIORITIES.includes(saved.priority as Priority)
            ? (saved.priority as Priority)
            : 'all',
        tag: typeof saved.tag === 'string' ? saved.tag : '',
        sort: SORTS.includes(saved.sort as TaskFilterState['sort'])
            ? (saved.sort as TaskFilterState['sort'])
            : DEFAULT_FILTERS.sort,
        group: GROUPS.includes(saved.group as TaskFilterState['group'])
            ? (saved.group as TaskFilterState['group'])
            : DEFAULT_FILTERS.group,
        due: DUES.includes(saved.due as DueFilter) ? (saved.due as DueFilter) : DEFAULT_FILTERS.due,
    };
}

// ── Component ────────────────────────────────────────

export const TasksApp: FC = () => {
    const { plugin } = useApp();
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const tasksLoading = useZenithStore((s) => s.tasksLoading);
    const calendarOn = useZenithStore((s) => s.loadedModuleIds).includes('tasks-calendar');

    const openCalendar = () => void plugin.moduleManager.get('tasks-calendar')?.activateView();

    // Restored from settings; read once via getState because this component
    // writes that slice and would otherwise re-render on its own save.
    const saved = useRef(useZenithStore.getState().settings.taskView).current;
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [activeTab, setActiveTab] = useState(() =>
        TASK_TABS.some((t) => t.id === saved.tab) ? saved.tab : 'all'
    );
    const [filters, setFilters] = useState<TaskFilterState>(() => restoreFilters(saved));

    useEffect(() => {
        updateSettings({ taskView: { tab: activeTab, ...filters } });
    }, [activeTab, filters, updateSettings]);
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const filterPop = usePopover<HTMLDivElement>();

    // ── Refresh from vault (the DataService keeps the store live already;
    //    this is the explicit force-reload behind the Refresh button) ──

    const loadTasks = useCallback(async () => {
        await plugin.dataService.reloadTasks();
    }, [plugin]);

    // ── Filter + sort tasks ──────────────────────────

    const filteredTasks = useMemo(
        () =>
            queryTasks(tasks, {
                tab: activeTab,
                priority: filters.priority,
                tag: filters.tag,
                search,
                sort: filters.sort,
                due: filters.due,
                today: getTodayString(),
            }),
        [tasks, activeTab, filters, search]
    );

    // ── Tabs with counts ─────────────────────────────

    const tabsWithCounts = useMemo(() => {
        return TASK_TABS.map((tab) => {
            let count = 0;
            switch (tab.id) {
                case 'all':
                    count = tasks.length;
                    break;
                case 'active':
                    count = tasks.filter((t) => t.status === 'todo' || t.status === 'in-progress').length;
                    break;
                case 'in-progress':
                    count = tasks.filter((t) => t.status === 'in-progress').length;
                    break;
                case 'done':
                    count = tasks.filter((t) => t.status === 'done').length;
                    break;
            }
            return { id: tab.id, label: t(`tasks.tab.${tab.i18n}`), count };
        });
    }, [tasks]);

    // ── All existing tags (for autocomplete) ─────────

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        tasks.forEach((t) => t.tags.forEach((tag) => tagSet.add(tag)));
        return Array.from(tagSet).sort();
    }, [tasks]);

    // ── Render ───────────────────────────────────────

    return (
        <div className="zenith-tasks">
            
            <div className="zenith-tasks-header-wrapper">
                {/* Header */}
                <div className="zenith-tasks-header">
                    <div className="zenith-tasks-header-left">
                        <CheckSquare size={22} className="zenith-tasks-header-icon" />
                        <h2 className="zenith-tasks-title">{t('tasks.title')}</h2>
                    </div>
                    <div className="zenith-tasks-header-actions">
                        {/* Only offered while the calendar module is on — a
                            button that opens nothing is worse than no button. */}
                        {calendarOn && (
                            <IconButton
                                icon={CalendarDays}
                                tooltip={t('tasks.openCalendar')}
                                onClick={openCalendar}
                                variant="ghost"
                                size="md"
                            />
                        )}
                        <IconButton
                            icon={BarChart3}
                            tooltip={t('common.statistics')}
                            onClick={() => setShowStats((v) => !v)}
                            variant={showStats ? 'default' : 'ghost'}
                            size="md"
                        />
                        <div ref={filterPop.anchorProps.ref}>
                            <IconButton
                                icon={SlidersHorizontal}
                                tooltip={t('tasks.filter.sort')}
                                onClick={() => filterPop.setOpen(!filterPop.open)}
                                variant={
                                    filterPop.open ||
                                    filters.tag ||
                                    filters.priority !== 'all' ||
                                    filters.due !== 'all'
                                        ? 'default'
                                        : 'ghost'
                                }
                                size="md"
                            />
                        </div>
                        {/* The panel used to sit inside that div, positioned
                            absolutely — so it was clipped by the header strip
                            and had no way to be dismissed but a click outside. */}
                        <Popover
                            anchor={filterPop.anchor}
                            open={filterPop.open}
                            onClose={filterPop.close}
                            width={FILTERS_W}
                            height={FILTERS_H}
                            align="end"
                            role="dialog"
                            label={t('tasks.filter.sort')}
                            className="zenith-task-filters-popover"
                        >
                            <TaskFilters
                                filters={filters}
                                onFilterChange={setFilters}
                                allTags={allTags}
                            />
                        </Popover>
                        <IconButton
                            icon={Plus}
                            tooltip={t('tasks.addTask')}
                            onClick={() => setShowCreate(true)}
                            variant="default"
                            size="md"
                        />
                        <IconButton
                            icon={RotateCw}
                            tooltip={t('common.refresh')}
                            onClick={loadTasks}
                            disabled={tasksLoading}
                            variant="ghost"
                            size="md"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <Tabs
                    tabs={tabsWithCounts}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                {/* Search */}
                <div className="zenith-tasks-search">
                    <Search size={15} className="zenith-tasks-search__icon" />
                    <input
                        type="text"
                        className="zenith-tasks-search__input"
                        placeholder={t('tasks.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            className="zenith-tasks-search__clear"
                            onClick={() => setSearch('')}
                            aria-label={t('common.clear')}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Statistics panel */}
            {showStats && <TaskStats tasks={tasks} />}

            {/* Task List */}
            {tasksLoading ? (
                <div className="zenith-tasks-loading">
                    <RotateCw size={20} className="zenith-spin" />
                    <span>{t('tasks.loading')}</span>
                </div>
            ) : (
                <TaskList
                    tasks={filteredTasks}
                    groupMode={activeTab === 'all' ? filters.group : 'none'}
                    reorderable={filters.sort === 'manual'}
                />
            )}

            {/* Create modal */}
            {showCreate && (
                <TaskEditorModal onClose={() => setShowCreate(false)} onSaved={loadTasks} />
            )}
        </div>
    );
};
