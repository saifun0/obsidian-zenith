import React, { useMemo, useState, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { SearchField } from '../../../components/ui/fields';
import type { Task } from '../../../store/taskSlice';
import type { GoalNode } from '../services/goalTree';

/** How many tasks the list shows at most; the search is how to reach the rest. */
const LIMIT = 60;

/**
 * Tie an existing task under a goal or a step: the task is chosen from a
 * list, searched by its name.
 *
 * Open tasks only, and none of those that could not be tied: the node itself,
 * and what it is tied to already. A task that is a subtask of something is
 * not listed — it is reached as a step of its parent, which is where it is
 * written.
 */
export const GoalLinkPicker: FC<{
    node: GoalNode;
    tasks: Task[];
    onClose: () => void;
    onPick: (task: Task) => void;
}> = ({ node, tasks, onClose, onPick }) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');

    const candidates = useMemo(() => {
        const want = query.trim().toLowerCase();
        const tied = new Set(node.needs);
        return tasks
            .filter(
                (task) =>
                    task.status !== 'done' &&
                    task.status !== 'cancelled' &&
                    !(task.filePath === node.filePath && task.lineNumber === node.lineNumber) &&
                    !(task.ref && tied.has(task.ref)) &&
                    (!want || task.title.toLowerCase().includes(want))
            )
            .slice(0, LIMIT);
    }, [tasks, node, query]);

    return (
        <Modal
            title={t('tasks.goals.linkTitle', { name: node.title })}
            onClose={onClose}
            size="sm"
            className="zenith-goalpick"
        >
            <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('tasks.goals.linkSearch')}
                aria-label={t('tasks.goals.linkSearch')}
            />
            {candidates.length === 0 ? (
                <p className="zenith-goalpick__none">{t('tasks.goals.linkNone')}</p>
            ) : (
                <ul className="zenith-goalpick__list">
                    {candidates.map((task) => (
                        <li key={task.id}>
                            <button
                                type="button"
                                className="zenith-goalpick__item"
                                onClick={() => onPick(task)}
                            >
                                <span className="zenith-goalpick__title">{task.title}</span>
                                <span className="zenith-goalpick__where">
                                    {task.filePath.replace(/\.md$/i, '').split('/').pop()}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
};
