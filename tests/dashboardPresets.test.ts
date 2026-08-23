import { describe, it, expect } from 'vitest';
import {
    MAX_PRESETS,
    MAX_PRESET_NAME,
    addPreset,
    applyPreset,
    captureLayout,
    cleanPresetName,
    matchesLayout,
    normalizePresets,
    removePreset,
    renamePreset,
    uniquePresetName,
    updatePreset,
    type DashboardPreset,
    type LayoutSnapshot,
} from '../src/modules/dashboard/dashboardPresets';
import { DEFAULT_GRID_CONFIG } from '../src/modules/dashboard/grid/gridTypes';

const NOW = '2026-08-11T10:00:00.000Z';

function snapshot(over: Partial<LayoutSnapshot> = {}): LayoutSnapshot {
    return {
        dashboardLayout: [
            { id: 'tasks.overview', x: 0, y: 0, size: 'lg' },
            { id: 'weather.current', x: 2, y: 0, size: 'sm' },
        ],
        dashboardBundles: [],
        dashboardStackOrder: [],
        hiddenWidgetIds: [],
        dashboardGrid: { ...DEFAULT_GRID_CONFIG },
        ...over,
    };
}

const save = (presets: DashboardPreset[], name: string, snap = snapshot()) =>
    addPreset(presets, name, snap, NOW);

describe('capturing an arrangement', () => {
    it('copies deeply, so a later drag cannot rewrite what was saved', () => {
        const live = snapshot();
        const saved = captureLayout(live);

        live.dashboardLayout[0].x = 3;
        live.dashboardLayout.push({ id: 'clock', x: 0, y: 4, size: 'sm' });
        live.hiddenWidgetIds.push('weather.current');

        expect(saved.dashboardLayout).toHaveLength(2);
        expect(saved.dashboardLayout[0].x).toBe(0);
        expect(saved.hiddenWidgetIds).toEqual([]);
    });

    it('keeps the grid geometry, not just the placement', () => {
        const saved = captureLayout(
            snapshot({ dashboardGrid: { columns: 6, rowHeight: 90, gap: 12, maxWidth: 0 } })
        );
        expect(saved.dashboardGrid).toEqual({ columns: 6, rowHeight: 90, gap: 12, maxWidth: 0 });
    });

    it('repairs a grid config that was edited into nonsense by hand', () => {
        const saved = captureLayout(
            snapshot({ dashboardGrid: { columns: 0, rowHeight: 9999, gap: -4, maxWidth: 920 } })
        );
        expect(saved.dashboardGrid.columns).toBeGreaterThanOrEqual(2);
        expect(saved.dashboardGrid.rowHeight).toBeLessThanOrEqual(200);
        expect(saved.dashboardGrid.gap).toBeGreaterThanOrEqual(0);
    });
});

describe('comparing against what was saved', () => {
    it('calls an untouched dashboard unchanged', () => {
        const snap = snapshot();
        expect(matchesLayout(captureLayout(snap), snap)).toBe(true);
    });

    it('ignores the order the widgets happen to be listed in', () => {
        // Dragging a widget away and back reorders the array while describing
        // exactly the same desk; an asterisk here would never clear.
        const a = snapshot();
        const b = snapshot({ dashboardLayout: [...a.dashboardLayout].reverse() });
        expect(matchesLayout(a, b)).toBe(true);
    });

    it('notices a moved widget, a resized one, and a changed grid', () => {
        const base = snapshot();
        expect(
            matchesLayout(base, snapshot({ dashboardLayout: [{ id: 'tasks.overview', x: 1, y: 0, size: 'lg' }, base.dashboardLayout[1]] }))
        ).toBe(false);
        expect(
            matchesLayout(base, snapshot({ dashboardLayout: [{ ...base.dashboardLayout[0], size: 'md' }, base.dashboardLayout[1]] }))
        ).toBe(false);
        expect(
            matchesLayout(base, snapshot({ dashboardGrid: { ...DEFAULT_GRID_CONFIG, columns: 6 } }))
        ).toBe(false);
    });

    it('notices a hidden widget and a regrouped bundle', () => {
        const base = snapshot();
        expect(matchesLayout(base, snapshot({ hiddenWidgetIds: ['clock'] }))).toBe(false);
        expect(
            matchesLayout(
                base,
                snapshot({
                    dashboardBundles: [
                        { id: 'bundle:1', members: ['clock', 'weather.current'], activeId: 'clock' },
                    ],
                })
            )
        ).toBe(false);
    });

    it('treats the stack order as an order', () => {
        const a = snapshot({ dashboardStackOrder: ['a', 'b'] });
        const b = snapshot({ dashboardStackOrder: ['b', 'a'] });
        expect(matchesLayout(a, b)).toBe(false);
    });
});

