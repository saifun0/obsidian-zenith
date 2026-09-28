import type { App } from 'obsidian';
import { PromptModal } from '../../../core/PromptModal';
import type { Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { groupSeries } from '../services/series';

/** Every series name in the library, for the name field to offer. */
export function seriesNames(): string[] {
    return [...groupSeries(useZenithStore.getState().contentItems).values()]
        .map((g) => g.name)
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Ask which series to put something in, offering the ones there are. Resolves
 * with the name, or null when the dialog was closed without one.
 */
export async function askSeriesName(app: App, t: Translator, initial: string): Promise<string | null> {
    const name = await new PromptModal(app, {
        title: t('content.series.promptTitle'),
        initial,
        placeholder: t('content.series.promptPlaceholder'),
        confirmText: t('common.save'),
        cancelText: t('common.cancel'),
        maxLength: 200,
        suggestions: seriesNames(),
    }).ask();
    return name?.trim() || null;
}
