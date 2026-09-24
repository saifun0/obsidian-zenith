import React, { useSyncExternalStore, type FC } from 'react';
import type { CustomFieldProps } from '../schema/types';
import { SettingRow } from '../controls';

const NOTHING = () => () => undefined;

/**
 * What the phone's chrome covers right now, as measured — the number to check
 * before setting one by hand, and the one to quote when a view still slips
 * under the camera.
 */
export const InsetsReadout: FC<CustomFieldProps> = ({ plugin, t }) => {
    const insets = plugin.mobileInsets;
    const reading = useSyncExternalStore(
        insets ? (l: () => void) => insets.subscribe(l) : NOTHING,
        () => insets?.reading ?? null
    );
    if (!reading) return null;
    return (
        <SettingRow
            label={t('settings.mobileInsets.now')}
            desc={t('settings.mobileInsets.measured', {
                top: Math.round(reading.system.top),
                bottom: Math.round(reading.system.bottom),
                navbar: reading.navbar,
            })}
        >
            <span className="zenith-settings__readout">
                {t('settings.mobileInsets.applied', {
                    top: reading.applied.top,
                    bottom: reading.applied.bottom,
                })}
            </span>
        </SettingRow>
    );
};
