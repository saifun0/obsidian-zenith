import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    navActionLabel,
    navActionDescription,
    navActions,
    runNavAction,
    type NavActionContext,
    type NavActionDefinition,
} from '../src/modules/navigator/navigation';
import { translate, type Translator } from '../src/core/i18n';

/** A `t()` bound to English, as the widget would build it. */
const t = ((key: string) => translate('en', key)) as Translator;

const clearRegistry = () => {
    for (const action of navActions.getSnapshot()) navActions.unregister(action.id);
};

beforeEach(clearRegistry);

describe('nav action registry', () => {
    it('sorts by order, defaulting to 100', () => {
        navActions.register({ id: 'c', label: 'C', order: 200, viewType: 'c' });
        navActions.register({ id: 'a', label: 'A', order: 10, viewType: 'a' });
        navActions.register({ id: 'b', label: 'B', viewType: 'b' });

        expect(navActions.getSnapshot().map((a) => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('refuses an action that cannot do anything', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const dispose = navActions.register({ id: 'dud', label: 'Dud' });

        expect(navActions.getSnapshot()).toEqual([]);
        // The disposer still has to be callable — a module registering a bad
        // action shouldn't throw on the way out.
        expect(() => dispose()).not.toThrow();
        spy.mockRestore();
    });

    it('replaces by id rather than listing a duplicate', () => {
        navActions.register({ id: 'tasks.view', label: 'Old', viewType: 'v' });
        navActions.register({ id: 'tasks.view', label: 'New', viewType: 'v' });

        const snapshot = navActions.getSnapshot();
        expect(snapshot).toHaveLength(1);
        expect(snapshot[0].label).toBe('New');
    });

    it('removes the action when the module disposes it', () => {
        const dispose = navActions.register({ id: 'gone', label: 'Gone', viewType: 'v' });
        dispose();
        expect(navActions.getSnapshot()).toEqual([]);
    });

    it('notifies subscribers on every change', () => {
        const listener = vi.fn();
        const unsubscribe = navActions.subscribe(listener);

        const dispose = navActions.register({ id: 'x', label: 'X', viewType: 'v' });
        dispose();
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        navActions.register({ id: 'y', label: 'Y', viewType: 'v' });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('hands out a snapshot that is stable between changes', () => {
        // useSyncExternalStore re-renders forever if getSnapshot returns a new
        // array each call, so identity has to survive a read.
        navActions.register({ id: 'a', label: 'A', viewType: 'v' });
        expect(navActions.getSnapshot()).toBe(navActions.getSnapshot());
    });
});

describe('nav action labels', () => {
    it('prefers a translation key over the raw label', () => {
        const def: NavActionDefinition = { id: 'tasks.view', label: 'Raw', labelKey: 'nav.tasks' };
        expect(navActionLabel(def, t)).toBe('Tasks');
    });

    it('falls back to the label when the key resolves to nothing', () => {
        // A third-party module may pass a key we have no string for; showing
        // "my.module.key" on the button would read as a bug.
        const def: NavActionDefinition = { id: 'x', label: 'My View', labelKey: 'no.such.key' };
        expect(navActionLabel(def, t)).toBe('My View');
    });

    it('falls back to a readable form of the id when there is no label at all', () => {
        expect(navActionLabel({ id: 'acme.my-view' }, t)).toBe('My view');
    });

    it('resolves descriptions the same way, and reports having none', () => {
        expect(navActionDescription({ id: 'a', descriptionKey: 'nav.tasks.desc' }, t)).toBe(
            'Everything on your plate'
        );
        expect(navActionDescription({ id: 'a', description: 'Plain' }, t)).toBe('Plain');
        expect(navActionDescription({ id: 'a' }, t)).toBeUndefined();
    });
});

// ── runNavAction ─────────────────────────────────────

interface FakeLeaf {
    setViewState: ReturnType<typeof vi.fn>;
}

function fakeContext(existingLeaves: FakeLeaf[] = []) {
    const created: FakeLeaf = { setViewState: vi.fn() };
    const workspace = {
        getLeavesOfType: vi.fn(() => existingLeaves),
        revealLeaf: vi.fn(),
        getLeaf: vi.fn(() => created),
    };
    const ctx = { app: { workspace }, plugin: {} } as unknown as NavActionContext;
    return { ctx, workspace, created };
}

describe('runNavAction', () => {
    it('reveals the leaf that already shows the view', async () => {
        const existing = { setViewState: vi.fn() };
        const { ctx, workspace } = fakeContext([existing]);

        await runNavAction({ id: 'tasks.view', viewType: 'zenith-tasks-view' }, ctx);

        expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
        expect(workspace.getLeaf).not.toHaveBeenCalled();
    });

    it('opens a tab when the view is not open yet', async () => {
        const { ctx, workspace, created } = fakeContext();

        await runNavAction({ id: 'tasks.view', viewType: 'zenith-tasks-view' }, ctx);

        expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
        expect(created.setViewState).toHaveBeenCalledWith({
            type: 'zenith-tasks-view',
            active: true,
        });
    });

    it('always opens a new tab when asked to', async () => {
        const existing = { setViewState: vi.fn() };
        const { ctx, workspace } = fakeContext([existing]);

        await runNavAction({ id: 'tasks.view', viewType: 'zenith-tasks-view' }, ctx, {
            newTab: true,
        });

        expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
        expect(existing.setViewState).not.toHaveBeenCalled();
    });

    it('runs onClick for an action with no view of its own', async () => {
        const { ctx, workspace } = fakeContext();
        const onClick = vi.fn();

        await runNavAction({ id: 'media.picker', onClick }, ctx);

        expect(onClick).toHaveBeenCalledWith(ctx);
        expect(workspace.getLeaf).not.toHaveBeenCalled();
    });

    it('ignores onClick when a view type is given', async () => {
        const { ctx } = fakeContext();
        const onClick = vi.fn();

        await runNavAction({ id: 'both', viewType: 'v', onClick }, ctx);

        expect(onClick).not.toHaveBeenCalled();
    });

    it('contains a failure to open a view', async () => {
        // The widget fires this with `void`, so a rejection here would become
        // an unhandled one rather than a button that quietly did nothing.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { ctx, created } = fakeContext();
        created.setViewState.mockRejectedValue(new Error('no such view'));

        await expect(runNavAction({ id: 'x', viewType: 'v' }, ctx)).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('contains a throwing onClick instead of breaking the dashboard', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { ctx } = fakeContext();

        await expect(
            runNavAction(
                {
                    id: 'bad',
                    onClick: () => {
                        throw new Error('boom');
                    },
                },
                ctx
            )
        ).resolves.toBeUndefined();

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
