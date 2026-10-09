import React, { type FC } from 'react';
import { ChevronRight, Moon, Sun } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useNow } from '../../../core/useNow';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { RitualModal } from '../RitualModal';
import { FOCUS_KEY, doneToday, ritualFor, todaysTasks } from '../services/rituals';

/**
 * The ritual on the dashboard: the one that fits the hour, and the way into it.
 *
 * Two lines, and the whole card is the button. The upper one names the ritual
 * and counts what it will go through — the tasks ahead in the morning, the
 * ones ticked off by the evening. The lower one is the day's main task, once
 * chosen: it is the thing the morning was for, so it is set as the card's one
 * phrase. Until there is one, the line says what the ritual is instead.
 *
 * It used to be those two lines and a separate button in a card four times
 * their height. The card is the height of what it says now.
 */
export const RitualWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const now = useNow(60_000);
    const tasks = useZenithStore((s) => s.tasks);
    const entries = useZenithStore((s) => s.journalEntries);

    const kind = ritualFor(now.getHours());
    const today = getTodayString();
    const entry = entries.find((e) => e.date === today);
    const focus = entry?.texts?.[FOCUS_KEY];
    const count =
        kind === 'morning'
            ? t.plural('ritual.card.tasks', todaysTasks(tasks, today, entry?.filePath).length)
            : t('ritual.card.done', { count: doneToday(tasks, today).length });

    return (
        <button
            type="button"
            className={`zenith-ritual-card zenith-wmid is-${kind}`}
            onClick={() => new RitualModal(app, plugin, kind).open()}
        >
            <span className="zenith-ritual-card__icon" aria-hidden="true">
                {kind === 'morning' ? <Sun size={18} /> : <Moon size={18} />}
            </span>
            <span className="zenith-ritual-card__text">
                <span className="zenith-wcap">
                    {t(`ritual.${kind}.title`)} · {count}
                </span>
                <span className={`zenith-ritual-card__line${focus ? ' is-focus' : ''}`}>
                    {focus || t(`ritual.${kind}.remind`)}
                </span>
            </span>
            <ChevronRight size={16} className="zenith-ritual-card__go" aria-hidden="true" />
        </button>
    );
};
