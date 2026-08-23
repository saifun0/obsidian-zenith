import { App, TFile } from 'obsidian';

/**
 * Open a vault file in the workspace, optionally scrolling to a line.
 *
 * @param line 0-indexed line to reveal (task/content line numbers are
 *             1-indexed, so pass `lineNumber - 1`).
 */
export async function openFileAtLine(
    app: App,
    filePath: string,
    line?: number
): Promise<boolean> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return false;

    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file, line != null ? { eState: { line } } : undefined);
    return true;
}
