import React, { type FC, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeadProps {
    /**
     * What the page is of — a month, a day, a shelf — not the view's name: the
     * tab above already says "Journal".
     */
    title: ReactNode;
    /**
     * The figures that describe the page, as one quiet line: "27 of the last 30
     * days · streak 5". Each is one fact; the dots between them are put here.
     */
    tally?: ReactNode[];
    /** The marks at the far end — {@link PageHeadButton}s. */
    children?: ReactNode;
}

/**
 * The top of a view, as the top of a page: a title in the planner's hand, one
 * line of figures under it, and a few quiet marks at the far end.
 *
 * It is the head the Tasks view has, for the views that had a glyph, the
 * module's name in bold and a row of bordered buttons.
 */
export const PageHead: FC<PageHeadProps> = ({ title, tally, children }) => {
    const figures = (tally ?? []).filter((item) => item !== null && item !== undefined && item !== false);
    return (
        <header className="zenith-phead">
            <div className="zenith-phead__top">
                <h1 className="zenith-phead__title">{title}</h1>
                {children && <div className="zenith-phead__actions">{children}</div>}
            </div>
            {figures.length > 0 && (
                <p className="zenith-phead__tally">
                    {figures.map((item, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && (
                                <span className="zenith-phead__sep" aria-hidden="true">
                                    ·
                                </span>
                            )}
                            <span className="zenith-phead__figure">{item}</span>
                        </React.Fragment>
                    ))}
                </p>
            )}
        </header>
    );
};

interface PageHeadButtonProps {
    icon: LucideIcon;
    /** What it does — its tooltip and its name for a screen reader. */
    label: string;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    /** For a mark that is a switch: whether it is on. */
    pressed?: boolean;
}

/** One of the marks at the end of a {@link PageHead}. */
export const PageHeadButton: FC<PageHeadButtonProps> = ({
    icon: Icon,
    label,
    onClick,
    disabled,
    pressed,
}) => (
    <button
        type="button"
        className={`zenith-phead__btn${pressed ? ' is-on' : ''}`}
        aria-label={label}
        title={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
    >
        <Icon size={16} />
    </button>
);
