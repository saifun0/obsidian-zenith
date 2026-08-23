import { SuggestModal, prepareFuzzySearch, renderResults, type App, type SearchResult } from 'obsidian';
import { nodeLabel, type CanvasBridge, type LiveNode } from '../services/canvasInternals';
import { t } from '../canvasActions';

interface Hit {
    node: LiveNode;
    label: string;
    /** Where the match landed, for highlighting. Null when the query is empty. */
    result: SearchResult | null;
    /** The line the match came from, when it was not the title. */
    context: string | null;
}

/**
 * Find a node on a canvas and fly to it.
 *
 * On a canvas of any size the built-in answer is to zoom out and squint, since
 * Obsidian's search does not look inside canvas nodes. Reading the nodes needs
 * the private object, but the dialog itself is a plain `SuggestModal` — public
 * API — so a future Obsidian can only cost the list, never the window.
 */
export class CanvasSearchModal extends SuggestModal<Hit> {
    constructor(
        app: App,
        private readonly bridge: CanvasBridge
    ) {
        super(app);
        this.setPlaceholder(t('canvas.search.placeholder'));
        this.limit = 50;
    }

    getSuggestions(query: string): Hit[] {
        const nodes = this.bridge.nodes();
        const trimmed = query.trim();

        if (!trimmed) {
            // No query: offer the canvas in reading order rather than an empty
            // list, so the dialog doubles as a table of contents.
            return nodes
                .slice()
                .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
                .map((node) => ({ node, label: nodeLabel(node), result: null, context: null }));
        }

        const match = prepareFuzzySearch(trimmed);
        const hits: Array<Hit & { score: number }> = [];
        for (const node of nodes) {
            const label = nodeLabel(node);
            const onLabel = match(label);
            // Search the whole node, not just its first line: the words people
            // remember are usually in the body of a card.
            const body = node.text ?? '';
            const onBody = body && body !== label ? match(body) : null;

            if (onLabel) {
                hits.push({ node, label, result: onLabel, context: null, score: onLabel.score });
            } else if (onBody) {
                const line =
                    body
                        .split(/\r?\n/)
                        .find((l) => match(l)) ?? '';
                hits.push({
                    node,
                    label,
                    result: null,
                    context: line.trim().slice(0, 120),
                    // Body matches rank below title matches of similar quality.
                    score: onBody.score - 1,
                });
            }
        }
        return hits.sort((a, b) => b.score - a.score).map(({ score: _score, ...hit }) => hit);
    }

    renderSuggestion(hit: Hit, el: HTMLElement): void {
        const title = el.createDiv({ cls: 'zenith-canvas-search__title' });
        if (hit.result) renderResults(title, hit.label, hit.result);
        else title.setText(hit.label);
        if (hit.context) {
            el.createDiv({ cls: 'zenith-canvas-search__context', text: hit.context });
        }
    }

    onChooseSuggestion(hit: Hit): void {
        // Select as well as reveal: the node stays highlighted after the dialog
        // closes, so it is obvious which one was found.
        this.bridge.selectOnly(hit.node);
        this.bridge.revealNode(hit.node);
    }
}
