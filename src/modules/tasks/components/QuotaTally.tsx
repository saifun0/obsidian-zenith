import React, { useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { startOfWeek } from '../../../core/calendarDates';
import { useLongPress } from '../../../core/useLongPress';
import { Popover, usePopover } from '../../../components/shared/Popover';
import type { WeekCount, WeekLog } from '../services/taskDetails';
import type { TaskQuota } from '../services/taskFormat';
import { TaskWriter } from '../services/taskWriter';
import {
    amountTowards,
    formatAmount,
    parseCountChange,
    parseHoursChange,
    weekAmounts,
} from '../services/taskHours';

/** How many weeks before this one the field names. */
const WEEKS_BACK = 4;

/**
 * "7.5/20 h", "3/12", "2/3 ×/wk" with a line under it: how far a task that
 * asks for hours or times has got — this week, for one that asks for so many
 * a week. It is the subtasks' tally, in hours or in times.
 *
 * Hours: a tap opens a field to put time in by hand — an hour and a half as
 * `1,5` or `1h30` — for the hours that were not timed, or to take some off
 * with a minus. Times: a tap is one more, at once, since that is nearly all a
 * count is ever told; a long press, or a right-click, opens the field, for
 * three at once or one too many taken back. Under the field, the week so far
 * and the weeks before.
 *
 * The field is a plain one, not a number pad: a phone's decimal pad has no
 * minus on it.
 */
export const QuotaTally: FC<{
    item: {
        title: string;
        filePath: string;
        lineNumber: number;
        target?: TaskQuota;
        spentMinutes?: number;
        weeks?: WeekLog[];
        tally?: number;
        counts?: WeekCount[];
    };
    /**
     * What counts, when it is more than the line's own — a goal that asks for
     * hours or times counts everything put in under it. What is typed in still
     * goes on the line itself.
     */
    towards?: number;
}> = ({ item, towards }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const weekStart = useZenithStore((s) => s.settings.journalWeekStart);
    const pop = usePopover<HTMLButtonElement>();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const press = useLongPress(
        () => pop.toggle(),
        (e) => {
            e.preventDefault();
            pop.toggle();
        }
    );
    const target = item.target;
    if (!target) return null;

    const count = !!target.count;
    const today = getTodayString();
    const week = startOfWeek(today, weekStart);
    const done = towards ?? amountTowards(item, today, weekStart);
    const share = Math.min(1, done / target.amount);
    const amount = (n: number) => formatAmount(target, n, t.locale);
    const before = weekAmounts(item)
        .filter((w) => w.start < week)
        .slice(-WEEKS_BACK)
        .map((w) => amount(w.amount));
    const kind = count ? 'count' : 'hours';
    // What the field says under it: the week so far and the ones before, or the whole of it.
    const story = target.weekly
        ? [
              count
                  ? t('tasks.count.weekLine', { count: amount(done) })
                  : t('tasks.hours.weekLine', { hours: amount(done) }),
              before.length > 0 && t('tasks.hours.beforeLine', { list: before.join(' · ') }),
          ]
              .filter(Boolean)
              .join(' · ')
        : t(`tasks.${kind}.allLine`, { done: amount(done), target: amount(target.amount) });

    const put = async (change: number | undefined): Promise<boolean> => {
        if (!change || busy) return false;
        setBusy(true);
        try {
            const writer = new TaskWriter(app);
            const ok = count
                ? await writer.addCountInFile(item.filePath, item.lineNumber, change, item.title, week)
                : await writer.addSpentInFile(item.filePath, item.lineNumber, change, item.title, week);
            if (!ok) {
                new Notice(t('tasks.error.update'));
                return false;
            }
            await plugin.dataService.reloadTasks();
            return true;
        } finally {
            setBusy(false);
        }
    };

    const add = async () => {
        if (await put(count ? parseCountChange(text) : parseHoursChange(text))) {
            setText('');
            pop.close();
        }
    };

    // A count's tap is one more; the row under it keeps its own tap and press.
    const countHandlers = count
        ? {
              onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (press.swallowClick()) return;
                  void put(1);
              },
              onPointerDown: (e: React.PointerEvent) => {
                  e.stopPropagation();
                  press.onPointerDown(e);
              },
              onPointerMove: press.onPointerMove,
              onPointerUp: press.onPointerUp,
              onPointerCancel: press.onPointerCancel,
              onContextMenu: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  press.onContextMenu(e);
              },
          }
        : { onClick: pop.toggle };

    return (
        <>
            <button
                {...pop.anchorProps}
                {...countHandlers}
                type="button"
                className={`zenith-tally zenith-hours${count ? ' is-count' : ''}${share >= 1 ? ' is-full' : ''}`}
                title={story}
                aria-label={`${t(count ? 'tasks.count.addOne' : 'tasks.hours.add')} · ${story}`}
                disabled={busy && count}
            >
                {t(target.weekly ? `tasks.${kind}.tallyWeek` : `tasks.${kind}.tally`, {
                    done: amount(done),
                    target: amount(target.amount),
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
                label={t(count ? 'tasks.count.add' : 'tasks.hours.add')}
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
                        placeholder={t(count ? 'tasks.count.placeholder' : 'tasks.hours.placeholder')}
                        aria-label={t(count ? 'tasks.count.add' : 'tasks.hours.add')}
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
