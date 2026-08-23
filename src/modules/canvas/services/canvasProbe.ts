import { normalizePath, type App, type WorkspaceLeaf } from 'obsidian';
import { CANVAS_VIEW_TYPE } from './canvasFile';

/**
 * Where the probe leaves its report. Inside the plugin's own dev folder, which
 * is git-ignored — the vault API hides `.obsidian`, but the adapter is rooted at
 * the vault, so it can still be written there without littering the user's notes.
 */
export const PROBE_REPORT_PATH = '.obsidian/plugins/zenith-work/temp/canvas-probe.json';

interface MemberReport {
    name: string;
    kind: string;
    /** Arity for functions, a short preview for values. */
    detail?: string;
}

/**
 * Describe an object's surface: own properties plus everything up the prototype
 * chain, which is where a class puts its methods.
 */
function describe(target: unknown, maxDepth = 4): MemberReport[] {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return [];
    const seen = new Set<string>();
    const members: MemberReport[] = [];

    let current: object | null = target as object;
    for (let depth = 0; current && depth < maxDepth; depth++) {
        for (const name of Object.getOwnPropertyNames(current)) {
            if (name === 'constructor' || seen.has(name)) continue;
            seen.add(name);
            let kind = 'unknown';
            let detail: string | undefined;
            try {
                // Read through the descriptor: touching a getter directly can
                // throw or trigger work, and the probe must never break the app.
                const desc = Object.getOwnPropertyDescriptor(current, name);
                if (desc?.get) {
                    kind = 'getter';
                } else {
                    const value = (target as Record<string, unknown>)[name];
                    if (typeof value === 'function') {
                        kind = 'function';
                        detail = `arity ${(value as (...a: unknown[]) => unknown).length}`;
                    } else if (value instanceof Map) {
                        kind = 'Map';
                        detail = `size ${value.size}`;
                    } else if (value instanceof Set) {
                        kind = 'Set';
                        detail = `size ${value.size}`;
                    } else if (Array.isArray(value)) {
                        kind = 'array';
                        detail = `length ${value.length}`;
                    } else if (value === null) {
                        kind = 'null';
                    } else {
                        kind = typeof value;
                        if (kind === 'string' || kind === 'number' || kind === 'boolean') {
                            detail = String(value).slice(0, 60);
                        }
                    }
                }
            } catch (e) {
                kind = `threw: ${(e as Error).message.slice(0, 60)}`;
            }
            members.push({ name, kind, detail });
        }
        current = Object.getPrototypeOf(current);
    }

    return members.sort((a, b) => a.name.localeCompare(b.name));
}

function firstOf(collection: unknown): unknown {
    if (collection instanceof Map) return collection.values().next().value;
    if (collection instanceof Set) return collection.values().next().value;
    if (Array.isArray(collection)) return collection[0];
    return undefined;
}

export interface ProbeResult {
    ok: boolean;
    message: string;
    path?: string;
}

/**
 * Dump the real shape of Obsidian's private canvas objects to a file.
 *
 * The whole live-view half of this module depends on internals that Obsidian
 * documents nowhere and can rename in any release. Rather than code against
 * remembered method names, this records what actually exists in the installed
 * version, so features can be built on observed facts and can feature-detect
 * honestly when they ship.
 */
export async function probeCanvasInternals(app: App): Promise<ProbeResult> {
    const leaf: WorkspaceLeaf | undefined = app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)[0];
    if (!leaf) {
        return { ok: false, message: 'Open a canvas first — no canvas view is currently open.' };
    }

    const view = leaf.view as unknown as Record<string, unknown>;
    const canvas = view.canvas as Record<string, unknown> | undefined;

    const report = {
        capturedAt: new Date().toISOString(),
        obsidianVersion: (app as unknown as { appVersion?: string }).appVersion ?? 'unknown',
        viewType: typeof view.getViewType === 'function' ? (view.getViewType as () => string)() : null,
        hasCanvasObject: Boolean(canvas),
        view: describe(view),
        canvas: canvas ? describe(canvas) : [],
        sampleNode: canvas ? describe(firstOf(canvas.nodes)) : [],
        sampleEdge: canvas ? describe(firstOf(canvas.edges)) : [],
        counts: {
            nodes: canvas?.nodes instanceof Map ? canvas.nodes.size : null,
            edges: canvas?.edges instanceof Map ? canvas.edges.size : null,
        },
    };

    const path = normalizePath(PROBE_REPORT_PATH);
    const adapter = app.vault.adapter;
    const dir = path.slice(0, path.lastIndexOf('/'));
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    await adapter.write(path, JSON.stringify(report, null, 2));

    const found = report.canvas.length;
    return {
        ok: true,
        path,
        message: canvas
            ? `Canvas internals captured: ${found} members. Written to ${path}`
            : `No private canvas object on this view — only the view surface was captured. Written to ${path}`,
    };
}
