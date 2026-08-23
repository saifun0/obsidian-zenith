import { MarkdownRenderChild } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { DailyNoteBlock } from './components/DailyNoteBlock';
import type ZenithPlugin from '../../main';

/**
 * Mounts the day's check-in into a `zenith-daily` code block.
 *
 * Extending `MarkdownRenderChild` and handing it to `ctx.addChild` ties the
 * React root to the rendered block's own lifetime: Obsidian re-renders a note's
 * blocks freely (scrolling, editing, switching modes) and unmounts each child
 * as it goes, so the roots are cleaned up without the module tracking them.
 *
 * The container gets `zenith-root` because that is where Zenith's design tokens
 * are defined — a block rendered in the note sits outside every Zenith view, so
 * without it every `--zenith-*` variable would resolve to nothing.
 */
export class JournalBlockRenderer extends MarkdownRenderChild {
    private root: Root | null = null;

    constructor(
        containerEl: HTMLElement,
        private readonly plugin: ZenithPlugin,
        private readonly sourcePath: string
    ) {
        super(containerEl);
    }

    onload(): void {
        this.containerEl.addClass('zenith-root', 'zenith-dblock-host');
        this.root = createRoot(this.containerEl);
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.plugin.app, plugin: this.plugin } },
                createElement(DailyNoteBlock, { sourcePath: this.sourcePath })
            )
        );
    }

    onunload(): void {
        this.root?.unmount();
        this.root = null;
    }
}
