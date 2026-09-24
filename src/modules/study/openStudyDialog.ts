import type { ReactElement } from 'react';
import { openDialog } from '../../core/openDialog';
import type ZenithPlugin from '../../main';

/** Open one of the module's dialogs from a command or the settings page. */
export function openStudyDialog(
    plugin: ZenithPlugin,
    render: (close: () => void) => ReactElement
): void {
    openDialog(plugin, render, 'zenith-study-dialog-host');
}