describe('naming', () => {
    it('collapses whitespace and caps the length', () => {
        expect(cleanPresetName('  Work   desk  ')).toBe('Work desk');
        expect(cleanPresetName('x'.repeat(200))).toHaveLength(MAX_PRESET_NAME);
    });

    it('numbers a repeat instead of refusing it', () => {
        const one = save([], 'Работа').presets;
        expect(uniquePresetName('Работа', one)).toBe('Работа 2');
        const two = save(one, 'Работа').presets;
        expect(uniquePresetName('Работа', two)).toBe('Работа 3');
    });

    it('compares names case-insensitively', () => {
        const { presets } = save([], 'Work');
        expect(uniquePresetName('work', presets)).toBe('work 2');
    });

    it('lets a preset keep its own name while renaming', () => {
        const { presets, id } = save([], 'Work');
        expect(renamePreset(presets, id, 'Work')[0].name).toBe('Work');
    });

    it('falls back rather than storing a blank name', () => {
        const { presets } = save([], '   ');
        expect(presets[0].name.trim()).not.toBe('');
        // A rename to nothing is a no-op, not an erasure.
        expect(renamePreset(presets, presets[0].id, '  ')[0].name).toBe(presets[0].name);
    });
});

describe('the shelf of saved layouts', () => {
    it('saves, applies and round-trips an arrangement', () => {
        const snap = snapshot({ dashboardGrid: { ...DEFAULT_GRID_CONFIG, columns: 6 } });
        const { presets, id } = save([], 'Работа', snap);
        const applied = applyPreset(presets.find((p) => p.id === id) as DashboardPreset);
        expect(matchesLayout(applied, snap)).toBe(true);
    });

    it('gives every preset its own id', () => {
        const a = save([], 'A').presets;
        const b = save(a, 'B').presets;
        expect(new Set(b.map((p) => p.id)).size).toBe(2);
    });

    it('overwrites one preset without touching the others', () => {
        const first = save([], 'A').presets;
        const { presets: both, id } = save(first, 'B');
        const moved = snapshot({ dashboardLayout: [{ id: 'clock', x: 1, y: 1, size: 'sm' }] });

        const after = updatePreset(both, id, moved, '2026-08-12T00:00:00.000Z');
        const updated = after.find((p) => p.id === id) as DashboardPreset;
        expect(matchesLayout(updated, moved)).toBe(true);
        expect(updated.savedAt).toBe('2026-08-12T00:00:00.000Z');
        expect(matchesLayout(after[0], snapshot())).toBe(true);
    });

    it('deletes by id and leaves the rest alone', () => {
        const a = save([], 'A').presets;
        const { presets: both, id } = save(a, 'B');
        expect(removePreset(both, id).map((p) => p.name)).toEqual(['A']);
        expect(removePreset(both, 'nope')).toHaveLength(2);
    });

    it('drops the oldest once the shelf is full', () => {
        let presets: DashboardPreset[] = [];
        for (let n = 1; n <= MAX_PRESETS + 2; n++) presets = save(presets, `L${n}`).presets;
        expect(presets).toHaveLength(MAX_PRESETS);
        // The two eldest went; the one just saved is still there.
        expect(presets.map((p) => p.name)).not.toContain('L1');
        expect(presets.map((p) => p.name)).toContain(`L${MAX_PRESETS + 2}`);
    });
});

describe('reading presets back off disk', () => {
    it('survives a data.json that says something else entirely', () => {
        expect(normalizePresets(undefined)).toEqual([]);
        expect(normalizePresets('layouts')).toEqual([]);
        expect(normalizePresets([null, 42, 'x'])).toEqual([]);
    });

    it('drops an entry with no arrangement rather than inventing one', () => {
        expect(normalizePresets([{ id: 'a', name: 'A' }])).toEqual([]);
        expect(normalizePresets([{ name: 'no id', dashboardLayout: [] }])).toEqual([]);
    });

    it('keeps a good entry and fills in what it lacks', () => {
        const [preset] = normalizePresets([
            { id: 'layout-1', name: 'Работа', dashboardLayout: [{ id: 'clock', x: 0, y: 0, size: 'sm' }] },
        ]);
        expect(preset.name).toBe('Работа');
        expect(preset.dashboardBundles).toEqual([]);
        expect(preset.hiddenWidgetIds).toEqual([]);
        expect(preset.dashboardGrid).toEqual(DEFAULT_GRID_CONFIG);
    });

    it('throws out malformed items inside an otherwise good preset', () => {
        const [preset] = normalizePresets([
            {
                id: 'layout-1',
                name: 'A',
                dashboardLayout: [{ id: 'clock', x: 0, y: 0, size: 'sm' }, { id: 'broken' }, null],
                hiddenWidgetIds: ['ok', 7],
            },
        ]);
        expect(preset.dashboardLayout).toHaveLength(1);
        expect(preset.hiddenWidgetIds).toEqual(['ok']);
    });

    it('never reads back more than the shelf holds', () => {
        const raw = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => ({
            id: `layout-${i}`,
            name: `L${i}`,
            dashboardLayout: [],
        }));
        expect(normalizePresets(raw)).toHaveLength(MAX_PRESETS);
    });
});
