import React, { type FC } from 'react';
import { Platform } from 'obsidian';
import type { CustomFieldProps } from '../../../settings/schema/types';
import { ActionButton, SettingRow } from '../../../settings/controls';
import { SEARCH_COMMAND_ID } from '../builtInSources';

/** Obsidian's settings window and hotkeys: not in its public typings. */
interface ObsidianInternals {
    setting?: {
        open?: () => void;
        openTabById?: (id: string) => {
            searchComponent?: { setValue: (value: string) => void };
            renderHotkeyList?: () => void;
        } | null;
    };
    hotkeyManager?: { printHotkeyForCommand?: (id: string) => string };
}

/**
 * The hotkey that opens Search, and a way to set it.
 *
 * None is set by default: Obsidian asks plugins not to take keys, and any
 * combination worth having is already someone's. The button opens Obsidian's
 * own hotkey page with the list already narrowed to this one command, which
 * is as close as a plugin can get to "press the keys now".
 */
export const HotkeyField: FC<CustomFieldProps> = ({ plugin, t }) => {
    if (Platform.isPhone) {
        return (
            <SettingRow label={t('settings.searchHotkey')} desc={t('settings.searchHotkey.phone')}>
                {null}
            </SettingRow>
        );
    }
    const app = plugin.app as unknown as ObsidianInternals;
    const commandId = `${plugin.manifest.id}:${SEARCH_COMMAND_ID}`;
    const current = app.hotkeyManager?.printHotkeyForCommand?.(commandId) || '';

    const setHotkey = () => {
        app.setting?.open?.();
        const tab = app.setting?.openTabById?.('hotkeys');
        tab?.searchComponent?.setValue(`${plugin.manifest.name}: Search`);
        tab?.renderHotkeyList?.();
    };

    return (
        <SettingRow label={t('settings.searchHotkey')} desc={t('settings.searchHotkey.desc')}>
            <span className="zenith-settings__readout">
                {current || t('settings.searchHotkey.none')}
            </span>
            <ActionButton label={t('settings.searchHotkey.set')} onClick={setHotkey} />
        </SettingRow>
    );
};
