import React, { type FC } from 'react';
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
    /** Subtasks keep the file's order under any sort, so this outlives it. */
    subtasksReorderable: boolean;
    /** The rows sit under a smart group, which already says the day. */
    grouped: boolean;
    /** This group would accept the row currently being dragged. */
    droppable: boolean;
    /** The pointer is over this group's empty space / header. */
    zoneActive: boolean;
}

/**
 * TaskGroup — one page of the diary, and a drop zone.
 *
 * Its heading is the group's name in the planner's hand with the count in the
 * margin above the dates, and it folds the group away; the list remembers
 * which groups were folded on this device, and what is finished starts folded.
 * It holds no drag state of its own: `TaskList` owns a single registry so a
 * row can be dragged from one group into another. The whole group registers
 * as a zone, which is what lets a drop land on a heading — a folded group's
 * included — and lets an *empty* group be a destination at all.
 */
export const TaskGroup: FC<TaskGroupProps> = ({
    group,
    sortable,
    reorderable,
    subtasksReorderable,
    grouped,
    droppable,
    zoneActive,
}) => {
    const t = useTranslation();
    const closed = useZenithStore((s) => closedGroups(s.settings.taskView).includes(group.id));
    const { dragKey, dropTarget, handleProps, registerRow, registerZone } = sortable;
    const empty = group.items.length === 0;

    if (empty && !droppable) return null;
    // A group without a title is the flat list; it has nothing to fold by.
    const folded = !!group.title && closed && !empty;
    const count = group.items.filter((it) => !it.closing).length;

    return (
        <section
            ref={registerZone(group.id)}
            className={`zenith-tgroup is-${group.bucket ?? 'file'} ${zoneActive ? 'is-drop-zone' : ''}`}
        >
            {group.title && (
                <button
                    type="button"
                    className={`zenith-tgroup__head ${folded ? 'is-folded' : ''}`}
                    aria-expanded={!folded}
                    onClick={() => toggleGroup(group.id)}
                >
                    <span className="zenith-tgroup__count">{count || ''}</span>
                    <span className="zenith-tgroup__title">{group.title}</span>
                    <span className="zenith-tgroup__fold" aria-hidden="true">
                        {folded ? t('tasks.group.show') : ''}
                    </span>
                </button>
            )}

            {empty ? (
                <div className="zenith-tgroup__placeholder">
                    {group.hint ?? t('tasks.drop.here')}
                </div>
            ) : (
                !folded && (
                    <div className="zenith-tgroup__rows">
                        {group.items.map(({ key, task, closing }) => (
                            <TaskItem
                                key={key}
                                task={task}
                                closing={closing}
                                grouped={grouped}
                                rowRef={closing ? undefined : registerRow(task.id)}
                                dragHandleProps={closing ? undefined : handleProps(task.id)}
                                dragging={dragKey === task.id}
                                dropEdge={
                                    !closing &&
                                    dropTarget?.kind === 'row' &&
                                    dropTarget.key === task.id
                                        ? dropTarget.position
                                        : null
                                }
                                reorderable={reorderable && !closing}
                                subtasksReorderable={subtasksReorderable && !closing}
                            />
                        ))}
                    </div>
                )
            )}
        </section>
    );
};
