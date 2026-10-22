import type { Task } from '../../../store/taskSlice';
import type { LinkedProject } from '../../tasks/services/goalTree';
import { titleParts } from '../../tasks/services/titleLinks';
import type { Project } from '../projectsTypes';
import { linkNamesProject } from './projectLink';
import { filterTasksForProject } from './projectParser';
import { computeProjectStats } from './projectStats';

/**
 * A project as a step of a goal: a step whose title links to the project's
 * note — `[[Website Redesign]]` — is as far along as the project's own tasks.
 *
 * Built once per tree, and each project's tasks counted once however many
 * steps name it.
 */
export function projectSteps(
    projects: readonly Project[],
    tasks: Task[]
): (title: string) => LinkedProject | undefined {
    if (projects.length === 0) return () => undefined;
    const counted = new Map<string, LinkedProject>();
    const share = (project: Project): LinkedProject => {
        let found = counted.get(project.filePath);
        if (!found) {
            // Counted as the project's own card counts them, so the two agree.
            const stats = computeProjectStats(filterTasksForProject(project, tasks));
            found = {
                title: project.title,
                filePath: project.filePath,
                done: stats.completedTasks,
                total: stats.totalTasks,
            };
            counted.set(project.filePath, found);
        }
        return found;
    };
    return (title) => {
        if (!title.includes('[')) return undefined;
        for (const part of titleParts(title)) {
            if (part.kind !== 'note') continue;
            const project = projects.find((p) => linkNamesProject(part.target, p));
            if (project) return share(project);
        }
        return undefined;
    };
}
