/** What may be put in order by hand right now. */
export interface ReorderScope {
    /** The tasks themselves. */
    tasks: boolean;
    /** The subtasks under each task. */
    subtasks: boolean;
}

/**
 * What dragging may reorder in the task list.
 *
 * A sort decides the order of the *tasks*, so under one they cannot be dragged:
 * a row dropped somewhere would be sorted straight back. It decides nothing
 * about subtasks — those are never sorted, they stand in the order the file
 * has them under any sort — so they stay draggable. They used to follow the
 * tasks' switch, which meant choosing "by due date" took away the handles of
 * lines the sort does not touch.
 *
 * On a phone both wait to be asked for: there a row swipes, and a handle on
 * every row read as clutter (⋯ → Put in order by hand).
 */
export function reorderScope(opts: {
    /** The drag-and-drop feature is on. */
    dragOn: boolean;
    /** The list is in file order rather than sorted. */
    manualSort: boolean;
    mobile: boolean;
    /** On a phone: reordering has been asked for. */
    reorderMode: boolean;
}): ReorderScope {
    const byHand = opts.dragOn && (!opts.mobile || opts.reorderMode);
    return { tasks: byHand && opts.manualSort, subtasks: byHand };
}
