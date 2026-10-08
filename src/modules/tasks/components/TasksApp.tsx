import React, { useState, useEffect, useCallback, useMemo, useRef, type FC } from 'react';
import { Menu, Platform } from 'obsidian';
import { MoreHorizontal, RotateCw, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { reorderScope } from '../services/reorderScope';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { TASK_TABS } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { queryTasks } from '../services/taskFilter';
import { isFiltering, parseSearch } from '../services/taskSearch';
import { SearchField } from '../../../components/ui/fields';
import { TaskList } from './TaskList';
import { TaskStats } from './TaskStats';
import { TaskEditorModal } from './TaskEditorModal';
import { TaskQuickLine, type TaskDraft } from './TaskQuickLine';

// ── View state ───────────────────────────────────────

export interface TaskFilterState {
    /** `manual` = file order; the only mode where drag-to-reorder sticks. */
    sort: 'manual' | 'dueDate' | 'priority' | 'created';
    /** Grouping: the diary's smart groups, by source file, or flat. */
    group: 'smart' | 'file' | 'none';
}

const DEFAULT_FILTERS: TaskFilterState = { sort: 'manual', group: 'smart' };

const SORTS: TaskFilterState['sort'][] = ['manual', 'dueDate', 'priority', 'created'];
const GROUPS: TaskFilterState['group'][] = ['smart', 'file', 'none'];

/**
 * The groupings that are switched on. "None" is always there: it is the
 * absence of a feature, not one.
 */
export function groupModes(smart: boolean, file: boolean): TaskFilterState['group'][] {
    return [...(smart ? ['smart' as const] : []), ...(file ? ['file' as const] : []), 'none'];
}

/** Narrow the untrusted strings that come back from `data.json`. */
function restoreFilters(saved: { sort: string; group: string }): TaskFilterState {
    return {
        sort: SORTS.includes(saved.sort as TaskFilterState['sort'])
            ? (saved.sort as TaskFilterState['sort'])
            : DEFAULT_FILTERS.sort,
        group: GROUPS.includes(saved.group as TaskFilterState['group'])
            ? (saved.group as TaskFilterState['group'])
            : DEFAULT_FILTERS.group,
    };
}

type Tab = (typeof TASK_TABS)[number]['id'];

/** "Thursday, 2 October" in the interface's language, capitalised as a heading is. */
function dayHeading(locale: string): string {
    const text = new Date().toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** What the keyboard is typing into, which the list's own keys must leave alone. */
const isTyping = (el: EventTarget | null) =>
    el instanceof HTMLElement &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// ── Component ────────────────────────────────────────

/**
 * The tasks view, as a page of a planner.
 *
 * At the top, the day, and under it one line of what is on the page — "42
 * active · 19 in progress · 62 done" — which is also how the page is turned:
 * each figure shows its tasks, and the one shown is underlined. Search and
 * everything else wait behind two quiet marks on the right. Then a line to
 * write the next task on, and the tasks themselves.
 *
 * It replaced a title, five icon buttons, four pill tabs with counters, a
 * search box that took a line whether it was used or not, and a panel of five
 * dropdowns.
 */
export const TasksApp: FC = () => {
    const { plugin } = useApp();
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const tasksLoading = useZenithStore((s) => s.tasksLoading);
    const calendarOn = useZenithStore((s) => s.loadedModuleIds).includes('tasks-calendar');
    const reorderMode = useZenithStore((s) => s.taskReorderMode);
    const setReorderMode = useZenithStore((s) => s.setTaskReorderMode);
    const statsOn = useFeature('tasks.stats');
    const dragOn = useFeature('tasks.dragDrop');
    const smartOn = useFeature('tasks.smartGroups');
    const fileOn = useFeature('tasks.fileGroups');
    const groups = useMemo(() => groupModes(smartOn, fileOn), [smartOn, fileOn]);

    // Restored from settings; read once via getState because this component
    // writes that slice and would otherwise re-render on its own save.
    const saved = useRef(useZenithStore.getState().settings.taskView).current;
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const [tab, setTab] = useState<Tab>(() =>
        TASK_TABS.some((x) => x.id === saved.tab) ? (saved.tab as Tab) : 'all'
    );
    const [filters, setFilters] = useState<TaskFilterState>(() => restoreFilters(saved));
    const byHand = reorderScope({
        dragOn,
        manualSort: filters.sort === 'manual',
        mobile: Platform.isMobile,
        reorderMode,
    });

    useEffect(() => {
        // Spread over what is there: the list keeps its open tasks and folded
        // groups in the same slice, and they are not this effect's to reset.
        const view = useZenithStore.getState().settings.taskView;
        updateSettings({ taskView: { ...view, tab, ...filters } });
    }, [tab, filters, updateSettings]);

    const [search, setSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchFocus, setSearchFocus] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [draft, setDraft] = useState<TaskDraft | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const quickRef = useRef<HTMLInputElement>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // Leaving the view leaves reordering too: it is a mode, not a setting.
    useEffect(() => () => setReorderMode(false), [setReorderMode]);

    const query = useMemo(() => parseSearch(search), [search]);
    const filtering = isFiltering(query);

    // ── The list ─────────────────────────────────────

    const shown = useMemo(() => {
        const list = queryTasks(tasks, {
            tab,
            priority: query.priority ?? 'all',
            minPriority: query.minPriority,
            tag: '',
            tags: query.tags,
            search: query.text,
            sort: filters.sort,
            due: query.due,
            today: getTodayString(),
        });
        // What is finished reads as a log: the latest first.
        if (tab === 'done') {
            list.sort((a, b) => (b.doneDate ?? '').localeCompare(a.doneDate ?? ''));
        }
        return list;
    }, [tasks, tab, query, filters.sort]);

    const groupMode: TaskFilterState['group'] =
        tab === 'done' || !groups.includes(filters.group) ? 'none' : filters.group;

    // ── The line under the day ───────────────────────

    const counts = useMemo(() => {
        let active = 0;
        let doing = 0;
        let done = 0;
        for (const task of tasks) {
            if (task.status === 'todo' || task.status === 'in-progress') active++;
            if (task.status === 'in-progress') doing++;
            if (task.status === 'done') done++;
        }
        return { active, doing, done };
    }, [tasks]);

    const tally: Array<{ id: Tab; text: string }> = [
        { id: 'active', text: t.plural('tasks.tally.active', counts.active) },
        { id: 'in-progress', text: t('tasks.tally.doing', { count: counts.doing }) },
        { id: 'done', text: t('tasks.tally.done', { count: counts.done }) },
    ];

    // ── All existing tags, by use ────────────────────

    const topTags = useMemo(() => {
        const counted = new Map<string, number>();
        for (const task of tasks)
            for (const tag of task.tags) counted.set(tag, (counted.get(tag) ?? 0) + 1);
        return [...counted.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
    }, [tasks]);

    const suggestions = useMemo(() => {
        const has = (token: string) =>
            search.toLocaleLowerCase().split(/\s+/).includes(token.toLocaleLowerCase());
        return [
            ...topTags.slice(0, 5).map((tag) => `#${tag}`),
            `!${t('priority.high').toLocaleLowerCase()}`,
            t('tasks.search.kw.overdue'),
            t('tasks.search.kw.nodate'),
        ].filter((token) => !has(token));
    }, [topTags, search, t]);

    const addToken = (token: string) => {
        setSearch((prev) => `${prev.trim() ? `${prev.trim()} ` : ''}${token} `);
        searchBoxRef.current?.querySelector('input')?.focus();
    };

    const openSearch = () => {
        setShowStats(false);
        setSearchOpen(true);
        window.setTimeout(() => searchBoxRef.current?.querySelector('input')?.focus(), 0);
    };

    const closeSearch = () => {
        setSearch('');
        setSearchOpen(false);
    };

    // ── The menu behind ⋯ ────────────────────────────

    const reload = useCallback(() => plugin.dataService.reloadTasks(), [plugin]);

    const openMenu = (e: React.MouseEvent) => {
        const menu = new Menu();
        if (statsOn) {
            menu.addItem((item) =>
                item
                    .setTitle(t('common.statistics'))
                    .setIcon('bar-chart-3')
                    .setChecked(showStats)
                    .onClick(() => setShowStats((v) => !v))
            );
        }
        if (calendarOn) {
            menu.addItem((item) =>
                item
                    .setTitle(t('tasks.openCalendar'))
                    .setIcon('calendar-days')
                    .onClick(() => void plugin.moduleManager.get('tasks-calendar')?.activateView())
            );
        }
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t('tasks.view.sort')).setIsLabel(true));
        for (const sort of ['manual', 'dueDate', 'priority', 'created'] as const) {
            menu.addItem((item) =>
                item
                    .setTitle(t(`tasks.sort.${sort}`))
                    .setChecked(filters.sort === sort)
                    .onClick(() => setFilters((f) => ({ ...f, sort })))
            );
        }
        if (groups.length > 1) {
            menu.addSeparator();
            menu.addItem((item) => item.setTitle(t('tasks.view.group')).setIsLabel(true));
            for (const group of groups) {
                menu.addItem((item) =>
                    item
                        .setTitle(t(`tasks.group.${group}`))
                        .setChecked(filters.group === group)
                        .onClick(() => setFilters((f) => ({ ...f, group })))
                );
            }
        }
        // On a touch screen the handles stay hidden until asked for: there a
        // row swipes, and a handle on every row read as clutter. Offered under
        // a sort as well — it then brings out the subtasks' handles only, the
        // tasks' own order being the sort's (see `reorderScope`).
        if (dragOn && Platform.isMobile) {
            menu.addSeparator();
            menu.addItem((item) =>
                item
                    .setTitle(t(reorderMode ? 'tasks.view.reorderDone' : 'tasks.view.reorder'))
                    .setIcon('grip-vertical')
                    .onClick(() => setReorderMode(!reorderMode))
            );
        }
        menu.addSeparator();
        menu.addItem((item) =>
            item
                .setTitle(t('common.refresh'))
                .setIcon('rotate-cw')
                .setDisabled(tasksLoading)
                .onClick(() => void reload())
        );
        menu.showAtMouseEvent(e.nativeEvent);
    };

    // ── The keyboard, while focus is in this view ────

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        // React hands this view the keys of a dialog it opened too — the editor
        // is portalled out of the view but not out of its component tree.
        if (!(e.target instanceof Node) || !rootRef.current?.contains(e.target)) return;
        if (isTyping(e.target)) return;
        const heads = Array.from(
            rootRef.current?.querySelectorAll<HTMLElement>('[data-task-head]') ?? []
        ).filter((el) => el.tabIndex >= 0);
        const at = heads.indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (heads.length === 0) return;
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            const next =
                at === -1
                    ? step > 0
                        ? 0
                        : heads.length - 1
                    : Math.max(0, Math.min(heads.length - 1, at + step));
            heads[next].focus();
            heads[next].scrollIntoView({ block: 'nearest' });
        } else if (e.code === 'KeyN' && !e.shiftKey) {
            e.preventDefault();
            setShowStats(false);
            window.setTimeout(() => quickRef.current?.focus(), 0);
        } else if (e.code === 'Slash' || e.key === '/') {
            e.preventDefault();
            openSearch();
        } else if (e.key === 'Escape' && searchOpen) {
            e.preventDefault();
            closeSearch();
        }
    };

    // ── Render ───────────────────────────────────────

    const statsShown = statsOn && showStats;

    const empty =
        tasks.length === 0 ? (
            <div className="zenith-tempty">
                <p className="zenith-tempty__lead">{t('tasks.empty.fresh')}</p>
                <p className="zenith-tempty__hint">{t('tasks.empty.freshHint')}</p>
            </div>
        ) : (
            <div className="zenith-tempty">
                <p className="zenith-tempty__lead">
                    {tab === 'done' && !filtering
                        ? t('tasks.empty.doneNone')
                        : t('tasks.empty.none')}
                </p>
                {filtering && <p className="zenith-tempty__hint">{t('tasks.empty.noneHint')}</p>}
            </div>
        );

    return (
        <div className="zenith-tasks" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
            {/* The page inside the scroller: the scroller is the container the
                layout asks how wide it is, and a container cannot restyle itself. */}
            <div className="zenith-tasks__page">
                <header className="zenith-tasks-head">
                    <div className="zenith-tasks-head__top">
                        <h2 className="zenith-tasks-head__day">{dayHeading(t.locale)}</h2>
                        <div className="zenith-tasks-head__actions">
                            <button
                                type="button"
                                className={`zenith-tasks-head__btn ${searchOpen ? 'is-on' : ''}`}
                                aria-label={t('tasks.searchOpen')}
                                title={`${t('tasks.searchOpen')} (/)`}
                                aria-pressed={searchOpen}
                                onClick={() => (searchOpen ? closeSearch() : openSearch())}
                            >
                                <Search size={16} />
                            </button>
                            <button
                                type="button"
                                className="zenith-tasks-head__btn"
                                aria-label={t('tasks.view.menu')}
                                title={t('tasks.view.menu')}
                                onClick={openMenu}
                            >
                                <MoreHorizontal size={17} />
                            </button>
                        </div>
                    </div>

                    <nav className="zenith-tasks-tally" aria-label={t('tasks.title')}>
                        {tally.map((item, i) => (
                            <React.Fragment key={item.id}>
                                {i > 0 && (
                                    <span className="zenith-tasks-tally__sep" aria-hidden="true">
                                        ·
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className={`zenith-tasks-tally__item ${tab === item.id && !statsShown ? 'is-on' : ''}`}
                                    aria-pressed={tab === item.id}
                                    title={tab === item.id ? t('tasks.tally.all') : undefined}
                                    onClick={() => {
                                        setShowStats(false);
                                        setTab((cur) => (cur === item.id ? 'all' : item.id));
                                    }}
                                >
                                    {item.text}
                                </button>
                            </React.Fragment>
                        ))}
                        {tasksLoading && (
                            <RotateCw size={12} className="zenith-spin zenith-tasks-tally__busy" />
                        )}
                    </nav>

                    {searchOpen && !statsShown && (
                        <div
                            className="zenith-tasks-search"
                            ref={searchBoxRef}
                            onFocus={() => setSearchFocus(true)}
                            onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget))
                                    setSearchFocus(false);
                            }}
                        >
                            <SearchField
                                value={search}
                                onChange={setSearch}
                                placeholder={t('tasks.searchHint')}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        closeSearch();
                                        rootRef.current?.focus();
                                    }
                                }}
                                aria-label={t('tasks.searchOpen')}
                            />
                            <div
                                className={`zenith-tasks-search__chips ${searchFocus || !search ? 'is-shown' : ''}`}
                            >
                                {suggestions.map((token) => (
                                    <button
                                        key={token}
                                        type="button"
                                        className="zenith-tasks-search__chip"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => addToken(token)}
                                    >
                                        {token}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </header>

                {statsShown ? (
                    <TaskStats tasks={tasks} />
                ) : (
                    <>
                        {tab !== 'done' && <TaskQuickLine ref={quickRef} onExpand={setDraft} />}
                        {reorderMode && (
                            <button
                                type="button"
                                className="zenith-tasks-reorder"
                                onClick={() => setReorderMode(false)}
                            >
                                {t('tasks.view.reorderDone')}
                            </button>
                        )}
                        {tasksLoading && tasks.length === 0 ? (
                            <div className="zenith-tasks-loading">
                                <RotateCw size={16} className="zenith-spin" />
                                <span>{t('tasks.loading')}</span>
                            </div>
                        ) : (
                            <TaskList
                                tasks={shown}
                                groupMode={groupMode}
                                sort={filters.sort}
                                reorderable={byHand.tasks}
                                subtasksReorderable={byHand.subtasks}
                                empty={empty}
                            />
                        )}
                    </>
                )}

                {draft && (
                    <TaskEditorModal
                        initial={draft}
                        onClose={() => setDraft(null)}
                        onSaved={reload}
                    />
                )}
            </div>
        </div>
    );
};
