import { createElement } from 'react';
import { openDialog } from '../../core/openDialog';
import type ZenithPlugin from '../../main';
import { MediaPicker } from './components/MediaPicker';

/**
 * Open the banner's picture picker — from the banner itself, the command, the
 * launcher button or the settings page. None of them is inside a React tree
 * that could simply render it.
 */
export function openMediaPicker(plugin: ZenithPlugin): void {
    openDialog(plugin, (close) => createElement(MediaPicker, { onClose: close }));
}
