import React, { useCallback, useMemo, type FC } from 'react';
import { ArrowRight, FolderKanban } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import type { Project } from '../projectsTypes';

export const ProjectsWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const projects = useZenithStore((s) => s.projects);

    const activeProjects = useMemo(() => {
        return projects
            .filter((p) => p.status === 'active' || p.status === 'in-progress')
            .sort((a, b) => {
                // First overdue / due soonest
                if (a.stats.daysRemaining !== undefined && b.stats.daysRemaining !== undefined) {
                    return a.stats.daysRemaining - b.stats.daysRemaining;
                }
                if (a.stats.daysRemaining !== undefined) return -1;
                if (b.stats.daysRemaining !== undefined) return 1;
                return a.title.localeCompare(b.title);
            });
    }, [projects]);

    const openProjectsView = useCallback(() => {
        void plugin.moduleManager.get('projects')?.activateView();
    }, [plugin]);

    const openProjectNote = useCallback(
        (project: Project) => {
            void app.workspace.openLinkText(project.filePath, '', false);
        },
        [app]
    );

    // Number of items to display based on widget size
    const maxItems = size === 'sm' ? 2 : size === 'md' ? 4 : 8;
    const displayed = activeProjects.slice(0, maxItems);

    if (activeProjects.length === 0) {
        return (
            <div className="zenith-projects-widget">
                <div className="zenith-projects__empty" style={{ padding: '24px 10px' }}>
                    <FolderKanban size={28} className="zenith-projects__empty-icon" />
                    <div className="zenith-projects__empty-title" style={{ fontSize: '0.9rem' }}>
                        {t('projects.widget.empty')}
                    </div>
                </div>
                <div className="zenith-projects-widget__footer">
                    <button
                        type="button"
                        className="zenith-projects-widget__open-all"
                        onClick={openProjectsView}
                    >
                        <span>{t('projects.widget.open')}</span>
                        <ArrowRight size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="zenith-projects-widget">
            <div className="zenith-projects-widget__list">
                {displayed.map((p) => {
                    const pct = p.stats.progressPercent;
                    const isOverdue = p.stats.isOverdue;
                    const daysLeft = p.stats.daysRemaining;

                    return (
                        <div
                            key={p.id}
                            className="zenith-projects-widget__item"
                            onClick={() => openProjectNote(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    openProjectNote(p);
                                }
                            }}
                        >
                            <div className="zenith-projects-widget__item-top">
                                <span className="zenith-projects-widget__item-title">{p.title}</span>
                                {daysLeft !== undefined && (
                                    <span
                                        className={`zenith-projects-widget__item-due ${
                                            isOverdue ? 'is-overdue' : ''
                                        }`}
                                    >
                                        {isOverdue
                                            ? t('projects.stats.overdue')
                                            : daysLeft === 0
                                            ? t('projects.stats.today')
                                            : `${daysLeft} ${t('projects.stats.daysLeft')}`}
                                    </span>
                                )}
                            </div>
                            <div className="zenith-projects-widget__meter">
                                <div className="zenith-projects-widget__meter-bar">
                                    <div
                                        className="zenith-projects-widget__meter-fill"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <span className="zenith-projects-widget__meter-label">
                                    {p.stats.totalTasks > 0
                                        ? `${p.stats.completedTasks}/${p.stats.totalTasks}`
                                        : `${pct}%`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="zenith-projects-widget__footer">
                <span style={{ fontSize: '0.75rem', color: 'var(--zenith-text-muted)' }}>
                    {activeProjects.length} {t('projects.stats.tasks') ? activeProjects.length === 1 ? 'проект' : 'проекта' : ''}
                </span>
                <button
                    type="button"
                    className="zenith-projects-widget__open-all"
                    onClick={openProjectsView}
                >
                    <span>{t('projects.widget.open')}</span>
                    <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );
};
