import { useCallback, useMemo } from 'react';
import { useZenithStore } from '../../store';

/**
 * Settings that belong to one copy of a widget rather than to the widget.
 *
 * A board may hold several pictures, and each shows its own. There is no place
 * on a module's settings page to say *which* copy, so these are edited on the
 * back of the card and stored under the copy's layout id.
 *
 * The bucket is `Record<string, unknown>` in the store because a widget's shape
 * is the widget's business, so every caller passes a `normalize` that turns
 * whatever came back from `data.json` into its own type. Keep that function at module scope: it is
 * a dependency of the memo, and a fresh one each render defeats it.
 */
export function useWidgetConfig<T extends Record<string, unknown>>(
    instanceId: string,
    normalize: (raw: Record<string, unknown> | undefined) => T
): [T, (patch: Partial<T>) => void] {
    const raw = useZenithStore((s) => s.settings.widgetConfig[instanceId]);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const config = useMemo(() => normalize(raw), [raw, normalize]);

    const setConfig = useCallback(
        (patch: Partial<T>) => {
            // Read the whole map at write time rather than subscribing to it:
            // this component would otherwise repaint whenever any other card on
            // the board was configured.
            const all = useZenithStore.getState().settings.widgetConfig;
            updateSettings({
                widgetConfig: {
                    ...all,
                    [instanceId]: { ...(all[instanceId] ?? {}), ...patch },
                },
            });
        },
        [instanceId, updateSettings]
    );

    return [config, setConfig];
}

/**
 * The config map without one copy's bucket.
 *
 * Called when a copy is taken off the board for good. The first copy of a
 * widget is only ever hidden — it keeps its settings, the way a hidden widget
 * keeps its size — but a further copy is genuinely deleted, and leaving its
 * bucket behind would hand its picture to the next copy that happened to be
 * given the same number.
 */
export function withoutWidgetConfig(
    all: Record<string, Record<string, unknown>>,
    instanceId: string
): Record<string, Record<string, unknown>> {
    if (!(instanceId in all)) return all;
    const next = { ...all };
    delete next[instanceId];
    return next;
}
