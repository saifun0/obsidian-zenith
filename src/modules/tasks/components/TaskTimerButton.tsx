import React, { useEffect, useState, type FC } from 'react';
import { Play, Square } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { TimerService } from '../services/timerService';
import { displayClock, isRunningFor, remainingSeconds } from '../services/taskTimer';

/**
 * Start and stop the timer on one line — a task or a subtask.
 *
 * While it runs the button becomes the clock, because a timer you cannot see is
 * a timer you forget you left going. It ticks every second, which is cheap: only
 * the running row re-renders, and only one row can be running.
 *
 * Which mode it is in comes from the task itself: a line with `⏲ 25m` counts
 * down from twenty-five minutes, one without simply counts up. That is the
 * whole difference between a pomodoro and a stopwatch, and it is a field rather
 * than a second button.
 */

interface TaskTimerButtonProps {
    filePath: string;
    lineNumber: number;
    title: string;
    /** Countdown length from the line, if it has one. */
    timerMinutes?: number;
    /** Smaller inside a subtask row. */
    size?: number;
}

export const TaskTimerButton: FC<TaskTimerButtonProps> = ({
    filePath,
    lineNumber,
    title,
    timerMinutes,
    size = 14,
}) => {
    const t = useTranslation();
    const { app } = useApp();
    const session = useZenithStore((s) => s.settings.activeTimer);
    const running = isRunningFor(session, filePath, lineNumber);

    // One ticker, mounted only on the row that is actually running.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!running) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [running]);

    const toggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const service = new TimerService(app);
        if (running) {
            await service.stopRunning();
            return;
        }
        await service.startFor({ filePath, lineNumber, title, countdownMinutes: timerMinutes });
    };

    if (running && session) {
        const left = remainingSeconds(session, now);
        const over = left !== null && left < 0;
        return (
            <button
                type="button"
                className={`zenith-timer is-running ${over ? 'is-over' : ''}`}
                onClick={toggle}
                title={t('tasks.timer.stop')}
                aria-label={t('tasks.timer.stop')}
            >
                <Square size={size - 3} />
                <span className="zenith-timer__clock">{displayClock(session, now)}</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            className="zenith-timer"
            onClick={toggle}
            title={t('tasks.timer.start')}
            aria-label={t('tasks.timer.start')}
        >
            <Play size={size - 2} />
        </button>
    );
};
