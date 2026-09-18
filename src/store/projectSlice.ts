import type { Project, ProjectStatus } from '../modules/projects/projectsTypes';
import type { ZenithSliceCreator } from './types';

export interface ProjectSlice {
    projects: Project[];
    projectsLoading: boolean;
    projectStatusFilter: ProjectStatus | 'all';
    projectSearchQuery: string;

    setProjects: (projects: Project[]) => void;
    setProjectsLoading: (loading: boolean) => void;
    setProjectStatusFilter: (status: ProjectStatus | 'all') => void;
    setProjectSearchQuery: (query: string) => void;
    replaceProjectForFile: (filePath: string, project: Project | null) => void;
}

export const createProjectSlice: ZenithSliceCreator<ProjectSlice> = (set) => ({
    projects: [],
    projectsLoading: false,
    projectStatusFilter: 'all',
    projectSearchQuery: '',

    setProjects: (projects) => set(() => ({ projects })),
    setProjectsLoading: (loading) => set(() => ({ projectsLoading: loading })),
    setProjectStatusFilter: (status) => set(() => ({ projectStatusFilter: status })),
    setProjectSearchQuery: (query) => set(() => ({ projectSearchQuery: query })),
    replaceProjectForFile: (filePath, project) =>
        set((state) => ({
            projects: [
                ...state.projects.filter((p) => p.filePath !== filePath),
                ...(project ? [project] : []),
            ],
        })),
});
