import React, { useCallback, useMemo, type FC } from 'react';
import { ArrowRight, FolderKanban, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { ROOM_WIDE, rowPx, rowsThatFit, useCardRoom } from '../../dashboard/cardRoom';
import type { Project } from '../projectsTypes';
import { dueLabel } from '../services/projectStats';
import { useFeature } from '../../../core/useFeature';
import { Meter } from '../../../components/shared';
import { ProjectFormModal } from '../ProjectFormModal';

/**
 * The projects card: what is running, and how close each one is to done.
 *
 * Only what is active — a dashboard is about what is on you now, and a shelf
 * of archived projects is the view's business. The footer says so out loud,
 * because a card that counts three while the view counts six and explains
 * neither number is a card you stop trusting.
 */
/** The most the card lists, and what its footer takes from the rows' height. */
const MAX_ROWS = 12;
const FOOT_PX = 40;

export const ProjectsWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const linksOn = useFeature('projects.taskLinks');
    const { app, plugin } = useApp();
    const projects = useZenithStore((s) => s.projects);

    const active = useMemo(
        () =>
            projects
                .filter((p) => p.status === 'active' || p.status === 'in-progress')
                // Soonest first, and anything without a date last: a project
                // with no deadline is not urgent, it is undated.
                .sort((a, b) => {
                    const x = a.stats.daysRemaining;
                    const y = b.stats.daysRemaining;
                    if (x !== undefined && y !== undefined) return x - y;
                    if (x !== undefined) return -1;
                    if (y !== undefined) return 1;
                    return a.title.localeCompare(b.title);
                }),
        [projects]
    );

    const openView = useCallback(() => {
        void plugin.moduleManager.get('projects')?.activateView();
    }, [plugin]);

    const openNote = useCallback(
        (project: Project) => {
            void app.workspace.openLinkText(project.filePath, '', false);
        },
        [app]
    );

    // As many as the card holds: the rows its height leaves over the footer,
    // in two columns where it is wide enough for two. A line running the
    // width of a board has its name at one end and its date at the other.
    const room = useCardRoom();
    const columns = room.width >= ROOM_WIDE ? 2 : 1;
    const rows = Math.min(MAX_ROWS, columns * rowsThatFit(room.height, rowPx(), FOOT_PX));
    const shown = active.slice(0, rows);
    const hidden = active.length - shown.length;

    return (
        <div className="zenith-pw">
            {shown.length === 0 ? (
                <p className="zenith-wempty">
                    <FolderKanban size={14} />
                    {t('projects.widget.empty')}
                </p>
            ) : (
                <ul className="zenith-pw__list">
                    {shown.map((p) => {
                        const due = dueLabel(p, t);
                        return (
                            <li
                                key={p.id}
                                className="zenith-pw__item"
                                role="button"
                                tabIndex={0}
                                title={p.title}
                                onClick={() => openNote(p)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openNote(p);
                                    }
                                }}
                            >
                                {/* One line, in reading order: which project,
                                    when it is due, how far along, how far in
                                    tasks. It was two — a title over a
                                    full-width bar — which made four projects
                                    as tall as eight rows and stacked four
                                    saturated meters down the card. */}
                                <span className="zenith-pw__title">{p.title}</span>
                                {due && (
                                    <span className={`zenith-pw__due ${due.tone}`}>{due.text}</span>
                                )}
                                {/* Progress is counted in tasks, so without
                                    them there is nothing to measure. */}
                                {linksOn && (
                                    <>
                                        <Meter
                                            percent={p.stats.progressPercent}
                                            size="xs"
                                            className="zenith-pw__track"
                                        />
                                        <span className="zenith-pw__count">
                                            {p.stats.totalTasks > 0
                                                ? `${p.stats.completedTasks}/${p.stats.totalTasks}`
                                                : `${p.stats.progressPercent}%`}
                                        </span>
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* It used to read `t('projects.stats.tasks') ? … 'проект' : 'проекта'`
                — a translated string tested for truthiness (it always is) to
                choose between two Russian words hardcoded in the source. Wrong
                for five and up, wrong in every other language, and it never
                said that the number it was counting was the ACTIVE projects
                while the view beside it counted all of them. */}
            <div className="zenith-wfoot">
                <span className="zenith-wfoot__note">
                    {t('projects.summary.active', { count: active.length })}
                </span>
                {/* A project is started thinking about it, not looking at a
                    list of the others — so the form opens from here as well as
                    from the view and the palette. */}
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm"
                    onClick={() => new ProjectFormModal(app, plugin).open()}
                    title={t('projects.new')}
                    aria-label={t('projects.new')}
                >
                    <Plus size={13} />
                </button>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-btn--sm zenith-wfoot__open"
                    onClick={openView}
                    title={t('projects.widget.open')}
                >
                    {hidden > 0 ? t('common.more', { count: hidden }) : t('projects.widget.open')}
                    <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
};
