import React, { type FC } from 'react';
import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { Meter, Popover, usePopover } from '../../../components/shared';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '../projectsTypes';
import { dueLabel, startLabel } from '../services/projectStats';
import { TaskStatusControl } from '../../tasks/components/taskStatusUi';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';

/** Priorities worth a word on the card. The other three are the ordinary case. */
const LOUD_PRIORITIES = new Set(['urgent', 'high']);

const MENU_WIDTH = 210;
const MENU_HEIGHT = 240;

export interface ProjectCardProps {
    project: Project;
    tasks: Task[];
    expanded?: boolean;
    onToggleTasks?: () => void;
    onOpenNote?: () => void;
    onEdit?: () => void;
    onStatus?: (status: ProjectStatus) => void;
    onAddTask?: () => void;
    onTaskStatus?: (task: Task, next: TaskStatus) => void;
    /**
     * Drawn as an example of itself, inside the form.
     *
     * The same component rather than a second one that resembles it: the form
     * exists to choose an icon and a colour, and neither choice can be judged
     * from the words `truck` and `#ef4444` sitting in two text fields. A
     * lookalike preview would start lying the first time the real card changed.
     */
    preview?: boolean;
    /**
     * Draw the tasks: the meter, the count and the list. Off when projects
     * are not linked to tasks at all — progress is counted in tasks, so there
     * would be nothing to measure.
     */
    showTasks?: boolean;
}

/**
 * One project.
 *
 * Lifted out of `ProjectsApp`, where it was ninety lines of JSX inside a
 * `.map()`, for two reasons that arrived together: it needed a menu of its
 * own, and the form needed to draw one as a preview.
 *
 * Four fields the note has always carried are finally on it. `icon`, `color`,
 * `description` and `startDate` were parsed, typed and stored, and rendered by
 * nothing — every project in a real vault had them filled in and the interface
 * showed none of it. The colour arrives as a custom property, so the stripe
 * and the icon tint are one decision in one place; the description is clamped
 * to a line because it is a subtitle, not prose; and the start date shows only
 * while the project has not started, which is the only time it says anything.
 */
