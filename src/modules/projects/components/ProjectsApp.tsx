import React, { useCallback, useMemo, useState, type FC } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { Notice, TFile } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { PromptModal } from '../../../core/PromptModal';
import type { Project, ProjectStatus } from '../projectsTypes';
import { filterTasksForProject } from '../services/projectParser';
import { ProjectWriter } from '../services/projectWriter';
import { ProjectFormModal } from '../ProjectFormModal';
import { ProjectCard } from './ProjectCard';
import { TaskWriter } from '../../tasks/services/taskWriter';
import { ViewHeader } from '../../../components/shared';
import { SearchField } from '../../../components/ui/fields';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';

/**
 * Sort projects the way the dashboard widget already sorts them.
 *
 * The grid used to render them in whatever order the parser produced, which is
 * the folder's alphabetical order — while the widget six inches away put the
 * nearest deadline first and explained in a comment why an undated project is
 * not urgent but undated. Two orders for one set of data in one plugin is not
 * a preference, it is a bug that nobody had written down.
 */
export function sortProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) => {
        const x = a.stats.daysRemaining;
        const y = b.stats.daysRemaining;
        if (x !== undefined && y !== undefined && x !== y) return x - y;
        if (x !== undefined && y === undefined) return -1;
        if (x === undefined && y !== undefined) return 1;
        return a.title.localeCompare(b.title);
    });
}

