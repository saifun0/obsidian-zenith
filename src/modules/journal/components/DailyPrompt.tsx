import React, { useEffect, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { MessageCircleQuestion, CornerDownLeft } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { JournalWriter, journalConfig } from '../services/journalWriter';

/**
 * The day's question, in the check-in block: shown, and written into the note
 * only when asked — a click on the arrow puts it under the day's notes heading
 * as a quote to answer beneath. Nothing counts whether it was.
 */
export const DailyPrompt: FC<{ date: string }> = ({ date }) => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const [prompt, setPrompt] = useState<string | null>(null);

    const promptPath = settings.journalPromptPath;
    const language = settings.language;
    useEffect(() => {
        let live = true;
        const config = journalConfig(useZenithStore.getState().settings);
        void new JournalWriter(app).promptFor(config, date).then((p) => {
            if (live) setPrompt(p);
        });
        return () => {
            live = false;
        };
    }, [app, date, promptPath, language]);

    if (!prompt) return null;

    const insert = async () => {
        const config = journalConfig(settings);
        const writer = new JournalWriter(app);
        try {
            const file = await writer.ensureNote(config, date);
            await writer.appendUnderHeading(file, t('journal.template.notes'), `> ${prompt}\n`);
        } catch (err) {
            console.error('Zenith: could not insert the day’s question:', err);
            new Notice(t('journal.error.write'));
        }
    };

    return (
        <div className="zenith-dblock__prompt">
            <MessageCircleQuestion size={14} />
            <span className="zenith-dblock__prompt-text">{prompt}</span>
            <button
                type="button"
                className="zenith-dblock__nav"
                title={t('journal.prompt.insert')}
                aria-label={t('journal.prompt.insert')}
                onClick={() => void insert()}
            >
                <CornerDownLeft size={14} />
            </button>
        </div>
    );
};
