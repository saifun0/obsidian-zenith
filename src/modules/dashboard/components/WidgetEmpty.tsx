import React, { type FC, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCardRoom } from '../cardRoom';

/**
 * What a widget draws when it has nothing to show: one quiet line.
 *
 * Where what is missing is set on the back of the card — a picture not chosen,
 * a note not named, no dates yet — the line is the way there: pressed, it
 * turns the card over. The three dots in the header do the same, but a card
 * that says "choose a picture" and is not the thing to press sends its reader
 * looking for where the choosing is done.
 *
 * `settings` says the back is where the answer is. Without it — nothing to
 * show because there is nothing, not because nothing was set up — the line is
 * only a line.
 */
export const WidgetEmpty: FC<{
    icon?: ReactNode;
    settings?: boolean;
    className?: string;
    children: ReactNode;
}> = ({ icon, settings = false, className = '', children }) => {
    const { openBack } = useCardRoom();
    const cls = `zenith-wempty ${className}`.trim();
    if (settings && openBack) {
        return (
            <button type="button" className={cls} onClick={openBack}>
                {icon}
                <span>{children}</span>
                <ChevronRight size={14} className="zenith-wempty__go" aria-hidden="true" />
            </button>
        );
    }
    return (
        <p className={cls}>
            {icon}
            <span>{children}</span>
        </p>
    );
};
