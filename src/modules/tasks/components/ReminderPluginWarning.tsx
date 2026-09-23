import React, { type FC } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { App } from 'obsidian';
import type { CustomFieldProps } from '../../../settings/schema/types';
import { featureEnabled } from '../../../core/features';
import { useZenithStore } from '../../../store';

/**
 * The Reminder plugin, by its ids over the years. It reads `⏰` on task lines
 * as well, so with both on a task can be announced twice.
 */
const REMINDER_PLUGIN_IDS = ['obsidian-reminder-plugin', 'obsidian-reminder'];

/** Whether another plugin that reminds about task lines is switched on. */
export function reminderPluginEnabled(app: App): boolean {
    const enabled = (app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins
        ?.enabledPlugins;
    return !!enabled && REMINDER_PLUGIN_IDS.some((id) => enabled.has(id));
}

/**
 * A line in the reminders group, shown only while both are on — the one case
 * in which it has something to say.
 */
export const ReminderPluginWarning: FC<CustomFieldProps> = ({ app, t }) => {
    const on = useZenithStore((s) => featureEnabled(s.settings, 'tasks.reminders'));
    if (!on || !reminderPluginEnabled(app)) return null;
    return (
        <div className="zenith-settings__hint zenith-settings__hint--warn">
            <AlertTriangle size={13} />
            {t('settings.taskReminderPlugin')}
        </div>
    );
};
