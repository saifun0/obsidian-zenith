import { useSyncExternalStore, type ComponentType } from 'react';
import type { Task } from '../../store/taskSlice';
import type { ContentItem } from '../../store/contentSlice';

/**
 * The places a third-party module can reach into Zenith's own modules.
 *
 * Each is a list of registrations that a built-in view reads and draws, the
 * way the dashboard reads its widgets: the module hands over data or a
 * renderer, and Zenith decides where it goes. Nothing here lets a module
 * patch a built-in's internals, and every registration is taken back when
 * its module unloads.
 */

/** Named places in built-in views that draw what modules register for them. */
export const SLOT_IDS = [
    'tasks.item.afterTitle',
    'journal.day.afterTrackers',
    'prayer.day.afterList',
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** Built-in pieces a module may draw instead — Zenith's own comes back if it fails. */
export const REPLACEABLE_IDS = ['journal.day.prompt'] as const;
export type ReplaceableId = (typeof REPLACEABLE_IDS)[number];

/**
 * How a module draws: a React component (sharing Zenith's React through
 * `require('react')`), or a plain DOM callback returning its own cleanup.
 */
export interface Renderer<P> {
    component?: ComponentType<P>;
    mount?: (el: HTMLElement, props: P) => void | (() => void);
}

interface Entry {
    /** The module that registered it — for clean-up, attribution and blame. */
    moduleId: string;
    /** Unique within the module. */
    id: string;
    /** Lower first. */
    order?: number;
}

export interface SlotEntry extends Entry, Renderer<Record<string, unknown>> {
    slot: SlotId;
}

export interface ReplacementEntry extends Entry, Renderer<Record<string, unknown>> {
    target: ReplaceableId;
}

export interface TaskActionEntry extends Entry {
    label: string;
    icon?: string;
    /** Offered only for the tasks it answers yes for. */
    when?: (task: Task) => boolean;
    run: (task: Task) => void | Promise<void>;
}

export interface TaskFilterEntry extends Entry {
    label: string;
    test: (task: Task) => boolean;
}

/** A read-only event on the calendar — shown, never edited or written back. */
export interface CalendarLayerEvent {
    title: string;
    /** `YYYY-MM-DD`. */
    date: string;
    /** `HH:MM`, for an event at a time of day. */
    time?: string;
    endTime?: string;
    /** Opened when the event is clicked. */
    url?: string;
}

export interface CalendarLayerEntry extends Entry {
    label: string;
    color?: string;
    /** Events from `from` to `to`, both `YYYY-MM-DD` and included. */
    events: (from: string, to: string) => Promise<CalendarLayerEvent[]> | CalendarLayerEvent[];
}

/** What a metadata provider fills in — each field optional, the user reviews before saving. */
export type MetadataResult = Partial<
    Pick<
        ContentItem,
        'title' | 'creator' | 'year' | 'coverImage' | 'genres' | 'description' | 'progressTotal'
    >
> & { title: string };

export interface MetadataProviderEntry extends Entry {
    label: string;
    /** Content types it knows, by id; all when absent. */
    types?: string[];
    search: (query: string, typeId: string) => Promise<MetadataResult[]>;
}

/** A day's times as `HH:MM`, by prayer — sunrise included. */
export type ProviderTimes = Record<
    'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha',
    string
>;

export interface PrayerProviderEntry extends Entry {
    label: string;
    /** A whole year's times for a place, by `YYYY-MM-DD` — cached like Zenith's own tables. */
    year: (
        year: number,
        place: { lat: number; lon: number; name?: string }
    ) => Promise<Record<string, ProviderTimes>>;
}

export interface SettingsSectionEntry extends Entry, Renderer<Record<string, unknown>> {
    /** The built-in module whose settings page it joins. */
    targetModule: string;
    title: string;
}

type Listener = () => void;

/** A list of registrations with change notification — what each extension point is. */
export class ExtensionRegistry<T extends Entry> {
    private items: T[] = [];
    private readonly listeners = new Set<Listener>();

    add(item: T): () => void {
        this.items = [
            ...this.items.filter((i) => !(i.moduleId === item.moduleId && i.id === item.id)),
            item,
        ].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
        this.emit();
        return () => {
            const before = this.items.length;
            this.items = this.items.filter((i) => i !== item);
            if (this.items.length !== before) this.emit();
        };
    }

    list(): readonly T[] {
        return this.items;
    }

    /** Everything one module registered, gone at once — on unload, or when it is switched off for failing. */
    removeModule(moduleId: string): void {
        const before = this.items.length;
        this.items = this.items.filter((i) => i.moduleId !== moduleId);
        if (this.items.length !== before) this.emit();
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private emit(): void {
        this.listeners.forEach((l) => l());
    }
}

export const extensions = {
    slots: new ExtensionRegistry<SlotEntry>(),
    replacements: new ExtensionRegistry<ReplacementEntry>(),
    taskActions: new ExtensionRegistry<TaskActionEntry>(),
    taskFilters: new ExtensionRegistry<TaskFilterEntry>(),
    calendarLayers: new ExtensionRegistry<CalendarLayerEntry>(),
    metadataProviders: new ExtensionRegistry<MetadataProviderEntry>(),
    prayerProviders: new ExtensionRegistry<PrayerProviderEntry>(),
    settingsSections: new ExtensionRegistry<SettingsSectionEntry>(),
};

/** Take back everything a module registered anywhere. */
export function removeModuleExtensions(moduleId: string): void {
    for (const registry of Object.values(extensions)) registry.removeModule(moduleId);
}

/** A registry's current list, re-rendering when it changes. */
export function useExtensions<T extends Entry>(registry: ExtensionRegistry<T>): readonly T[] {
    return useSyncExternalStore(registry.subscribe, () => registry.list());
}
