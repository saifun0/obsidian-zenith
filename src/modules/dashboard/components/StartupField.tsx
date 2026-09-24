import React, { type FC } from 'react';
import { Info } from 'lucide-react';
import type { CustomFieldProps } from '../../../settings/schema/types';
import { FeatureRow } from '../../../settings/schema/FeatureRow';
import { isPluginEnabled } from '../../../core/otherPlugins';

/** The Homepage plugin — it opens a page of its choosing at startup too. */
export const HOMEPAGE_PLUGIN_ID = 'homepage';

/**
 * The startup switch, or in its place a line on why there is none: with the
 * Homepage plugin on, that plugin decides what opens first, and the way to
 * open the dashboard is to point it there.
 */
export const StartupField: FC<CustomFieldProps> = ({ app, t }) => {
    if (!isPluginEnabled(app, HOMEPAGE_PLUGIN_ID))
        return <FeatureRow id="dashboard.openOnStartup" />;
    return (
        <div className="zenith-settings__hint">
            <Info size={13} />
            {t('dashboard.startup.homepage')}
        </div>
    );
};
