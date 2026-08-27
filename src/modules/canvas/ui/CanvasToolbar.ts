import { Menu, setIcon, setTooltip, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { CANVAS_VIEW_TYPE, isCanvasFile } from '../services/canvasFile';
import { t, toolbarActions } from '../canvasActions';

/**
 * Our own marker, never one of Obsidian's: it is how a re-mount recognises the
 * button it already added, and how unload finds every copy to remove.
 */
const MARKER = 'zenith-canvas-control-group';

/**
 * Obsidian's own class names for the control rail down the right of a canvas.
 * Read out of the shipped stylesheet rather than remembered, but still not
 * public API — hence the defensive mounting below.
 */
const CONTROLS_CONTAINER = '.canvas-controls';
const CONTROL_GROUP = 'canvas-control-group';
const CONTROL_ITEM = 'canvas-control-item';

/**
 * Adds a Zenith button to the canvas control rail.
 *
 * Canvas has no public API and no extension point for its chrome, so this
 * reaches into the view's DOM. Every step is therefore optional: if the rail
 * cannot be found — because a future Obsidian restructured it — nothing is
 * injected and nothing throws. The same actions stay reachable from the command
 * palette and the file menu, which are public API, so losing this button
 * degrades the module rather than breaking it.
 */
export class CanvasToolbar {
    constructor(private readonly app: App) {}

    /** Mount into every open canvas, skipping those already carrying the button. */
    syncAll(): void {
        for (const leaf of this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)) {
            this.mount(leaf);
        }
    }

    /**
     * Remove every button this class added, from every canvas.
     *
     * A canvas can live in a popout window, which has its own `document`, so a
     * single global query from the main one would leave the button behind
     * there — still drawn, still clickable, by a module that is switched off.
     */
    unmountAll(): void {
        const documents = new Set<Document>([document]);
        for (const leaf of this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)) {
            const doc = leaf.view?.containerEl?.ownerDocument;
            if (doc) documents.add(doc);
        }
        for (const doc of documents) {
            for (const el of Array.from(doc.querySelectorAll(`.${MARKER}`))) {
                el.remove();
            }
        }
    }

    private mount(leaf: WorkspaceLeaf): void {
        const container = leaf.view?.containerEl?.querySelector(CONTROLS_CONTAINER);
        if (!container) return;
        if (container.querySelector(`.${MARKER}`)) return;

        const group = container.createDiv({ cls: `${CONTROL_GROUP} ${MARKER}` });
        const button = group.createDiv({ cls: CONTROL_ITEM });
        setIcon(button, 'wand-sparkles');
        setTooltip(button, t('canvas.toolbar.tooltip'), { placement: 'left' });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openMenu(event, leaf);
        });
    }

    private openMenu(event: MouseEvent, leaf: WorkspaceLeaf): void {
        const file = (leaf.view as unknown as { file?: TFile })?.file;
        if (!isCanvasFile(file)) return;

        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t('canvas.toolbar.tidy')).setIsLabel(true));
        for (const action of toolbarActions) {
            menu.addItem((item) =>
                item
                    .setTitle(t(action.labelKey))
                    .setIcon(action.icon)
                    .onClick(() => void action.run(this.app, file))
            );
        }
        menu.showAtMouseEvent(event);
    }
}
