import React, { useCallback, useMemo, useState, type FC } from 'react';
import { ChevronDown, FolderKanban, Plus, Search, X } from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { Project, ProjectStatus } from '../projectsTypes';
import { filterTasksForProject } from '../services/projectParser';
import { dueLabel } from '../services/projectStats';
import { TaskWriter } from '../../tasks/services/taskWriter';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { StatusBox } from '../../tasks/components/taskStatusUi';

/** Priorities worth a word on the card. The other three are the ordinary case. */
const LOUD_PRIORITIES = new Set(['urgent', 'high']);

export const ProjectsApp: FC = () => {
    const t = useTranslation();
    const { app } = useApp();

    const projects = useZenithStore((s) => s.projects);
    const tasks = useZenithStore((s) => s.tasks);
    const statusFilter = useZenithStore((s) => s.projectStatusFilter);
    const searchQuery = useZenithStore((s) => s.projectSearchQuery);
    const setStatusFilter = useZenithStore((s) => s.setProjectStatusFilter);
    const setSearchQuery = useZenithStore((s) => s.setProjectSearchQuery);
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);
    const projectsFolderPath = useZenithStore((s) => s.settings.projectsFolderPath);

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return projects.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            if (!q) return true;
            return (
                p.title.toLowerCase().includes(q) ||
                p.tags.some((tag) => tag.toLowerCase().includes(q))
            );
        });
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

    const createProject = useCallback(async () => {
        try {
            const folder = projectsFolderPath || '20 Projects';
            if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);

            const title = t('projects.template.title');
            let filename = `${folder}/${title}.md`;
            let counter = 1;
            while (app.vault.getAbstractFileByPath(filename)) {
                filename = `${folder}/${title} ${counter++}.md`;
            }

            // The note the user lands in is theirs to speak, so every word of
            // it comes from the dictionary rather than from this file — which
            // is where the Russian used to be hardcoded, in an English source
            // file, for an English user.
            const body = [
                '---',
                `title: ${title}`,
                'status: active',
                'priority: medium',
                `due: ${new Date().toISOString().slice(0, 10)}`,
                'tags:',
                '  - project',
                '---',
                '',
                `# ${title}`,
                '',
                `## ${t('projects.template.about')}`,
                t('projects.template.aboutHint'),
                '',
                `## ${t('projects.template.tasks')}`,
                `- [ ] ${t('projects.template.firstTask')}`,
                '',
            ].join('\n');

            const file = await app.vault.create(filename, body);
            await app.workspace.openLinkText(file.path, '', false);
        } catch (err) {
            console.error('Zenith: failed to create project:', err);
            new Notice(t('projects.notice.createFailed'));
        }
    }, [app, projectsFolderPath, t]);

    const toggleTask = async (task: Task) => {
        const next: TaskStatus = task.status === 'done' ? 'todo' : 'done';
        const prev = task.status;
        setTaskStatus(task.id, next);
        if (!task.filePath) return;
        try {
            const ok = await new TaskWriter(app).setStatusInFile(task.filePath, task.lineNumber, next);
            if (!ok) {
                setTaskStatus(task.id, prev);
                new Notice(t('projects.notice.taskFailed'));
            }
        } catch (err) {
            console.error('Zenith: failed to update task:', err);
            setTaskStatus(task.id, prev);
        }
    };

    const statusTabs: Array<{ id: ProjectStatus | 'all'; label: string }> = [
        { id: 'all', label: t('projects.status.all') },
        { id: 'active', label: t('projects.status.active') },
        { id: 'in-progress', label: t('projects.status.in-progress') },
        { id: 'paused', label: t('projects.status.paused') },
        { id: 'completed', label: t('projects.status.completed') },
        { id: 'archived', label: t('projects.status.archived') },
    ];

    return (
        <div className="zenith-projects">
            {/* The four figures were four bordered boxes across the top of the
                view — ninety pixels to say "6 projects" above a grid of six
                projects. They are a caption to the title now. */}
            <div className="zenith-projects__header">
                <h1 className="zenith-projects__header-title">
                    <FolderKanban size={20} color="var(--zenith-accent)" />
                    <span>{t('projects.title')}</span>
                </h1>

                <div className="zenith-projects__summary">
                    <span>{t('projects.summary.total', { count: summary.total })}</span>
                    <span>{t('projects.summary.active', { count: summary.active })}</span>
                    <span>
                        {t('projects.summary.tasks', {
                            done: summary.doneTasks,
                            total: summary.totalTasks,
                        })}
                    </span>
                </div>

                <button type="button" className="mod-cta zenith-projects__new" onClick={createProject}>
                    <Plus size={15} />
                    <span>{t('projects.new')}</span>
                </button>
            </div>

            <div className="zenith-projects__controls">
                <div className="zenith-projects__search-box">
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder={t('projects.search')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="zenith-projects__search-clear"
                            aria-label={t('common.clear')}
                            onClick={() => setSearchQuery('')}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

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
                    <div className="zenith-projects__empty-title">{t('projects.empty.title')}</div>
                    <div className="zenith-projects__empty-desc">{t('projects.empty.desc')}</div>
                </div>
            ) : (
                <div className="zenith-projects__grid">
                    {filtered.map((project) => {
                        const projectTasks = filterTasksForProject(tasks, project);
                        const open = expanded[project.id] ?? false;
                        const due = dueLabel(project, t);
                        const loud = LOUD_PRIORITIES.has(project.priority);

                        return (
                            <article key={project.id} className="zenith-project-card">
                                {/* The title is the way into the note. It used
                                    to share that job with a bordered "open
                                    note" button in the corner — the loudest
                                    control on the card, for the one action its
                                    own heading already performs. */}
                                <div className="zenith-project-card__top">
                                    <a
                                        className="zenith-project-card__title"
                                        href="#"
                                        title={t('projects.card.openNote')}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            openNote(project);
                                        }}
                                    >
                                        {project.title}
                                    </a>
                                    {due && (
                                        <span className={`zenith-project-due ${due.tone}`}>
                                            {due.text}
                                        </span>
                                    )}
                                </div>

                                {/* One quiet line instead of two filled pills.
                                    The status was set in a coloured box and the
                                    priority in English capitals beside it —
                                    `priority.toUpperCase()`, which is how
                                    "URGENT" ended up shouting in a Russian
                                    interface. A priority is only worth a word
                                    when it is one of the two that mean hurry;
                                    the rest is the ordinary case and says
                                    nothing by saying "MEDIUM". */}
                                <div className="zenith-project-card__meta">
                                    <span
                                        className={`zenith-project-state zenith-project-state--${project.status}`}
                                    >
                                        {t(`projects.state.${project.status}`)}
                                    </span>
                                    {loud && (
                                        <span
                                            className={`zenith-project-prio zenith-project-prio--${project.priority}`}
                                        >
                                            {t(`priority.${project.priority}`)}
                                        </span>
                                    )}
                                    {project.tags.map((tag) => (
                                        <span key={tag} className="zenith-project-tag">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>

                                {/* The bar IS the percentage. It used to be
                                    drawn under "1 / 3 выполнено" and "33%",
                                    which is the same fraction three times in
                                    three notations. */}
                                <div className="zenith-project-card__meter">
                                    <span className="zenith-project-progress-track">
                                        <span
                                            className={`zenith-project-progress-fill ${
                                                project.stats.progressPercent === 100 ? 'is-complete' : ''
                                            }`}
                                            style={{ width: `${project.stats.progressPercent}%` }}
                                        />
                                    </span>
                                    <span className="zenith-project-card__count">
                                        {project.stats.completedTasks} / {project.stats.totalTasks}
                                    </span>
                                </div>

                                {projectTasks.length > 0 && (
                                    <div className="zenith-project-card__tasks">
                                        <button
                                            type="button"
                                            className={`zenith-project-card__toggle ${open ? 'is-open' : ''}`}
                                            aria-expanded={open}
                                            onClick={() =>
                                                setExpanded((prev) => ({
                                                    ...prev,
                                                    [project.id]: !open,
                                                }))
                                            }
                                        >
                                            <ChevronDown size={13} />
                                            {t('projects.card.tasksN', { count: projectTasks.length })}
                                        </button>

                                        {open && (
                                            <ul className="zenith-project-card__task-list">
                                                {projectTasks.map((task) => (
                                                    <li
                                                        key={task.id}
                                                        className={`zenith-project-task-item ${
                                                            task.status === 'done' ? 'is-done' : ''
                                                        }`}
                                                    >
                                                        {/* The same checkbox the tasks
                                                            module draws, so one glyph
                                                            means one thing everywhere. */}
                                                        <button
                                                            type="button"
                                                            className="zenith-project-task-check"
                                                            aria-label={task.title}
                                                            aria-pressed={task.status === 'done'}
                                                            onClick={() => void toggleTask(task)}
                                                        >
                                                            <StatusBox status={task.status} size={14} />
                                                        </button>
                                                        <span className="zenith-project-task-text">
                                                            {task.title}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
