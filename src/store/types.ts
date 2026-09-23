import type { StateCreator } from 'zustand';
import type { TaskSlice } from './taskSlice';
import type { ContentSlice } from './contentSlice';
import type { JournalSlice } from './journalSlice';
import type { SettingsSlice } from './settingsSlice';
import type { ProjectSlice } from './projectSlice';
import type { NotificationSlice } from './notificationSlice';

/** The full combined store shape. */
export type ZenithStore = TaskSlice &
    ContentSlice &
    JournalSlice &
    SettingsSlice &
    ProjectSlice &
    NotificationSlice;

/**
 * Typed slice creator for the Zenith store.
 *
 * Encodes the `subscribeWithSelector` middleware in the mutator tuple so each
 * slice gets a correctly-typed `set`/`get` without the `as never` casts we
 * used to sprinkle around.
 */
export type ZenithSliceCreator<Slice> = StateCreator<
    ZenithStore,
    [['zustand/subscribeWithSelector', never]],
    [],
    Slice
>;
