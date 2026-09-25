import { describe, it, expect } from 'vitest';
import { configurableModules, type ModuleMenuEntry } from '../src/settings/moduleMenu';

const mod = (id: string, over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id,
    name: id,
    description: `${id} does things`,
    ...over,
});

const ALL = [
    mod('weather'),
    mod('dashboard'),
    mod('tasks'),
    mod('quiet'),
    mod('prayer', { name: 'Prayer' }),
];

/** Everything but `quiet` has a settings page. */
const hasSettings = (id: string) => id !== 'quiet';

describe('which modules get a row in the settings front door', () => {
    it('offers the active ones that have settings', () => {
        const ids = configurableModules(ALL, ['weather', 'tasks'], hasSettings).map((m) => m.id);
        expect(ids).toEqual(['tasks', 'weather']);
    });

    it('leaves out a module that is switched off', () => {
        // Its settings change nothing while it is off, so the row goes nowhere.
        const ids = configurableModules(ALL, ['weather'], hasSettings).map((m) => m.id);
        expect(ids).not.toContain('dashboard');
    });

    it('leaves out a module with nothing to configure', () => {
        // A row that opens "nothing to configure here" is a worse answer than
        // no row at all.
        const ids = configurableModules(ALL, ['weather', 'quiet'], hasSettings).map((m) => m.id);
        expect(ids).toEqual(['weather']);
    });

    it('sorts by name', () => {
        // Stable regardless of what order the registry hands them back.
        const ids = configurableModules(ALL, ['weather', 'prayer', 'dashboard'], hasSettings).map(
            (m) => m.id
        );

        expect(ids).toEqual(['dashboard', 'prayer', 'weather']);
    });

    it('is empty when nothing is active', () => {
        expect(configurableModules(ALL, [], hasSettings)).toEqual([]);
    });

    it('ignores an active id that names no module at all', () => {
        // A module an older Zenith had leaves its id behind in the settings,
        // and the list is built from what is there now.
        expect(configurableModules(ALL, ['long-gone'], hasSettings)).toEqual([]);
    });
});
