import { createElement } from 'react';
import { IconPicker } from '../components/shared/IconPicker';
import { openDialog } from './openDialog';
import type ZenithPlugin from '../main';

/**
 * Ask for an icon. `current` is the one in use, marked in the grid; `onChoose`
 * is told the id of the one picked, and is not called if none is.
 *
 * Opened this way from everywhere an icon is chosen — a tracker, a content
 * type, a project, a folder in the explorer — over whatever asked for it, a
 * form in one of Obsidian's own modals included.
 */
export function pickIcon(
    plugin: ZenithPlugin,
    current: string | undefined,
    onChoose: (iconId: string) => void
): void {
    openDialog(plugin, (close) => createElement(IconPicker, { current, onChoose, onClose: close }));
}
