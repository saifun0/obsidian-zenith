import { Notice, type App, type TFile } from 'obsidian';
import { resolveLocale, translate } from '../../core/i18n';
import { useZenithStore } from '../../store';
import {
    findOpenCanvasLeaf,
    readCanvasFile,
    refreshOpenCanvas,
    updateCanvasFile,
} from './services/canvasFile';
import { canvasToOutline, outlineToCanvas, parseHeadings } from './services/outline';
import { CanvasBridge } from './services/canvasInternals';
import { fitNodes } from './services/fit';
import { normalizeEdgeSides } from './services/edges';
import { CanvasSearchModal } from './ui/CanvasSearchModal';
import { serializeCanvas } from './canvasTypes';
import { layoutCanvas, type LayoutKind, type LayoutOptions } from './services/layout';
import { probeCanvasInternals } from './services/canvasProbe';
import type { CanvasData } from './canvasTypes';

/** `t()` for code outside React, matching what the journal module does. */
export function t(key: string, params?: Record<string, string | number>): string {
    return translate(resolveLocale(useZenithStore.getState().settings.language), key, params);
}

/**
 * One canvas action, offered on every surface that can host it.
 *
 * Defined once rather than per surface: the command palette, the toolbar button
 * on the canvas and the file menu all render from this list, so adding an
 * action lights it up in all three and none of them can drift out of step.
 */
export interface CanvasAction {
    id: string;
    labelKey: string;
    /** Lucide icon id. */
    icon: string;
    /** What the action needs to be looking at to make sense. */
    applies: 'canvas' | 'markdown';
    /** Developer tooling — kept out of the toolbar, still in the palette. */
    advanced?: boolean;
    run(app: App, file: TFile): Promise<void>;
}

/** A free path near `base`, so a conversion never overwrites existing work. */
function freePath(app: App, base: string, extension: string): string {
    let path = `${base}.${extension}`;
    for (let n = 2; app.vault.getAbstractFileByPath(path); n++) {
        path = `${base} ${n}.${extension}`;
    }
    return path;
}

async function openInNewTab(app: App, file: TFile): Promise<void> {
    await app.workspace.getLeaf('tab').openFile(file);
}

async function noteToCanvas(app: App, file: TFile): Promise<void> {
    // Obsidian's cache already has the headings parsed; falling back to reading
    // the file covers a note that has just been created and not yet indexed.
    const cached = app.metadataCache.getFileCache(file)?.headings;
    const headings = cached?.length
        ? cached.map((h) => ({ text: h.heading, level: h.level }))
        : parseHeadings(await app.vault.cachedRead(file));

    if (!headings.length) {
        new Notice(t('canvas.notice.noHeadings'));
        return;
    }

    // Size the cards before arranging them: the layout spaces blocks by their
    // height, so fitting afterwards would leave the gaps sized for the old ones.
    const laid = layoutCanvas(fitNodes(outlineToCanvas(headings)), 'tree', layoutOptions());
    const path = freePath(app, file.path.replace(/\.md$/i, ''), 'canvas');
    const created = await app.vault.create(path, serializeCanvas(laid));
    await openInNewTab(app, created);
    new Notice(t('canvas.notice.created', { count: headings.length }));
}

async function canvasToNote(app: App, file: TFile): Promise<void> {
    const data = await readCanvasFile(app, file);
    if (!data.nodes.length) {
        new Notice(t('canvas.notice.empty'));
        return;
    }
    const path = freePath(app, file.path.replace(/\.canvas$/i, ''), 'md');
    const created = await app.vault.create(path, canvasToOutline(data));
    await openInNewTab(app, created);
    new Notice(t('canvas.notice.exported', { count: data.nodes.length }));
}

/**
 * Read the layout knobs at the moment the command runs, not at registration:
 * the settings page writes straight into the store, and a value captured once
 * would keep applying the setting the user had when Obsidian started.
 */
function layoutOptions(): Partial<LayoutOptions> {
    const s = useZenithStore.getState().settings;
    return {
        gap: s.canvasLayoutGap,
        columns: s.canvasLayoutColumns,
        direction: s.canvasTreeDirection,
    };
}

/**
 * Node ids the user has selected on the open canvas, when there are enough of
 * them to arrange. One selected node has no arrangement, and an empty selection
 * means "the whole canvas" rather than "nothing".
 */
function selectedIds(app: App, file: TFile): ReadonlySet<string> | undefined {
    const bridge = CanvasBridge.from(findOpenCanvasLeaf(app, file));
    const ids = bridge?.selection().map((n) => n.id) ?? [];
    return ids.length >= 2 ? new Set(ids) : undefined;
}

