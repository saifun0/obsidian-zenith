import React, { type FC } from 'react';
import { Moon, Star, Sun } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useNow } from '../../../core/useNow';
import { useZenithStore } from '../../../store';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { RitualModal } from '../RitualModal';
import { FOCUS_KEY, ritualFor, todaysTasks } from '../services/rituals';

/**
 * The ritual on the dashboard: the one that fits the hour, a line of what it
 * is about, and the way into it. The day's main task, once chosen, is the
 * line — it is the thing the morning was for.
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
    const count = todaysTasks(tasks, today, entry?.filePath).length;

    return (
        <div className="zenith-ritual-card">
            <span className="zenith-ritual-card__icon">
                {kind === 'morning' ? <Sun size={18} /> : <Moon size={18} />}
            </span>
            <span className="zenith-ritual-card__text">
                <span className="zenith-ritual-card__title">{t(`ritual.${kind}.title`)}</span>
                <span className="zenith-ritual-card__line">
                    {focus ? (
                        <>
                            <Star size={12} /> {focus}
                        </>
                    ) : (
                        t.plural('ritual.card.tasks', count)
                    )}
                </span>
            </span>
            <button
                type="button"
                className="zenith-ritual-card__open"
                onClick={() => new RitualModal(app, plugin, kind).open()}
            >
                {t('ritual.card.open')}
            </button>
        </div>
    );
};
