import { describe, it, expect } from 'vitest';
import { reorderScope } from '../src/modules/tasks/services/reorderScope';

/**
 * What may be dragged in the task list.
 *
 * A sort orders the tasks and nothing else: subtasks keep the file's order
 * under any of them, so they keep their handles.
 */

const desktop = { dragOn: true, mobile: false, reorderMode: false };
const phone = { dragOn: true, mobile: true, reorderMode: false };

describe('reorderScope', () => {
    it('lets both be dragged in file order', () => {
        expect(reorderScope({ ...desktop, manualSort: true })).toEqual({
            tasks: true,
            subtasks: true,
        });
    });

    it('keeps subtasks draggable under a sort, which only orders the tasks', () => {
        expect(reorderScope({ ...desktop, manualSort: false })).toEqual({
            tasks: false,
            subtasks: true,
        });
    });

    it('waits to be asked for on a phone', () => {
        expect(reorderScope({ ...phone, manualSort: true })).toEqual({
            tasks: false,
            subtasks: false,
        });
        expect(reorderScope({ ...phone, manualSort: true, reorderMode: true })).toEqual({
            tasks: true,
            subtasks: true,
        });
    });

    it('offers a phone the subtasks alone while the list is sorted', () => {
        expect(reorderScope({ ...phone, manualSort: false, reorderMode: true })).toEqual({
            tasks: false,
            subtasks: true,
        });
    });

    it('is nothing at all with the feature off', () => {
        expect(reorderScope({ ...desktop, dragOn: false, manualSort: true })).toEqual({
            tasks: false,
            subtasks: false,
        });
    });
});
