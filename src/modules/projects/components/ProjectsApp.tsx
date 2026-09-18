import React, { useCallback, useMemo, useState, type FC } from 'react';
import {
    Clock,
    ExternalLink,
    FolderKanban,
    ListTodo,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { Project, ProjectStatus } from '../projectsTypes';
import { filterTasksForProject } from '../services/projectParser';
import { TaskWriter } from '../../tasks/services/taskWriter';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { Notice } from 'obsidian';

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

    const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

    const toggleTasksExpanded = (projectId: string) => {
        setExpandedTasks((prev) => ({
            ...prev,
            [projectId]: !prev[projectId],
        }));
    };

    // Filter projects according to search query and status filter
    const filteredProjects = useMemo(() => {
        return projects.filter((p) => {
            if (statusFilter !== 'all' && p.status !== statusFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = p.title.toLowerCase().includes(q);
                const matchTag = p.tags.some((tag) => tag.toLowerCase().includes(q));
                if (!matchTitle && !matchTag) return false;
            }
            return true;
        });
    }, [projects, statusFilter, searchQuery]);

    // Statistics across all projects
    const statsSummary = useMemo(() => {
        const total = projects.length;
        const active = projects.filter((p) => p.status === 'active' || p.status === 'in-progress').length;
        const completed = projects.filter((p) => p.status === 'completed').length;
        const totalTasks = projects.reduce((sum, p) => sum + p.stats.totalTasks, 0);
        const completedTasks = projects.reduce((sum, p) => sum + p.stats.completedTasks, 0);
        const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        return { total, active, completed, totalTasks, completedTasks, overallProgress };
    }, [projects]);

    const openNote = useCallback(
        (project: Project) => {
            void app.workspace.openLinkText(project.filePath, '', false);
        },
        [app]
    );

    const handleCreateProject = useCallback(async () => {
        try {
            const folder = projectsFolderPath || '20 Projects';
            const existingFolder = app.vault.getAbstractFileByPath(folder);
            if (!existingFolder) {
                await app.vault.createFolder(folder);
            }

            const dateStr = new Date().toISOString().slice(0, 10);
            let filename = `${folder}/New Project.md`;
            let counter = 1;
            while (app.vault.getAbstractFileByPath(filename)) {
                filename = `${folder}/New Project ${counter++}.md`;
            }

            const initialContent = `---
title: Новый проект
status: active
priority: normal
due: ${dateStr}
tags:
  - project
---

# Новый проект

## Описание
Краткое описание проекта.

## Задачи
- [ ] Определить ключевые цели
- [ ] Составить список шагов
`;
            const file = await app.vault.create(filename, initialContent);
            new Notice('Проект создан');
            await app.workspace.openLinkText(file.path, '', false);
        } catch (err) {
            console.error('Failed to create project:', err);
            new Notice('Не удалось создать проект');
        }
    }, [app, projectsFolderPath]);

    const handleToggleTask = async (task: Task) => {
        const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
        const prevStatus = task.status;
        setTaskStatus(task.id, nextStatus);

        if (task.filePath) {
            try {
                const ok = await new TaskWriter(app).setStatusInFile(
                    task.filePath,
                    task.lineNumber,
                    nextStatus
                );
                if (!ok) {
                    setTaskStatus(task.id, prevStatus);
                    new Notice('Не удалось обновить статус задачи');
                }
            } catch (err) {
                console.error('Task update failed', err);
                setTaskStatus(task.id, prevStatus);
            }
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
            {/* ── Top Header ────────────────────────────── */}
            <div className="zenith-projects__header">
                <h1 className="zenith-projects__header-title">
                    <FolderKanban size={24} color="var(--zenith-accent)" />
                    <span>{t('projects.title')}</span>
                </h1>
                <div className="zenith-projects__header-actions">
                    <button
                        type="button"
                        className="mod-cta"
                        onClick={handleCreateProject}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Plus size={16} />
                        <span>{t('projects.new')}</span>
                    </button>
                </div>
            </div>

            {/* ── Stats Summary Bar ─────────────────────── */}
            <div className="zenith-projects__stats-bar">
                <div className="zenith-projects__stat-card">
                    <span className="zenith-projects__stat-label">{t('projects.title')}</span>
                    <span className="zenith-projects__stat-value">{statsSummary.total}</span>
                </div>
                <div className="zenith-projects__stat-card">
                    <span className="zenith-projects__stat-label">{t('projects.status.active')}</span>
                    <span className="zenith-projects__stat-value" style={{ color: 'var(--zenith-accent)' }}>
                        {statsSummary.active}
                    </span>
                </div>
                <div className="zenith-projects__stat-card">
                    <span className="zenith-projects__stat-label">{t('projects.status.completed')}</span>
                    <span className="zenith-projects__stat-value" style={{ color: 'var(--zenith-success)' }}>
                        {statsSummary.completed}
                    </span>
                </div>
                <div className="zenith-projects__stat-card">
                    <span className="zenith-projects__stat-label">{t('projects.stats.tasks')}</span>
                    <span className="zenith-projects__stat-value">
                        {statsSummary.completedTasks} / {statsSummary.totalTasks} ({statsSummary.overallProgress}%)
                    </span>
                </div>
            </div>

            {/* ── Controls (Search + Filters) ─────────────── */}
            <div className="zenith-projects__controls">
                <div className="zenith-projects__search-box">
                    <Search size={14} color="var(--zenith-text-muted)" />
                    <input
                        type="text"
                        placeholder={t('projects.search')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                            <X size={14} color="var(--zenith-text-muted)" />
                        </button>
                    )}
                </div>

                <div className="zenith-projects__status-tabs">
                    {statusTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`zenith-projects__tab ${
                                statusFilter === tab.id ? 'is-active' : ''
                            }`}
                            onClick={() => setStatusFilter(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Projects Grid ───────────────────────────── */}
            {filteredProjects.length === 0 ? (
                <div className="zenith-projects__empty">
                    <FolderKanban size={48} className="zenith-projects__empty-icon" />
                    <div className="zenith-projects__empty-title">{t('projects.empty.title')}</div>
                    <div className="zenith-projects__empty-desc">{t('projects.empty.desc')}</div>
                </div>
            ) : (
                <div className="zenith-projects__grid">
                    {filteredProjects.map((project) => {
                        const projectTasks = filterTasksForProject(tasks, project);
                        const isExpanded = expandedTasks[project.id] ?? false;
                        const pct = project.stats.progressPercent;
                        const daysLeft = project.stats.daysRemaining;
                        const isOverdue = project.stats.isOverdue;

                        return (
                            <div key={project.id} className="zenith-project-card">
                                {/* Header */}
                                <div className="zenith-project-card__header">
                                    <div className="zenith-project-card__title-row">
                                        <div className="zenith-project-card__badges">
                                            <span
                                                className={`zenith-project-badge zenith-project-badge--${project.status}`}
                                            >
                                                {t(`projects.status.${project.status}`)}
                                            </span>
                                            {project.priority && (
                                                <span
                                                    className={`zenith-project-priority zenith-project-priority--${project.priority}`}
                                                >
                                                    {project.priority.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <a
                                            className="zenith-project-card__title"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                openNote(project);
                                            }}
                                            href="#"
                                        >
                                            {project.title}
                                        </a>
                                    </div>

                                    {/* Due date info */}
                                    {project.due && (
                                        <div
                                            className={`zenith-project-due ${
                                                isOverdue ? 'is-overdue' : daysLeft === 0 ? 'is-today' : ''
                                            }`}
                                        >
                                            <Clock size={12} />
                                            <span>
                                                {isOverdue
                                                    ? `${Math.abs(daysLeft ?? 0)} ${t('projects.stats.overdue')}`
                                                    : daysLeft === 0
                                                    ? t('projects.stats.today')
                                                    : `${daysLeft} ${t('projects.stats.daysLeft')}`}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                <div className="zenith-project-card__progress-block">
                                    <div className="zenith-project-card__progress-info">
                                        <span>
                                            {project.stats.completedTasks} / {project.stats.totalTasks}{' '}
                                            {t('projects.stats.completed')}
                                        </span>
                                        <span className="zenith-project-card__progress-pct">{pct}%</span>
                                    </div>
                                    <div className="zenith-project-progress-track">
                                        <div
                                            className={`zenith-project-progress-fill ${
                                                pct === 100 ? 'is-complete' : ''
                                            }`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Tasks Preview */}
                                <div className="zenith-project-card__tasks">
                                    <div
                                        className="zenith-project-card__tasks-header"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleTasksExpanded(project.id)}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <ListTodo size={12} />
                                            <span>
                                                {t('projects.stats.tasks')} ({projectTasks.length})
                                            </span>
                                        </span>
                                        <span>{isExpanded ? 'Скрыть ▲' : 'Показать ▼'}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                            {projectTasks.length === 0 ? (
                                                <div style={{ fontSize: '0.78rem', color: 'var(--zenith-text-muted)', padding: '4px 0' }}>
                                                    {t('projects.tasks.noTasks')}
                                                </div>
                                            ) : (
                                                projectTasks.map((task) => (
                                                    <div
                                                        key={task.id}
                                                        className={`zenith-project-task-item ${
                                                            task.status === 'done' ? 'is-done' : ''
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="zenith-project-task-checkbox"
                                                            checked={task.status === 'done'}
                                                            onChange={() => handleToggleTask(task)}
                                                        />
                                                        <span className="zenith-project-task-text">
                                                            {task.title}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="zenith-project-card__footer">
                                    <div className="zenith-project-card__tags">
                                        {project.tags.map((tag) => (
                                            <span key={tag} className="zenith-project-tag">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        className="zenith-project-card__open-btn"
                                        onClick={() => openNote(project)}
                                    >
                                        <span>{t('projects.card.openNote')}</span>
                                        <ExternalLink size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
