import React, { useEffect, useRef, type FC } from 'react';
import { Component, Keymap, MarkdownRenderer } from 'obsidian';
import { useApp } from '../../../context/AppContext';

interface MarkdownProps {
    markdown: string;
    /** The note the text comes from, so its relative links and embeds resolve. */
    sourcePath: string;
    className?: string;
}

/**
 * Markdown drawn the way a note in reading view draws it — by Obsidian, so a
 * link, a list and a callout look here as they do everywhere else in the
 * vault, in whatever theme is on.
 *
 * Each render goes into an element of its own. Obsidian's renderer is
 * asynchronous and writes into the element it was given whenever it is done;
 * a second render started before the first had finished would otherwise leave
 * both texts in the card. The element of a render that was overtaken is
 * simply no longer in the page.
 */
export const Markdown: FC<MarkdownProps> = ({ markdown, sourcePath, className = '' }) => {
    const { app } = useApp();
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = host.current;
        if (!el) return;

        const box = el.createDiv({ cls: 'markdown-rendered zenith-md__body' });
        // What the renderer makes — an embed, a code block — lives as long as
        // this does, and is let go with it.
        const lifetime = new Component();
        lifetime.load();
        void MarkdownRenderer.render(app, markdown, box, sourcePath, lifetime).catch((err) => {
            console.error('Zenith: could not draw the text of a card:', err);
        });

        return () => {
            lifetime.unload();
            box.remove();
        };
    }, [app, markdown, sourcePath]);

    /* Links are the one thing in the text that does something. Obsidian wires
       them up in a note; here it only draws them, so a click is read off the
       element: a link into the vault opens the way a click in a note would —
       in a new tab with the modifier held — and everything that is not a link
       out to the web stays where it is. */
    const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const link = (e.target as HTMLElement).closest('a');
        if (!link || !host.current?.contains(link)) return;
        if (link.classList.contains('external-link')) return;

        e.preventDefault();
        if (!link.classList.contains('internal-link')) return;
        const href = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
        if (href)
            void app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(e.nativeEvent));
    };

    return <div ref={host} className={`zenith-md ${className}`} onClick={onClick} />;
};
