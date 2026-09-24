import { MarkdownRenderChild, type MarkdownPostProcessorContext } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { SummaryBlock } from './components/SummaryBlock';
import type ZenithPlugin from '../../main';

/** Mounts a `zenith-summary` block — see `JournalBlockRenderer` for why a render child. */
export class SummaryBlockRenderer extends MarkdownRenderChild {
    private root: Root | null = null;

    constructor(
        containerEl: HTMLElement,
        private readonly plugin: ZenithPlugin,
        private readonly source: string,
        private readonly ctx: MarkdownPostProcessorContext
    ) {
        super(containerEl);
    }

    onload(): void {
        this.containerEl.addClass('zenith-root', 'zenith-summary-host');
        this.root = createRoot(this.containerEl);
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.plugin.app, plugin: this.plugin } },
                createElement(SummaryBlock, {
                    source: this.source,
                    sourcePath: this.ctx.sourcePath,
                    // Asked at click time: the block may have moved since it
                    // was drawn, and only Obsidian knows where it is now.
                    lineEnd: () => this.ctx.getSectionInfo(this.containerEl)?.lineEnd ?? null,
                })
            )
        );
    }

    onunload(): void {
        this.root?.unmount();
        this.root = null;
    }
}
