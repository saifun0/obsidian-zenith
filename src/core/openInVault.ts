import { App, MarkdownView, TFile } from 'obsidian';

export interface OpenAt {
    /** In a new tab rather than the current one. */
    newTab?: boolean;
    /** Characters of the line to select, when the note opens for editing. */
    select?: { ch: number; length: number };
}

/**
 * Open a vault file in the workspace, optionally scrolling to a line.
 *
 * @param line 0-indexed line to reveal (task/content line numbers are
 *             1-indexed, so pass `lineNumber - 1`).
 */
export async function openFileAtLine(
    app: App,
    filePath: string,
    line?: number,
    at: OpenAt = {}
): Promise<boolean> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return false;

    const leaf = app.workspace.getLeaf(at.newTab ? 'tab' : false);
    await leaf.openFile(file, line != null ? { eState: { line } } : undefined);

    // Reading view has no selection; it is scrolled to the line and no more.
    const { view } = leaf;
    if (line != null && at.select && view instanceof MarkdownView && view.getMode() === 'source') {
        const from = { line, ch: at.select.ch };
        const to = { line, ch: at.select.ch + at.select.length };
        view.editor.setSelection(from, to);
        view.editor.scrollIntoView({ from, to }, true);
        view.editor.focus();
    }
    return true;
}
