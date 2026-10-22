import React, { useMemo, type FC } from 'react';
import { Keymap } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { titleParts } from '../services/titleLinks';

/**
 * A task's title with its links drawn as links: the words, in the link
 * colour, and a tap on them opens the note — or the page — rather than the
 * row. Everything else about the row stays the row's: a tap beside the link,
 * a long press, Enter.
 */
export const TaskTitle: FC<{ title: string; sourcePath: string }> = ({ title, sourcePath }) => {
    const { app } = useApp();
    const parts = useMemo(() => titleParts(title), [title]);
    if (parts.every((part) => part.kind === 'text')) return <>{title}</>;

    // The row under the link has its own tap, long press and Enter.
    const keep = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <>
            {parts.map((part, i) => {
                if (part.kind === 'text') return <React.Fragment key={i}>{part.text}</React.Fragment>;
                if (part.kind === 'url') {
                    return (
                        <a
                            key={i}
                            className="zenith-tlink"
                            href={part.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={keep}
                            onPointerDown={keep}
                            onKeyDown={keep}
                        >
                            {part.text}
                        </a>
                    );
                }
                return (
                    <a
                        key={i}
                        className="zenith-tlink"
                        href={part.target}
                        data-href={part.target}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void app.workspace.openLinkText(
                                part.target,
                                sourcePath,
                                Keymap.isModEvent(e.nativeEvent)
                            );
                        }}
                        onPointerDown={keep}
                        onKeyDown={keep}
                    >
                        {part.text}
                    </a>
                );
            })}
        </>
    );
};
