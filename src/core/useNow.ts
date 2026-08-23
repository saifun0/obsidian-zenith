import { useEffect, useState } from 'react';

/**
 * The current time, re-rendering on a fixed cadence.
 *
 * For anything that counts down — hours left on a deadline, minutes to sunset —
 * a value computed once at mount is simply wrong an hour later, and a dashboard
 * widget can stay mounted for days.
 *
 * The first tick is aligned to the next interval boundary, so a minute-ticker
 * fires when the clock's minute actually changes rather than at whatever offset
 * the component happened to mount at. Callers should pick the coarsest interval
 * their display can tolerate: this re-renders the subtree on every tick.
 */
export function useNow(intervalMs = 60_000): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let interval: number | undefined;
        const align = window.setTimeout(
            () => {
                setNow(new Date());
                interval = window.setInterval(() => setNow(new Date()), intervalMs);
            },
            intervalMs - (Date.now() % intervalMs)
        );
        return () => {
            window.clearTimeout(align);
            if (interval !== undefined) window.clearInterval(interval);
        };
    }, [intervalMs]);

    return now;
}
