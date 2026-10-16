import { Notice, type App } from 'obsidian';
import { translatorNow } from '../../../core/i18n';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from './taskWriter';
import { isGoal, newRef, type GoalNode } from './goalTree';

/**
 * What the goals' tree writes into the notes. Every change is a patch of one
 * line through the task writer, so the rest of the line — its dates, its
 * marks, the way it was written — stays as it was.
 */

/** Tie an existing task under a node: give it a `🆔` if it has none, and name it in the node's `⛔`. */
export async function linkStep(
    app: App,
    tasks: Task[],
    parent: Pick<GoalNode, 'filePath' | 'lineNumber' | 'needs'>,
    child: Task
): Promise<boolean> {
    const t = translatorNow();
    const writer = new TaskWriter(app);
    try {
        let ref = child.ref;
        if (!ref) {
            ref = newRef(tasks);
            const named = await writer.updateTaskInFile(
                child.filePath,
                child.lineNumber,
                { id: ref },
                child.title
            );
            if (!named) {
                new Notice(t('tasks.error.update'));
                return false;
            }
        }
        if (parent.needs.includes(ref)) return true;
        const ok = await writer.updateLineExtras(parent.filePath, parent.lineNumber, {
            dependsOn: [...parent.needs, ref],
        });
        if (!ok) new Notice(t('tasks.error.update'));
        return ok;
    } catch (err) {
        console.error('Zenith: failed to tie the task under its goal:', err);
        new Notice(t('tasks.error.save'));
        return false;
    }
}

/** Take a linked step out from under its node: its id comes out of the node's `⛔`; its own `🆔` stays. */
export async function unlinkStep(
    app: App,
    parent: Pick<GoalNode, 'filePath' | 'lineNumber' | 'needs'>,
    childRef: string
): Promise<boolean> {
    try {
        const ok = await new TaskWriter(app).updateLineExtras(parent.filePath, parent.lineNumber, {
            dependsOn: parent.needs.filter((id) => id !== childRef),
        });
        if (!ok) new Notice(translatorNow()('tasks.error.update'));
        return ok;
    } catch (err) {
        console.error('Zenith: failed to untie the step:', err);
        new Notice(translatorNow()('tasks.error.save'));
        return false;
    }
}

/** Make a task a goal, or stop it being one: the goal tag, on or off its line. */
export async function setGoal(
    app: App,
    task: Task,
    goalTag: string,
    on: boolean
): Promise<boolean> {
    const tag = goalTag.replace(/^#/, '').trim();
    if (!tag || isGoal(task, tag) === on) return true;
    // Every spelling of the tag that makes it a goal comes off, nested ones too.
    const remove = task.tags.filter((have) => isGoal({ tags: [have] }, tag));
    try {
        const ok = await new TaskWriter(app).updateTaskInFile(
            task.filePath,
            task.lineNumber,
            on ? { addTags: [tag] } : { removeTags: remove },
            task.title
        );
        if (!ok) new Notice(translatorNow()('tasks.error.update'));
        return ok;
    } catch (err) {
        console.error('Zenith: failed to change the goal tag:', err);
        new Notice(translatorNow()('tasks.error.save'));
        return false;
    }
}
