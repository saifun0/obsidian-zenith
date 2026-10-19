import { Notice, TFile, normalizePath, type App } from 'obsidian';
import { translatorNow } from '../../../core/i18n';
import type { ZenithSettings } from '../../../store/settingsSlice';
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
    child: Pick<Task, 'ref' | 'filePath' | 'lineNumber' | 'title'>
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

/**
 * Move a step under another node: a step written under its parent is moved
 * in the notes, with everything under it; one tied in from elsewhere is
 * untied and tied again under the new one, and stays where it is written.
 */
export async function moveStep(
    app: App,
    tasks: Task[],
    node: GoalNode,
    parent: GoalNode,
    target: GoalNode
): Promise<boolean> {
    try {
        if (node.via === 'link' && node.ref) {
            if (!(await linkStep(app, tasks, target, node))) return false;
            return await unlinkStep(app, parent, node.ref);
        }
        const ok = await new TaskWriter(app).moveUnderInFile(node, target);
        if (!ok) new Notice(translatorNow()('tasks.error.update'));
        return ok;
    } catch (err) {
        console.error('Zenith: failed to move the step:', err);
        new Notice(translatorNow()('tasks.error.save'));
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

/**
 * The note new goals are written in: the one named in the settings — Goals by
 * default — in the tasks folder. A name and not a path: tasks are read from
 * the tasks folder (and the journal's and the projects'), so a goal written
 * anywhere else would never be seen again.
 */
export function goalsNotePath(
    settings: Pick<ZenithSettings, 'tasksGoalsNote' | 'tasksFolderPath'>
): string {
    const name =
        settings.tasksGoalsNote
            .trim()
            .replace(/^\/+|\/+$/g, '')
            .replace(/\.md$/i, '') || 'Goals';
    const folder = settings.tasksFolderPath.trim().replace(/^\/+|\/+$/g, '');
    return normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
}

/**
 * Write a new goal at the end of the goals' note, making the note — and its
 * folder — if it is not there yet. A goal is there for months; the day's note
 * or the inbox, where tasks go, would bury it.
 */
export async function addGoal(
    app: App,
    settings: Pick<ZenithSettings, 'tasksGoalsNote' | 'tasksFolderPath'>,
    title: string,
    goalTag: string
): Promise<boolean> {
    const path = goalsNotePath(settings);
    try {
        if (!(app.vault.getAbstractFileByPath(path) instanceof TFile)) {
            const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
            if (folder && !app.vault.getAbstractFileByPath(folder)) {
                await app.vault.createFolder(folder);
            }
            await app.vault.create(path, '');
        }
        await new TaskWriter(app).addTask(
            settings.tasksFolderPath,
            { title, priority: 'none', tags: [goalTag.replace(/^#/, '').trim()] },
            { filePath: path }
        );
        return true;
    } catch (err) {
        console.error('Zenith: failed to add the goal:', err);
        new Notice(translatorNow()('notice.taskAddFailed'));
        return false;
    }
}
