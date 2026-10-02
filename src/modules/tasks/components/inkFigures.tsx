import React from 'react';

/**
 * A sentence with its numbers set in the planner's italic — "*2* overdue",
 * "*62* of *104* closed". The tasks card and the statistics say their figures
 * this way rather than as big digits over small labels.
 */
export function withFigures(text: string, className = 'zenith-ink-figure'): React.ReactNode[] {
    return text.split(/(\d+(?:[.,]\d+)?%?)/).map((part, i) =>
        /^\d/.test(part) ? (
            <em key={i} className={className}>
                {part}
            </em>
        ) : (
            part
        )
    );
}
