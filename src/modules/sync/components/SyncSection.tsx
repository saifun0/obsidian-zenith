import React from 'react';
import { Check } from 'lucide-react';

/**
 * One section of the sync record, drawn the way the settings page draws
 * everything else.
 *
 * It used to draw its own box with the heading inside it, in its own grey and
 * its own radius — a shape that made sense when this page was a workspace tab
 * with nothing around it. Inside the settings dialog it reads as foreign: the
 * form above it puts the label ABOVE the card and the card holds only content,
 * and two nearly-matching card shapes on one screen look like a mistake rather
 * than a distinction.
 *
 * So the label and the card are the form's own classes, not lookalikes. Three
 * components were hand-rolling this same skeleton — the record, the conflict
 * inbox and the file panel — so it is one component now as well as one
 * vocabulary.
 *
 * `quiet` keeps the old trick, which is the reason this page is readable at
 * all: a section with nothing to report loses its card and keeps one ticked
 * line, so the sections that DO have something are the ones taking up room.
 */
export const SyncSection: React.FC<{
    title: string;
    /** Shown beside the title instead of the body when nothing happened. */
    quiet?: string;
    /** A control belonging to the heading — "show all 40", and such. */
    actions?: React.ReactNode;
    children?: React.ReactNode;
}> = ({ title, quiet, actions, children }) => (
    <>
        <h3 className="zenith-settings__section-label zenith-sync__sectionHead">
            <span>{title}</span>
            {quiet && (
                <span className="zenith-sync__quiet">
                    <Check size={13} />
                    {quiet}
                </span>
            )}
            {actions}
        </h3>
        {!quiet && <div className="zenith-settings__card zenith-sync__panel">{children}</div>}
    </>
);
