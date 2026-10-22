import React, { useMemo, type FC } from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { getTodayString } from '../../../core/dateUtils';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { WidgetEmpty } from '../../dashboard/components/WidgetEmpty';
import { buildGoals, habitsUnder, type GoalNode } from '../services/goalTree';
import { marginText } from '../services/taskMargin';
import { askForGoals } from '../services/taskViewState';
import { quotaShown } from '../services/taskHours';
import { QuotaTally } from './QuotaTally';
import { projectSteps } from '../../projects/services/projectGoals';

/** How many goals each preset shows; the rest are a tap away, in the tree. */
const SHOWN = { sm: 2, md: 3, lg: 5 } as const;

/**
 * The goals on the dashboard: each open one by name, with a line for how far
 * along it is, what is next, and the week's hours of its habits — which can
 * be put in from here, the way they can in the tree. A tap on a goal opens
 * the tree. The card is what keeps the goals in sight from day to day.
 */
export const GoalsWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const { plugin } = useApp();
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const goalTag = useZenithStore((s) => s.settings.tasksGoalTag);
    const timerOn = useFeature('tasks.timer');
    const projects = useZenithStore((s) => s.projects);
    const goals = useMemo(
        () =>
            buildGoals(tasks, goalTag, projectSteps(projects, tasks)).filter(
                (goal) => goal.status !== 'done' && goal.status !== 'cancelled'
            ),
        [tasks, goalTag, projects]
    );

    const open = () => {
        askForGoals();
        void plugin.moduleManager.get('tasks')?.activateView();
    };

    if (goals.length === 0) return <WidgetEmpty>{t('tasks.goals.empty')}</WidgetEmpty>;

    const shown = goals.slice(0, SHOWN[size]);
    const hidden = goals.length - shown.length;

    return (
        <div className="zenith-gw">
            <ul className="zenith-wlist zenith-gw__list">
                {shown.map((goal) => (
                    <GoalLine key={goal.key} goal={goal} timerOn={timerOn} onOpen={open} />
                ))}
            </ul>
            <button type="button" className="zenith-gw__all zenith-wsink" onClick={open}>
                {hidden > 0
                    ? t('tasks.widget.moreN', { count: hidden })
                    : `${t('tasks.goals.all')} →`}
            </button>
        </div>
    );
};

/** One goal on the card. */
const GoalLine: FC<{ goal: GoalNode; timerOn: boolean; onOpen: () => void }> = ({
    goal,
    timerOn,
    onOpen,
}) => {
    const t = useTranslation();
    const when = goal.task?.dueDate ? marginText(goal.task, getTodayString(), t, false) : null;
    const habits = habitsUnder(goal).filter((habit) => quotaShown(habit.target, timerOn));
    const measured = goal.children.length > 0 || (!!goal.target && !goal.target.weekly);

    return (
        <li className="zenith-gw__goal">
            <button type="button" className="zenith-gw__head" onClick={onOpen}>
                <span className="zenith-gw__name">{goal.title}</span>
                {when?.text && (
                    <span className={`zenith-gw__when is-${when.tone}`}>{when.text}</span>
                )}
            </button>
            {measured && (
                <span
                    className="zenith-wbar zenith-gw__bar"
                    style={{ ['--zenith-wbar' as string]: `${goal.progress * 100}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(goal.progress * 100)}
                >
                    <span className="zenith-wbar__fill" />
                </span>
            )}
            {goal.next && (
                <span className="zenith-wcap zenith-wcap--faint zenith-gw__next">
                    {t('tasks.goals.nextIs', { name: goal.next.title })}
                </span>
            )}
            {habits.map((habit) => (
                <span key={habit.key} className="zenith-gw__habit">
                    <span className="zenith-wcap">{habit.title}</span>
                    <QuotaTally item={habit} />
                </span>
            ))}
        </li>
    );
};
