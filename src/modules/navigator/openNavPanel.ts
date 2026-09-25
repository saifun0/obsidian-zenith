import { VIEW_TYPE_NAV_PANEL } from '../../core/constants';
import type ZenithPlugin from '../../main';

/**
 * Show the side panel: the one already open wherever the user moved it, or a
 * new one in the right sidebar.
 */
export async function openNavPanel(plugin: ZenithPlugin, focus = true): Promise<void> {
    const { workspace } = plugin.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_NAV_PANEL)[0];
    if (!leaf) {
        const side = workspace.getRightLeaf(false);
        if (!side) return;
        await side.setViewState({ type: VIEW_TYPE_NAV_PANEL, active: focus });
        leaf = side;
    }
    if (focus) await workspace.revealLeaf(leaf);
}
