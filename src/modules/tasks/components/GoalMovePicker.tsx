import React, { useMemo, useState, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { SearchField } from '../../../components/ui/fields';
import type { GoalNode } from '../services/goalTree';

/** How many places the list shows at most; the search is how to reach the rest. */
const LIMIT = 80;

interface Place {
    node: GoalNode;
    depth: number;
    /** The goal it is in, for a step's name that says little on its own. */
    goal: string;
}

/**
 * Where a step goes when it is moved: a goal, or any step in one, picked from
 * the tree as it stands — indented the way the tree is — or searched by name.
 *
 * Not the step itself or anything under it — nothing goes under itself — and
 * not where it already is.
 */
export const GoalMovePicker: FC<{
    node: GoalNode;
    parent: GoalNode;
    goals: GoalNode[];
    onClose: () => void;
    onPick: (target: GoalNode) => void;
}> = ({ node, parent, goals, onClose, onPick }) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');

    const places = useMemo(() => {
        const out: Place[] = [];
        const walk = (nodes: GoalNode[], depth: number, goal: string) => {
            for (const place of nodes) {
                // The step and what hangs under it stay out of the list.
                if (place.key === node.key) continue;
                out.push({ node: place, depth, goal });
                walk(place.children, depth + 1, goal);
            }
        };
        for (const goal of goals) {
            if (goal.status === 'done' || goal.status === 'cancelled') continue;
            out.push({ node: goal, depth: 0, goal: goal.title });
            walk(goal.children, 1, goal.title);
        }
        const want = query.trim().toLowerCase();
        return out
            .filter(
                (p) =>
                    p.node.key !== parent.key &&
                    // A step without steps of its own can take one, but a
                    // closed one is not where anything is going.
                    p.node.status !== 'done' &&
                    p.node.status !== 'cancelled' &&
                    (!want || p.node.title.toLowerCase().includes(want))
            )
            .slice(0, LIMIT);
    }, [goals, node, parent, query]);

    return (
        <Modal
            title={t('tasks.goals.moveTitle', { name: node.title })}
            onClose={onClose}
            size="sm"
            className="zenith-goalpick"
        >
            <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('tasks.goals.moveSearch')}
                aria-label={t('tasks.goals.moveSearch')}
            />
            {places.length === 0 ? (
                <p className="zenith-goalpick__none">{t('tasks.goals.moveNone')}</p>
            ) : (
                <ul className="zenith-goalpick__list">
                    {places.map((p) => (
                        <li key={p.node.key}>
                            <button
                                type="button"
                                className={`zenith-goalpick__item${p.depth === 0 ? ' is-goal' : ''}`}
                                style={{ paddingLeft: `${4 + (query ? 0 : p.depth) * 16}px` }}
                                onClick={() => onPick(p.node)}
                            >
                                <span className="zenith-goalpick__title">{p.node.title}</span>
                                {/* Searched, the tree's shape is gone: the goal says where. */}
                                {query && p.depth > 0 && (
                                    <span className="zenith-goalpick__where">{p.goal}</span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
};
