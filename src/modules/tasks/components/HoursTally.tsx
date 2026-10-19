import React, { useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { startOfWeek } from '../../../core/calendarDates';
import { Popover, usePopover } from '../../../components/shared/Popover';
import type { WeekLog } from '../services/taskDetails';
import type { HourTarget } from '../services/taskFormat';
import { TaskWriter } from '../services/taskWriter';
import { formatHours, minutesTowards, parseHoursChange } from '../services/taskHours';

/** How many weeks before this one the field names. */
const WEEKS_BACK = 4;

/**
 * "7.5/20 h" with a line under it: how far a task that asks for hours has got
 * — this week, for one that asks for so many a week. It is the subtasks'
 * tally, in hours. A tap opens a field to put time in by hand — an hour and a
 * half as `1,5` or `1h30` — for the hours that were not timed, or to take
 * some off with a minus; under it, the week so far and the weeks before.
 *
 * The field is a plain one, not a number pad: a phone's decimal pad has no
 * minus on it.
 */
export const HoursTally: FC<{
    item: {
        title: string;
        filePath: string;
        lineNumber: number;
        target?: HourTarget;
        spentMinutes?: number;
        weeks?: WeekLog[];
    };
    /**
     * The minutes that count, when they are more than the line's own — a goal
     * that asks for hours counts everything put in under it. Time typed in
     * still goes on the line itself.
     */
    towards?: number;
}> = ({ item, towards }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const pop = usePopover<HTMLButtonElement>();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const target = item.target;
    if (!target) return null;

    const today = getTodayString();
    const week = startOfWeek(today, weekStart);
    const done = towards ?? minutesTowards(item, today, weekStart);
    const share = Math.min(1, done / target.minutes);
    const hours = (minutes: number) => formatHours(minutes, t.locale);
    const before = (item.weeks ?? [])
        .filter((w) => w.start < week)
        .slice(-WEEKS_BACK)
        .map((w) => hours(w.minutes));
    // What the field says under it: the week so far and the ones before, or the hours in all.
    const story = target.weekly
        ? [
              t('tasks.hours.weekLine', { hours: hours(done) }),
              before.length > 0 && t('tasks.hours.beforeLine', { list: before.join(' · ') }),
          ]
              .filter(Boolean)
              .join(' · ')
        : t('tasks.hours.allLine', { done: hours(done), target: hours(target.minutes) });

    const add = async () => {
        const minutes = parseHoursChange(text);
        if (!minutes || busy) return;
        setBusy(true);
        try {
            const ok = await new TaskWriter(app).addSpentInFile(
                item.filePath,
                item.lineNumber,
                minutes,
                item.title,
                week
            );
            if (!ok) {
                new Notice(t('tasks.error.update'));
                return;
            }
            setText('');
            pop.close();
            await plugin.dataService.reloadTasks();
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                {...pop.anchorProps}
                type="button"
                className={`zenith-tally zenith-hours${share >= 1 ? ' is-full' : ''}`}
                title={story}
                aria-label={`${t('tasks.hours.add')} · ${story}`}
                onClick={pop.toggle}
            >
                {t(target.weekly ? 'tasks.hours.tallyWeek' : 'tasks.hours.tally', {
                    done: hours(done),
                    target: hours(target.minutes),
                })}
                <span className="zenith-tally__line" aria-hidden="true">
                    <i style={{ width: `${share * 100}%` }} />
                </span>
            </button>
            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={240}
                height={76}
                align="end"
                role="dialog"
                label={t('tasks.hours.add')}
                className="zenith-hours__pop"
            >
                {/* The popover is portalled, but React still bubbles through
                    it: the row under the tally opens its editor on a click. */}
                <div
                    className="zenith-hours__field"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <input
                        className="zenith-hours__input"
                        value={text}
                        placeholder={t('tasks.hours.placeholder')}
                        aria-label={t('tasks.hours.add')}
                        enterKeyHint="done"
                        autoFocus
                        disabled={busy}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void add();
                            } else if (e.key === 'Escape') {
                                pop.close();
                            }
                        }}
                    />
                    <p className="zenith-hours__story">{story}</p>
                </div>
            </Popover>
        </>
    );
};
