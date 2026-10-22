import React, { useMemo, useState, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { SearchField } from '../../../components/ui/fields';
import type { Project } from '../../projects/projectsTypes';
import type { GoalNode } from '../services/goalTree';

/**
 * Tie a project under a goal or a stage, as a step that stands for it: the
 * project is chosen from a list, searched by its name.
 *
 * The projects still under way, and none already standing under this node.
 */
export const GoalProjectPicker: FC<{
    node: GoalNode;
    projects: readonly Project[];
    onClose: () => void;
    onPick: (project: Project) => void;
}> = ({ node, projects, onClose, onPick }) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');

    const candidates = useMemo(() => {
        const want = query.trim().toLowerCase();
        const there = new Set(node.children.map((child) => child.project?.filePath).filter(Boolean));
        return projects.filter(
            (project) =>
                project.status !== 'completed' &&
                project.status !== 'archived' &&
                !there.has(project.filePath) &&
                (!want || project.title.toLowerCase().includes(want))
        );
    }, [projects, node, query]);

    return (
        <Modal
            title={t('tasks.goals.projectTitle', { name: node.title })}
            onClose={onClose}
            size="sm"
            className="zenith-goalpick"
        >
            <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('tasks.goals.projectSearch')}
                aria-label={t('tasks.goals.projectSearch')}
            />
            {candidates.length === 0 ? (
                <p className="zenith-goalpick__none">{t('tasks.goals.projectNone')}</p>
            ) : (
                <ul className="zenith-goalpick__list">
                    {candidates.map((project) => (
                        <li key={project.filePath}>
                            <button
                                type="button"
                                className="zenith-goalpick__item"
                                onClick={() => onPick(project)}
                            >
                                <span className="zenith-goalpick__title">{project.title}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
};
