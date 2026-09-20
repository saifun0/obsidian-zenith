import React from 'react';
import { SyncApp } from './SyncApp';

/**
 * The sync record, inside settings.
 *
 * What it holds is what somebody asks about sitting down: which devices there
 * are, what has been sent and received, what collided. The doing — sync now,
 * force a direction — moved to the ribbon's dialog, so this page no longer
 * carries a button that starts anything.
 *
 * A custom field is handed the form's context — values, `set`, the plugin —
 * and this one wants none of it: the page reads the sync services directly,
 * because what it reports is the state of a running thing rather than the
 * contents of a settings bag.
 */
export const SyncSettingsPanel: React.FC = () => <SyncApp />;
