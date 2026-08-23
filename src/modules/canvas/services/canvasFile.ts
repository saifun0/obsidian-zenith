import { TFile, type App, type WorkspaceLeaf } from 'obsidian';
import { parseCanvas, serializeCanvas, type CanvasData } from '../canvasTypes';

export const CANVAS_EXTENSION = 'canvas';
/** Obsidian's internal id for the canvas view. Not exported by the API. */
export const CANVAS_VIEW_TYPE = 'canvas';

export function isCanvasFile(file: unknown): file is TFile {
    return file instanceof TFile && file.extension === CANVAS_EXTENSION;
}

/** The canvas the user is looking at, or null when the active file is not one. */
export function getActiveCanvasFile(app: App): TFile | null {
    const file = app.workspace.getActiveFile();
    return isCanvasFile(file) ? file : null;
}

export async function readCanvasFile(app: App, file: TFile): Promise<CanvasData> {
    return parseCanvas(await app.vault.read(file));
}

/**
 * Read, transform and write a canvas in one atomic step.
 *
 * `vault.process` rather than read-then-modify: a canvas open in another pane
 * saves itself on every drag, and the naive pair would silently overwrite
 * whatever landed between the two calls.
 *
 * Returns false when the transform changed nothing, so callers can skip the
 * write and avoid a pointless entry in the file's version history.
 */
export async function updateCanvasFile(
    app: App,
    file: TFile,
    transform: (data: CanvasData) => CanvasData
): Promise<boolean> {
    let changed = false;
    await app.vault.process(file, (raw) => {
        const before = parseCanvas(raw);
        const after = transform(before);
        const serialized = serializeCanvas(after);
        // Compare against a normalised original: raw whitespace differences are
        // not a change worth writing.
        changed = serialized !== serializeCanvas(before);
        return changed ? serialized : raw;
    });
    return changed;
}

/** The open leaf showing this canvas, if any. */
export function findOpenCanvasLeaf(app: App, file: TFile): WorkspaceLeaf | null {
    for (const leaf of app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)) {
        const view = leaf.view as unknown as { file?: TFile };
        if (view?.file?.path === file.path) return leaf;
    }
    return null;
}

/**
 * Nudge an open canvas to show what was just written to disk.
 *
 * Every path here is private API, so each call is feature-detected and failure
 * is not an error: the file on disk is already correct, and the worst outcome
 * is the user reopening the tab. Returns whether the view actually refreshed,
 * so the caller can say so honestly instead of claiming success.
 */
export function refreshOpenCanvas(leaf: WorkspaceLeaf | null, data: CanvasData): boolean {
    if (!leaf) return false;
    const canvas = (leaf.view as unknown as { canvas?: Record<string, unknown> })?.canvas;
    if (!canvas) return false;
    try {
        const setData = canvas.setData as ((d: CanvasData) => void) | undefined;
        if (typeof setData !== 'function') return false;
        setData.call(canvas, data);
        const requestSave = canvas.requestSave as (() => void) | undefined;
        if (typeof requestSave === 'function') requestSave.call(canvas);
        return true;
    } catch {
        return false;
    }
}
