import React, { type FC } from 'react';
import { TaskItem } from './TaskItem';
import { useTranslation } from '../../../core/i18n';
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
 * It holds no drag state of its own: `TaskList` owns a single registry so a row
 * can be dragged from one group into another. The whole group registers as a
 * zone, which is what lets a drop land on a header or in the gaps — and lets an
 * *empty* bucket be a destination at all. An empty bucket is otherwise not
 * rendered; it appears only while a drag that it would accept is in flight.
 */
export const TaskGroup: FC<TaskGroupProps> = ({
    group,
    sortable,
    reorderable,
    droppable,
    zoneActive,
}) => {
    const t = useTranslation();
    const { dragKey, dropTarget, handleProps, registerRow, registerZone } = sortable;
    const empty = group.tasks.length === 0;

    if (empty && !droppable) return null;

    return (
        <div
            ref={registerZone(group.id)}
            className={`zenith-task-group ${zoneActive ? 'is-drop-zone' : ''}`}
        >
            {group.title && (
                <div className="zenith-task-group-header">
                    {group.icon}
                    {group.title}
                </div>
            )}

            {empty ? (
                <div className="zenith-task-group__placeholder">
                    {group.hint ?? t('tasks.drop.here')}
                </div>
            ) : (
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
            )}
        </div>
    );
};
