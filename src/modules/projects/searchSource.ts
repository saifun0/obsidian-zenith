import { useZenithStore } from '../../store';
import { translatorNow } from '../../core/i18n';
import type { SearchSource } from '../search/searchSources';
import { ProjectFormModal } from './ProjectFormModal';
import type ZenithPlugin from '../../main';

/**
 * What Search finds of the projects module: the projects under way or paused,
 * each opening its note, and "проект …" to start a new one.
 *
 * A new project opens the form with the name filled in rather than being made
 * at once, as a task is: a project is started about once a fortnight, and the
 * deadline and colour are best set while it is still in mind.
 */
export function projectsSearchSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'projects',
        labelKey: 'module.projects.name',
        icon: 'folder-kanban',
        order: 40,
        items: () => {
            const t = translatorNow();
            return useZenithStore
                .getState()
                .projects.filter((p) => p.status !== 'completed' && p.status !== 'archived')
                .map((project) => ({
                    id: `projects:${project.filePath}`,
                    title: project.title,
                    tags: project.tags,
                    detail: project.status === 'paused' ? t('projects.status.paused') : undefined,
                    icon: project.icon || undefined,
                    run: () => void plugin.app.workspace.openLinkText(project.filePath, '', false),
                }));
        },
        creators: () => [
            {
                keywords: ['проект', 'project'],
                row: (text) => ({
                    title: text,
                    label: translatorNow()('search.create.project'),
                    icon: 'folder-plus',
                    run: () => new ProjectFormModal(plugin.app, plugin, undefined, text).open(),
                }),
            },
        ],
    };
}