async function runLayout(app: App, file: TFile, kind: LayoutKind): Promise<void> {
    const only = selectedIds(app, file);
    let result: CanvasData | null = null;
    try {
        const changed = await updateCanvasFile(app, file, (data) => {
            result = layoutCanvas(data, kind, { ...layoutOptions(), only });
            return result;
        });
        if (!changed) {
            new Notice(t('canvas.notice.alreadyTidy'));
            return;
        }
    } catch (e) {
        new Notice(t('canvas.notice.failed', { error: (e as Error).message }));
        return;
    }

    // The write already succeeded; refreshing the open tab is a nicety on top of
    // it, so the message says which of the two actually happened.
    const refreshed = result ? refreshOpenCanvas(findOpenCanvasLeaf(app, file), result) : false;
    const done = only ? t('canvas.notice.tidiedSelection', { count: only.size }) : t('canvas.notice.tidied');
    new Notice(refreshed ? done : t('canvas.notice.tidiedReopen'));
}

/**
 * One shape for every command that rewrites the canvas file: transform, report
 * whether anything moved, then tell the truth about whether the open tab caught
 * up. Written once because the three of them differ only in those two strings.
 */
async function runTransform(
    app: App,
    file: TFile,
    transform: (data: CanvasData) => CanvasData,
    messages: { done: string; noop: string }
): Promise<void> {
    let result: CanvasData | null = null;
    try {
        const changed = await updateCanvasFile(app, file, (data) => {
            result = transform(data);
            return result;
        });
        if (!changed) {
            new Notice(messages.noop);
            return;
        }
    } catch (e) {
        new Notice(t('canvas.notice.failed', { error: (e as Error).message }));
        return;
    }
    const refreshed = result ? refreshOpenCanvas(findOpenCanvasLeaf(app, file), result) : false;
    new Notice(refreshed ? messages.done : t('canvas.notice.tidiedReopen'));
}

async function runFit(app: App, file: TFile): Promise<void> {
    const only = selectedIds(app, file);
    await runTransform(app, file, (data) => fitNodes(data, { only }), {
        done: t('canvas.notice.fitted'),
        noop: t('canvas.notice.alreadyFitted'),
    });
}

async function runStraighten(app: App, file: TFile): Promise<void> {
    const only = selectedIds(app, file);
    await runTransform(app, file, (data) => normalizeEdgeSides(data, 'auto', only), {
        done: t('canvas.notice.straightened'),
        noop: t('canvas.notice.alreadyStraight'),
    });
}

export const canvasActions: readonly CanvasAction[] = [
    {
        id: 'tidy-tree',
        labelKey: 'canvas.action.tree',
        icon: 'git-branch',
        applies: 'canvas',
        run: (app, file) => runLayout(app, file, 'tree'),
    },
    {
        id: 'tidy-grid',
        labelKey: 'canvas.action.grid',
        icon: 'layout-grid',
        applies: 'canvas',
        run: (app, file) => runLayout(app, file, 'grid'),
    },
    {
        id: 'tidy-radial',
        labelKey: 'canvas.action.radial',
        icon: 'circle-dot',
        applies: 'canvas',
        run: (app, file) => runLayout(app, file, 'radial'),
    },
    {
        id: 'fit',
        labelKey: 'canvas.action.fit',
        icon: 'scaling',
        applies: 'canvas',
        run: runFit,
    },
    {
        id: 'straighten',
        labelKey: 'canvas.action.straighten',
        icon: 'spline',
        applies: 'canvas',
        run: runStraighten,
    },
    {
        id: 'search',
        labelKey: 'canvas.action.search',
        icon: 'search',
        applies: 'canvas',
        run: async (app, file) => {
            const bridge = CanvasBridge.from(findOpenCanvasLeaf(app, file));
            if (!bridge) {
                new Notice(t('canvas.notice.noLiveCanvas'));
                return;
            }
            new CanvasSearchModal(app, bridge).open();
        },
    },
    {
        id: 'to-note',
        labelKey: 'canvas.action.toNote',
        icon: 'file-text',
        applies: 'canvas',
        run: canvasToNote,
    },
    {
        id: 'from-note',
        labelKey: 'canvas.action.fromNote',
        icon: 'workflow',
        applies: 'markdown',
        run: noteToCanvas,
    },
    {
        id: 'probe',
        labelKey: 'canvas.action.probe',
        icon: 'bug',
        applies: 'canvas',
        advanced: true,
        run: async (app) => {
            const result = await probeCanvasInternals(app);
            new Notice(result.message, result.ok ? 8000 : 5000);
        },
    },
];

/** What the button on a canvas offers: canvas actions, developer tooling aside. */
export const toolbarActions = canvasActions.filter((a) => a.applies === 'canvas' && !a.advanced);

export function actionsFor(kind: 'canvas' | 'markdown'): CanvasAction[] {
    return canvasActions.filter((a) => a.applies === kind && !a.advanced);
}

/**
 * Command-palette name: the English label, whatever the interface language.
 *
 * Every other module names its commands in plain English, and Obsidian resolves
 * a command name once at registration anyway. Translating only these would put
 * two languages side by side in one palette, which reads worse than one.
 */
export function commandName(action: CanvasAction): string {
    return translate('en', action.labelKey);
}
