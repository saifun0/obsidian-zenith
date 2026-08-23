import { Notice, TFile, type EventRef, type TAbstractFile } from 'obsidian';
import { BaseModule } from '../../core/IModule';
import { findOpenCanvasLeaf, getActiveCanvasFile, isCanvasFile } from './services/canvasFile';
import { actionsFor, canvasActions, commandName, t } from './canvasActions';
import { CanvasToolbar } from './ui/CanvasToolbar';
import { canvasSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';

/**
 * CanvasModule — enhancements for Obsidian's built-in Canvas.
 *
 * Obsidian exposes no Canvas API at all: `obsidian.d.ts` never mentions it, and
 * everything the built-in view does lives behind private objects that may be
 * renamed in any release. So the features are built on the `.canvas` file
 * format, which is a published spec — expressed as file transforms they keep
 * working across upgrades.
 *
 * The chrome is layered by how safe it is. Commands and the file menu are
 * public API and always work; the button on the canvas itself reaches into the
 * view's DOM and is allowed to fail silently. Losing the button costs discovery,
 * not capability.
 *
 * The module owns no view of its own; it augments a core one.
 */
export class CanvasModule extends BaseModule {
    readonly id = 'canvas';
    readonly name = 'Canvas';
    readonly description = 'Tidy, generate and reshape Obsidian canvases.';
    readonly icon = 'workflow';

    private toolbar: CanvasToolbar | null = null;
    private eventRefs: EventRef[] = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        const app = this.plugin.app;

        for (const action of canvasActions) {
            this.addCommand({
                id: `zenith-canvas-${action.id}`,
                // Obsidian already prefixes the palette entry with the plugin
                // name, so this only needs to name the action itself.
                name: commandName(action),
                // `checkCallback` keeps the command out of the palette entirely
                // when the active file is the wrong kind, rather than letting
                // the user run it and only then be told it does not apply.
                checkCallback: (checking: boolean) => {
                    const file = this.activeFileFor(action.applies);
                    if (!file) return false;
                    if (checking) return true;
                    void action.run(app, file);
                    return true;
                },
            });
        }

        this.toolbar = new CanvasToolbar(app);
        // A canvas may already be open when the module is switched on, and the
        // button has to appear without waiting for the user to change tabs.
        this.toolbar.syncAll();

        const resync = () => this.toolbar?.syncAll();
        this.track(app.workspace.on('layout-change', resync));
        this.track(app.workspace.on('active-leaf-change', resync));

        this.track(
            app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
                const kind = isCanvasFile(file)
                    ? 'canvas'
                    : file instanceof TFile && file.extension === 'md'
                      ? 'markdown'
                      : null;
                if (!kind || !(file instanceof TFile)) return;
                const actions = actionsFor(kind);
                if (!actions.length) return;
                menu.addSeparator();
                for (const action of actions) {
                    menu.addItem((item) =>
                        item
                            .setTitle(t(action.labelKey))
                            .setIcon(action.icon)
                            .onClick(() => void action.run(app, file))
                    );
                }
            })
        );
    }

    async onunload(): Promise<void> {
        // Events and DOM are torn down by hand rather than through
        // `plugin.registerEvent`: those live until the whole plugin unloads,
        // which would leave a disabled module still listening and still drawing
        // its button on every canvas.
        for (const ref of this.eventRefs) this.plugin.app.workspace.offref(ref);
        this.eventRefs = [];
        this.toolbar?.unmountAll();
        this.toolbar = null;
    }

    async activateView(): Promise<void> {
        const app = this.plugin.app;
        const file = getActiveCanvasFile(app);
        const leaf = file ? findOpenCanvasLeaf(app, file) : null;
        if (leaf) {
            app.workspace.revealLeaf(leaf);
            return;
        }
        new Notice(t('canvas.notice.openOne'));
    }

    getSettingsSchema(): SettingsSchema {
        return canvasSettingsSchema;
    }

    /** The active file, but only when it is the kind the action can act on. */
    private activeFileFor(kind: 'canvas' | 'markdown'): TFile | null {
        if (kind === 'canvas') return getActiveCanvasFile(this.plugin.app);
        const file = this.plugin.app.workspace.getActiveFile();
        return file && file.extension === 'md' ? file : null;
    }

    private track(ref: EventRef): void {
        this.eventRefs.push(ref);
    }
}