export const ProjectsApp: FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();

    const projects = useZenithStore((s) => s.projects);
    const tasks = useZenithStore((s) => s.tasks);
    const statusFilter = useZenithStore((s) => s.projectStatusFilter);
    const searchQuery = useZenithStore((s) => s.projectSearchQuery);
    const setStatusFilter = useZenithStore((s) => s.setProjectStatusFilter);
    const setSearchQuery = useZenithStore((s) => s.setProjectSearchQuery);
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const matching = projects.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            if (!q) return true;
            return (
                p.title.toLowerCase().includes(q) ||
                p.tags.some((tag) => tag.toLowerCase().includes(q))
            );
        });
        return sortProjects(matching);
    }, [projects, statusFilter, searchQuery]);

    const summary = useMemo(() => {
        const active = projects.filter(
            (p) => p.status === 'active' || p.status === 'in-progress'
        ).length;
        const totalTasks = projects.reduce((n, p) => n + p.stats.totalTasks, 0);
        const doneTasks = projects.reduce((n, p) => n + p.stats.completedTasks, 0);
        return { total: projects.length, active, totalTasks, doneTasks };
    }, [projects]);

    const openNote = useCallback(
        (project: Project) => {
            void app.workspace.openLinkText(project.filePath, '', false);
        },
        [app]
    );

    const openForm = useCallback(
        (project?: Project) => new ProjectFormModal(app, plugin, project).open(),
        [app, plugin]
    );

    const changeProjectStatus = useCallback(
        async (project: Project, status: ProjectStatus) => {
            const file = app.vault.getAbstractFileByPath(project.filePath);
            if (!(file instanceof TFile)) return;
            try {
                await new ProjectWriter(app).setStatus(file, status);
            } catch (err) {
                console.error('Zenith: failed to change the project status:', err);
                new Notice(t('projects.notice.saveFailed'));
            }
        },
        [app, t]
    );

    /**
     * A task, written into the project's own note.
     *
     * Straight into the note rather than into the inbox with a link back,
     * because the note is the least ambiguous of the ways a task can belong to
     * a project — no wikilink to keep pointing at the right file, nothing to
     * break when the project is renamed. `addTask` aims at the template's
     * tasks heading and falls back to the end of the file, which is where a
     * project whose heading was renamed or translated will collect them.
     */
    const addTask = useCallback(
        async (project: Project) => {
            const title = await new PromptModal(app, {
                title: t('projects.card.addTask.title'),
                placeholder: t('projects.card.addTask.placeholder'),
                confirmText: t('projects.card.addTask'),
                cancelText: t('projects.form.cancel'),
            }).ask();
            if (!title?.trim()) return;

            try {
                await new TaskWriter(app).addTask(
                    '',
                    { title: title.trim(), priority: 'none', tags: [] },
                    { filePath: project.filePath, heading: t('projects.template.tasks') }
                );
                new Notice(t('projects.notice.taskAdded'));
            } catch (err) {
                console.error('Zenith: failed to add the task:', err);
                new Notice(t('projects.notice.taskFailed'));
            }
        },
        [app, t]
    );

    /**
     * A checkbox here used to flip between done and not-done, so the two
     * statuses in the middle — in progress, cancelled — could be seen on a
     * project card but only set somewhere else. It is the tasks module's own
     * control now, with the tasks module's own menu, and all four are one
     * click away wherever a task is drawn.
     */
    const changeTaskStatus = useCallback(
        async (task: Task, next: TaskStatus) => {
            if (next === task.status) return;
            const prev = task.status;
            setTaskStatus(task.id, next);
            if (!task.filePath) return;
            try {
                const ok = await new TaskWriter(app).setStatusInFile(
                    task.filePath,
                    task.lineNumber,
                    next,
                    task.title
                );
                if (!ok) {
                    setTaskStatus(task.id, prev);
                    new Notice(t('projects.notice.taskFailed'));
                }
            } catch (err) {
                console.error('Zenith: failed to update task:', err);
                setTaskStatus(task.id, prev);
            }
        },
        [app, setTaskStatus, t]
    );

    const statusTabs: Array<{ id: ProjectStatus | 'all'; label: string }> = [
        { id: 'all', label: t('projects.status.all') },
        { id: 'active', label: t('projects.status.active') },
        { id: 'in-progress', label: t('projects.status.in-progress') },
        { id: 'paused', label: t('projects.status.paused') },
        { id: 'completed', label: t('projects.status.completed') },
        { id: 'archived', label: t('projects.status.archived') },
    ];

    return (
        // The shell exists only to be measured: a container query cannot size
        // the element that declares the container, so the padding that has to
        // shrink on a phone lives one level in.
        <div className="zenith-projects-shell">
            <div className="zenith-projects">
                {/* The four figures were four bordered boxes across the top of the
                view — ninety pixels to say "6 projects" above a grid of six
                projects. They are a caption to the title now, in the one
                header every module's view is built from. */}
                <ViewHeader
                    icon={FolderKanban}
                    title={t('projects.title')}
                    caption={
                        <>
                            <span>{t('projects.summary.total', { count: summary.total })}</span>
                            <span>{t('projects.summary.active', { count: summary.active })}</span>
                            <span>
                                {t('projects.summary.tasks', {
                                    done: summary.doneTasks,
                                    total: summary.totalTasks,
                                })}
                            </span>
                        </>
                    }
                >
                    <button
                        type="button"
                        className="zenith-btn zenith-btn--cta"
                        onClick={() => openForm()}
                    >
                        <Plus size={15} />
                        <span>{t('projects.new')}</span>
                    </button>
                </ViewHeader>

                <div className="zenith-projects__controls">
                    <SearchField
                        className="zenith-projects__search-box"
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder={t('projects.search')}
                    />

                    <div className="zenith-projects__status-tabs">
                        {statusTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`zenith-projects__tab ${statusFilter === tab.id ? 'is-active' : ''}`}
                                onClick={() => setStatusFilter(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="zenith-projects__empty">
                        <FolderKanban size={40} className="zenith-projects__empty-icon" />
                        <div className="zenith-projects__empty-title">
                            {t('projects.empty.title')}
                        </div>
                        <div className="zenith-projects__empty-desc">
                            {t('projects.empty.desc')}
                        </div>
                    </div>
                ) : (
                    <div className="zenith-projects__grid">
                        {filtered.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                tasks={filterTasksForProject(project, tasks)}
                                expanded={expanded[project.id] ?? false}
                                onToggleTasks={() =>
                                    setExpanded((prev) => ({
                                        ...prev,
                                        [project.id]: !(prev[project.id] ?? false),
                                    }))
                                }
                                onOpenNote={() => openNote(project)}
                                onEdit={() => openForm(project)}
                                onStatus={(s) => void changeProjectStatus(project, s)}
                                onAddTask={() => void addTask(project)}
                                onTaskStatus={(task, next) => void changeTaskStatus(task, next)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
