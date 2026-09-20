import type { TaskAttachment } from '../../tasks/services/taskDetails';
import type { Project } from '../projectsTypes';

/**
 * Does this link name this project?
 *
 * One definition, used twice: by `filterTasksForProject`, which asks it of
 * every task in the vault, and by the task editor, which asks it of the task
 * in front of it to find out which project is already chosen. Two copies of
 * this predicate would be two answers to "is this task in that project" the
 * first time either one learned something the other did not.
 *
 * Three spellings count, because all three are how somebody writes a link to
 * a note by hand: the full vault path, the project's title, and the file's
 * own base name. Case is ignored for the same reason Obsidian ignores it.
 */
export function linkNamesProject(target: string, project: Project): boolean {
    const link = target.trim().toLowerCase();
    if (!link) return false;

    const base = project.filePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? '';
    return (
        link === project.filePath.toLowerCase() ||
        link === project.filePath.replace(/\.md$/i, '').toLowerCase() ||
        (!!project.title && link === project.title.toLowerCase()) ||
        (!!base && link === base)
    );
}

/**
 * A task's attachments, split into the project it names and everything else.
 *
 * The editor keeps the two apart while it is open: the project has a field of
 * its own, so listing it a second time among the attachments would be one fact
 * with two controls — and the obvious next step from there is changing it in
 * one of them and saving the other.
 *
 * Only the FIRST project link is taken. A task can match several projects —
 * that follows from the matching rules and is not a bug — but the picker asks
 * a question with one answer, so the rest are left in `rest` untouched rather
 * than silently dropped by a control that cannot represent them.
 */
export function splitProjectLink(
    attachments: TaskAttachment[],
    projects: Project[]
): { project?: Project; rest: TaskAttachment[] } {
    let found: Project | undefined;
    const rest: TaskAttachment[] = [];

    for (const att of attachments) {
        if (att.kind !== 'note') {
            rest.push(att);
            continue;
        }
        const named = found ? undefined : projects.find((p) => linkNamesProject(att.target, p));
        if (named) found = named;
        else rest.push(att);
    }

    return { project: found, rest };
}

/**
 * Put the chosen project back, or leave it out.
 *
 * Takes the attachments `splitProjectLink` kept, so a note the user attached
 * for their own reasons survives a change of project — the only line this
 * rewrites is the one that named a project in the first place.
 *
 * The full path rather than the title: a title can be two words that another
 * note in the vault also uses, and the path is what the note actually is.
 */
export function withProjectLink(rest: TaskAttachment[], project?: Project): TaskAttachment[] {
    if (!project) return [...rest];
    return [...rest, { kind: 'note', target: project.filePath }];
}
