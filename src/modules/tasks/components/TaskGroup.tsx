import React, { type FC } from 'react';
import { ChevronRight } from 'lucide-react';
import { TaskItem } from './TaskItem';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { closedGroups, toggleGroup } from '../services/taskViewState';
import type { SortableApi } from './useSortableRows';
import type { TaskListGroup } from './TaskList';

interface TaskGroupProps {
    group: TaskListGroup;
    sortable: SortableApi;
    /** False when the current sort derives the order, so dragging is off. */
    reorderable: boolean;
    /** This group would accept the row currently being dragged. */
    droppable: boolean;
    /** The pointer is over this group's empty space / header. */
    zoneActive: boolean;
}

/**
 * TaskGroup — one bucket of the task list, and a drop zone.
 *
 * Its header folds it away, and the list remembers which groups were folded on
 * this device; what is finished starts folded, as a count. It holds no drag
 * state of its own: `TaskList` owns a single registry so a row can be dragged
 * from one group into another. The whole group registers as a zone, which is
 * what lets a drop land on a header — a folded group's included — and lets an
 * *empty* bucket be a destination at all.
 */
export const TaskGroup: FC<TaskGroupProps> = ({ group, sortable, reorderable, droppable, zoneActive }) => {
    const t = useTranslation();
    const closed = useZenithStore((s) => closedGroups(s.settings.taskView).includes(group.id));
    const { dragKey, dropTarget, handleProps, registerRow, registerZone } = sortable;
    const empty = group.tasks.length === 0;

    if (empty && !droppable) return null;
    // A group without a title is the flat list; it has nothing to fold by.
    const folded = !!group.title && closed && !empty;

    return (
        <div ref={registerZone(group.id)} className={`zenith-task-group ${zoneActive ? 'is-drop-zone' : ''}`}>
            {group.title && (
                <button
                    type="button"
                    className={`zenith-task-group-header ${folded ? '' : 'is-open'}`}
                    aria-expanded={!folded}
                    onClick={() => toggleGroup(group.id)}
                >
                    <ChevronRight size={14} className="zenith-task-group-header__chevron" />
                    {group.icon}
                    <span className="zenith-task-group-header__title">{group.title}</span>
                    <span className="zenith-task-group-header__count">{group.tasks.length}</span>
                </button>
            )}

            {empty ? (
                <div className="zenith-task-group__placeholder">{group.hint ?? t('tasks.drop.here')}</div>
            ) : (
                !folded && (
                    <div className="zenith-task-list">
                        {group.tasks.map((task) => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                rowRef={registerRow(task.id)}
                                dragHandleProps={handleProps(task.id)}
                                dragging={dragKey === task.id}
                                dropEdge={
                                    dropTarget?.kind === 'row' && dropTarget.key === task.id
                                        ? dropTarget.position
                                        : null
                                }
                                reorderable={reorderable}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    );
};
