import { Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import { getTodayString } from '../../core/dateUtils';
import { translate, translateNow, translatorNow } from '../../core/i18n';
import type { SearchSource } from '../search/searchSources';
import { JournalWriter, journalConfig } from './services/journalWriter';
import { openDailyNote } from './services/journalActions';
import { parseJournalQuery } from './services/journalQuery';
import type ZenithPlugin from '../../main';

/**
 * What Search finds of the journal: a day's note, by its date — "вчера",
 * "пн", "12 сентября" — and "журнал …" to jot a line into today's.
 *
 * By date only, not by what the notes say: searching the text of every day
 * ever written is Obsidian's own search, and here it would be noise and a
 * wait on a big vault.
 */

/** "Note for 23 September", and the weekday on its own — "за среда" is not Russian. */
function dayRow(date: string): { title: string; detail: string } {
    const t = translatorNow();
    const d = new Date(`${date}T00:00:00`);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const text = d.toLocaleDateString(t.locale, {
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
    return {
        title: t('search.journal.note', { date: text }),
        detail: d.toLocaleDateString(t.locale, { weekday: 'long' }),
    };
}

/** `- 14:32 text`, under the note's Notes heading. */
async function jot(plugin: ZenithPlugin, text: string): Promise<void> {
    const config = journalConfig(useZenithStore.getState().settings);
    try {
        const writer = new JournalWriter(plugin.app);
        const file = await writer.ensureNote(config, getTodayString());
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        await writer.appendUnderHeading(
            file,
            translate(config.locale, 'journal.template.notes'),
            `- ${time} ${text}\n`
        );
        new Notice(translateNow('search.created.journal'));
    } catch (err) {
        console.error('Zenith: failed to write to the journal from Search:', err);
        new Notice(translate(config.locale, 'journal.error.create'));
    }
}

export function journalSearchSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'journal',
        labelKey: 'module.journal.name',
        icon: 'calendar-days',
        order: 60,
        suggest: (query) => {
            const date = parseJournalQuery(query, getTodayString());
            if (!date) return [];
            return [
                {
                    id: `journal:${date}`,
                    ...dayRow(date),
                    // "Yesterday" means another day tomorrow.
                    transient: true,
                    run: async () => {
                        await openDailyNote(plugin.app, useZenithStore.getState().settings, date);
                    },
                },
            ];
        },
        creators: () => [
            {
                keywords: ['журнал', 'дневник', 'journal', 'diary'],
                row: (text) => ({
                    title: text,
                    label: translatorNow()('search.create.journal'),
                    icon: 'notebook-pen',
                    run: () => jot(plugin, text),
                }),
            },
        ],
    };
}
