import React from 'react';
import { SyncApp } from './SyncApp';

/**
 * The sync page, inside settings.
 *
 * It used to be a button here and a whole workspace tab there, which put the
 * state of sync one navigation away from every switch that governs it: you
 * turned something on in settings and then went somewhere else to find out
 * whether it had worked. The page belongs under the fields that configure it,
 * so that is where it is drawn; the tab still exists and opens the same
 * component, for anyone who wants it open beside their notes.
 *
 * A custom field is handed the form's context — values, `set`, the plugin —
 * and this one wants none of it: the page reads the sync services directly,
 * because what it reports is the state of a running thing rather than the
 * contents of a settings bag.
 */
export const SyncSettingsPanel: React.FC = () => <SyncApp embedded />;
