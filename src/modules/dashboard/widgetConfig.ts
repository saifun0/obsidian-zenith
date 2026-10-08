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

/**
 * The key a card's own name is kept under, in its bucket.
 *
 * The bucket is otherwise the widget's: what its fields mean is the widget's
 * business. This one key is the board's — every card that can be named is
 * named the same way — so no widget may use it for anything else.
 */
export const CARD_NAME_KEY = 'cardName';

/** Longest name a card keeps. A header is one line of a narrow card. */
export const MAX_CARD_NAME = 40;

/**
 * The name the user gave a card, or empty when they gave none.
 *
 * Empty is the common case and means "call it what the widget is called": two
 * text cards are both "Text" until someone says which is which.
 */
export function cardNameOf(
    all: Record<string, Record<string, unknown>>,
    instanceId: string
): string {
    const raw = all[instanceId]?.[CARD_NAME_KEY];
    return typeof raw === 'string' ? raw.trim().slice(0, MAX_CARD_NAME) : '';
}

