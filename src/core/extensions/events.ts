import type { Task } from '../../store/taskSlice';
import type { JournalEntry } from '../../store/journalSlice';

/**
 * What happened, for modules that want to react to it: a task created or
 * completed, a day's record changed. Read-only — an event carries a copy of
 * what changed, and acting on it goes through the same writers as anything
 * else.
 *
 * Derived from the notes rather than from Zenith's own buttons, so a task
 * ticked in the editor, by another plugin or on another device counts the
 * same as one ticked in the task list. The cost is that identity is a guess:
 * a task has no id of its own (its line number moves whenever a line above it
 * does), so a task is "the same" when its note and its title are. Renaming a
 * task reads as a new one — which, for a module listening, it more or less is.
 */

export interface ZenithEvents {
    'task:created': { task: Task };
    'task:completed': { task: Task };
    'journal:recorded': { date: string; keys: string[]; entry: JournalEntry };
}
export type ZenithEventName = keyof ZenithEvents;
export const EVENT_NAMES: readonly ZenithEventName[] = [
    'task:created',
    'task:completed',
    'journal:recorded',
];

export type ZenithEvent = {
    [K in ZenithEventName]: { name: K; payload: ZenithEvents[K] };
}[ZenithEventName];

const taskKey = (task: Task) => `${task.filePath}\u0000${task.title}`;

/** Tasks that appeared, and tasks that became done, between two lists. */
export function taskEvents(before: readonly Task[], after: readonly Task[]): ZenithEvent[] {
    const was = new Map<string, Task[]>();
    for (const task of before) {
        const key = taskKey(task);
        was.set(key, [...(was.get(key) ?? []), task]);
    }
    const out: ZenithEvent[] = [];
    const seen = new Map<string, number>();
    for (const task of after) {
        const key = taskKey(task);
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        // The n-th task with this note and title is matched to the n-th one
        // before: a list of three identical "Call mum" lines stays three.
        const previous = was.get(key)?.[index];
        if (!previous) {
            out.push({ name: 'task:created', payload: { task } });
            if (task.status === 'done') out.push({ name: 'task:completed', payload: { task } });
        } else if (task.status === 'done' && previous.status !== 'done') {
            out.push({ name: 'task:completed', payload: { task } });
        }
    }
    return out;
}

function recordKeys(entry: JournalEntry): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, value] of Object.entries(entry.values)) out.set(key, JSON.stringify(value));
    for (const [key, value] of Object.entries(entry.texts ?? {}))
        out.set(key, JSON.stringify(value));
    return out;
}

/** Days whose recorded values changed — added, altered or cleared — and which keys. */
export function journalEvents(
    before: readonly JournalEntry[],
    after: readonly JournalEntry[]
): ZenithEvent[] {
    const was = new Map(before.map((e) => [e.date, e]));
    const out: ZenithEvent[] = [];
    for (const entry of after) {
        const previous = was.get(entry.date);
        const now = recordKeys(entry);
        const then = previous ? recordKeys(previous) : new Map<string, string>();
        const keys = [...new Set([...now.keys(), ...then.keys()])]
            .filter((key) => now.get(key) !== then.get(key))
            .sort();
        if (keys.length)
            out.push({ name: 'journal:recorded', payload: { date: entry.date, keys, entry } });
    }
    return out;
}

type Handler<K extends ZenithEventName> = (payload: ZenithEvents[K]) => void;

/** Who is listening to what, by module — so a module's listeners go with it. */
export class EventBus {
    private readonly handlers = new Map<
        ZenithEventName,
        Set<{ moduleId: string; fn: Handler<never> }>
    >();

    on<K extends ZenithEventName>(moduleId: string, name: K, fn: Handler<K>): () => void {
        const set = this.handlers.get(name) ?? new Set();
        const entry = { moduleId, fn: fn as Handler<never> };
        set.add(entry);
        this.handlers.set(name, set);
        return () => set.delete(entry);
    }

    /** Deliver to every listener; one that throws is reported, the rest still hear it. */
    emit(event: ZenithEvent, onError: (moduleId: string, error: unknown) => void): void {
        for (const { moduleId, fn } of this.handlers.get(event.name) ?? []) {
            try {
                fn(event.payload as never);
            } catch (error) {
                onError(moduleId, error);
            }
        }
    }

    removeModule(moduleId: string): void {
        for (const set of this.handlers.values()) {
            for (const entry of set) if (entry.moduleId === moduleId) set.delete(entry);
        }
    }

    listening(name: ZenithEventName): boolean {
        return (this.handlers.get(name)?.size ?? 0) > 0;
    }
}

export const eventBus = new EventBus();