export const ProjectCard: FC<ProjectCardProps> = ({
    project,
    tasks,
    expanded = false,
    onToggleTasks,
    onOpenNote,
    onEdit,
    onStatus,
    onAddTask,
    onTaskStatus,
    preview = false,
    showTasks = true,
}) => {
    const t = useTranslation();

    const due = dueLabel(project, t);
    const starts = startLabel(project, t);
    const loud = LOUD_PRIORITIES.has(project.priority);

    return (
        <article
            className={`zenith-project-card${preview ? ' is-preview' : ''}`}
            // Undefined rather than an empty string: an unset custom property
            // falls through to the stylesheet's own default, an empty one
            // resolves to nothing and takes the stripe with it.
            style={
                project.color
                    ? ({ '--project-color': project.color } as React.CSSProperties)
                    : undefined
            }
        >
            <div className="zenith-project-card__top">
                {project.icon && (
                    <DynamicIcon
                        name={project.icon}
                        size={16}
                        className="zenith-project-card__icon"
                    />
                )}

                {preview ? (
                    <span className="zenith-project-card__title">{project.title}</span>
                ) : (
                    <a
                        className="zenith-project-card__title"
                        href="#"
                        title={t('projects.card.openNote')}
                        onClick={(e) => {
                            e.preventDefault();
                            onOpenNote?.();
                        }}
                    >
                        {project.title}
                    </a>
                )}

                {due && <span className={`zenith-project-due ${due.tone}`}>{due.text}</span>}

                {!preview && (
                    <ProjectMenu
                        project={project}
                        onEdit={onEdit}
                        onOpenNote={onOpenNote}
                        onStatus={onStatus}
                    />
                )}
            </div>

            {project.description && (
                <p className="zenith-project-card__desc">{project.description}</p>
            )}

            <div className="zenith-project-card__meta">
                <span className={`zenith-project-state zenith-project-state--${project.status}`}>
                    {t(`projects.state.${project.status}`)}
                </span>
                {loud && (
                    <span
                        className={`zenith-project-prio zenith-project-prio--${project.priority}`}
                    >
                        {t(`priority.${project.priority}`)}
                    </span>
                )}
                {starts && <span className="zenith-project-card__starts">{starts}</span>}
                {project.tags.map((tag) => (
                    <span key={tag} className="zenith-project-tag">
                        #{tag}
                    </span>
                ))}
            </div>

            {showTasks && (
                <div className="zenith-project-card__meter">
                    <Meter percent={project.stats.progressPercent} />
                    <span className="zenith-project-card__count">
                        {project.stats.completedTasks} / {project.stats.totalTasks}
                    </span>
                </div>
            )}

            {!preview && showTasks && (
                <div className="zenith-project-card__tasks">
                    <div className="zenith-project-card__tasksHead">
                        {tasks.length > 0 ? (
                            <button
                                type="button"
                                className={`zenith-project-card__toggle ${expanded ? 'is-open' : ''}`}
                                aria-expanded={expanded}
                                onClick={onToggleTasks}
                            >
                                <ChevronDown size={13} />
                                {t('projects.card.tasksN', { count: tasks.length })}
                            </button>
                        ) : (
                            <span className="zenith-project-card__noTasks">
                                {t('projects.tasks.noTasks')}
                            </span>
                        )}
                        {/* Beside the count rather than up in the header. The
                            header's one control is the title, which opens the
                            note; a second thing to press next to it turns
                            "open this project" into a choice. */}
                        <button
                            type="button"
                            className="zenith-project-card__add"
                            onClick={onAddTask}
                            title={t('projects.card.addTask')}
                            aria-label={t('projects.card.addTask')}
                        >
                            <Plus size={13} />
                        </button>
                    </div>

                    {expanded && tasks.length > 0 && (
                        <ul className="zenith-project-card__task-list">
                            {tasks.map((task) => (
                                <li
                                    key={task.id}
                                    className={`zenith-project-task-item ${task.status === 'done' ? 'is-done' : ''}`}
                                >
                                    {/* The same control the tasks module draws,
                                        menu and all, so one glyph means one
                                        thing everywhere and one click does. */}
                                    <TaskStatusControl
                                        status={task.status}
                                        size={15}
                                        onChange={(next) => onTaskStatus?.(task, next)}
                                    />
                                    <span className="zenith-project-task-text">{task.title}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </article>
    );
};

/**
 * Everything the card can do that is not "open me".
 *
 * A menu rather than a row of icons, because the list is already four items
 * long and half of them are words. A menu rather than a hover affordance,
 * because this view opens on a phone too and there is no hover there; a menu
 * rather than a right-click, because nothing on screen would say so.
 *
 * Deleting is deliberately absent. A project is a note, notes are deleted in
 * the file tree, and that path already has a trash setting and a confirmation
 * the user chose. A second route to an irreversible act, in a card, to save
 * two clicks, is not a bargain.
 */
const ProjectMenu: FC<{
    project: Project;
    onEdit?: () => void;
    onOpenNote?: () => void;
    onStatus?: (status: ProjectStatus) => void;
}> = ({ project, onEdit, onOpenNote, onStatus }) => {
    const t = useTranslation();
    const menu = usePopover();

    return (
        <>
            <button
                {...menu.anchorProps}
                type="button"
                className="zenith-project-card__menu"
                onClick={menu.toggle}
                aria-label={t('projects.menu.label')}
                title={t('projects.menu.label')}
            >
                <MoreHorizontal size={16} />
            </button>
            <Popover
                anchor={menu.anchor}
                open={menu.open}
                onClose={menu.close}
                width={MENU_WIDTH}
                height={MENU_HEIGHT}
                align="end"
                label={t('projects.menu.label')}
            >
                <button
                    type="button"
                    role="menuitem"
                    className="zenith-pop__item"
                    onClick={() => {
                        menu.close();
                        onEdit?.();
                    }}
                >
                    {t('projects.menu.edit')}
                </button>
                <button
                    type="button"
                    role="menuitem"
                    className="zenith-pop__item"
                    onClick={() => {
                        menu.close();
                        onOpenNote?.();
                    }}
                >
                    {t('projects.menu.open')}
                </button>

                {/* The status changes far more often than anything else about
                    a project — every project ends by becoming one of these —
                    and a form is too many steps for saying "done". Archiving
                    is on this list rather than beside it for the same reason
                    it does not move the file: it is a status and nothing more,
                    and moving the note would break the wikilinks that make its
                    tasks its own. */}
                <div className="zenith-pop__label">{t('projects.menu.status')}</div>
                {PROJECT_STATUSES.map((s) => (
                    <button
                        key={s}
                        type="button"
                        role="menuitem"
                        className={`zenith-pop__item${s === project.status ? ' is-active' : ''}`}
                        onClick={() => {
                            menu.close();
                            onStatus?.(s);
                        }}
                    >
                        <span className={`zenith-project-state zenith-project-state--${s}`}>
                            {t(`projects.state.${s}`)}
                        </span>
                    </button>
                ))}
            </Popover>
        </>
    );
};
