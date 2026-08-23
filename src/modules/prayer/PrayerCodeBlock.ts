import { MarkdownRenderChild } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { PrayerNoteBlock } from './components/PrayerNoteBlock';
import type ZenithPlugin from '../../main';

/**
 * Mounts the day's prayer tracker into a `zenith-prayer` code block.
 *
 * Same shape as the journal's block, and for the same reasons: handing a
 * `MarkdownRenderChild` to `ctx.addChild` ties the React root to the rendered
 * block's own lifetime, and `zenith-root` on the container is what puts the
 * `--zenith-*` design tokens in scope for a block rendered out in a note.
 */
export class PrayerBlockRenderer extends MarkdownRenderChild {
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
                createElement(PrayerNoteBlock, { sourcePath: this.sourcePath })
            )
        );
    }

    onunload(): void {
        this.root?.unmount();
        this.root = null;
    }
}
