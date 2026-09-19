import React, { type FC, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ViewHeaderProps {
    /** The module's own glyph, in the accent colour. */
    icon?: LucideIcon;
    title: string;
    /**
     * The figures that describe what is below: "6 projects · 3 active". Plain
     * text in a quiet row, never a strip of bordered boxes — those cost ninety
     * pixels above the projects grid to say "6 projects" over six projects.
     */
    caption?: ReactNode;
    /** The buttons, at the far end. */
    children?: ReactNode;
}

/**
 * The top of a module's view.
 *
 * There were five of these, one per module, and they agreed on nothing. The
 * titles measured 1.2, 1.25, 1.4, 1.5 and 1.9rem in three different weights,
 * so moving from Tasks to Projects told the reader, in type, that they had
 * gone somewhere further away than they had. Two headers put their figures in
 * bordered boxes; one had no figures; one put its actions on the left.
 *
 * One shape, one size, one place for each part.
 */
export const ViewHeader: FC<ViewHeaderProps> = ({ icon: Icon, title, caption, children }) => (
    <header className="zenith-vhead">
        <h1 className="zenith-vhead__title">
            {Icon && <Icon size={20} />}
            <span>{title}</span>
        </h1>
        {caption && <div className="zenith-vhead__caption">{caption}</div>}
        {children && <div className="zenith-vhead__actions">{children}</div>}
    </header>
);
