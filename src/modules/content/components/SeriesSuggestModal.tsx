import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { ChevronRight, Layers, Loader2 } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { findSeries, type SeriesProposal } from '../services/series';
import { renameSeries, setItemsSeries } from '../services/contentActions';
import { useLibraryItems } from '../useContentTypes';

interface SeriesSuggestModalProps {
    onClose: () => void;
}

interface Choice {
    proposal: SeriesProposal<ContentItem>;
    name: string;
    on: boolean;
    open: boolean;
}

/**
 * SeriesSuggestModal — "Find series": the series a library holds but has not
 * named, laid out for a look before anything is written.
 *
 * Each proposal is ticked, named after its first part, and can be unticked or
 * renamed; its parts fold out under it. Worked out once, when the dialog opens:
 * recomputed while grouping, every series would leave the list the moment it
 * was written.
 */
export const SeriesSuggestModal: React.FC<SeriesSuggestModalProps> = ({ onClose }) => {
    const { app } = useApp();
    const t = useTranslation();
    const { items } = useLibraryItems();
    const [choices, setChoices] = useState<Choice[]>(() =>
        findSeries(items).map((proposal) => ({ proposal, name: proposal.name, on: true, open: false }))
    );
    const [busy, setBusy] = useState(false);

    const chosen = choices.filter((c) => c.on && c.name.trim());
    const update = (index: number, patch: Partial<Choice>) =>
        setChoices((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));

    const run = async () => {
        if (busy || chosen.length === 0) return;
        setBusy(true);
        try {
            for (const { proposal, name } of chosen) {
                const next = name.trim();
                await setItemsSeries(app, proposal.joining, next);
                // Renamed on the way: the parts it already had take the new name too.
                if (proposal.already.length > 0 && next !== proposal.name) {
                    await renameSeries(app, proposal.already, next);
                }
            }
            new Notice(t('content.series.findDone', { count: chosen.length }));
            onClose();
        } catch (err) {
            console.error('Zenith: could not group series:', err);
            new Notice(t('content.error.series'));
        } finally {
            setBusy(false);
        }
    };

    const footer = (
        <>
            <button type="button" className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
            </button>
            <button
                type="button"
                className="zenith-btn zenith-btn--primary"
                disabled={chosen.length === 0 || busy}
                onClick={() => void run()}
            >
                {busy ? <Loader2 size={14} className="zenith-spin" /> : <Layers size={14} />}
                {t('content.series.findRun', { count: chosen.length })}
            </button>
        </>
    );

    return (
        <Modal
            title={t('content.series.find')}
            onClose={onClose}
            size="md"
            footer={choices.length > 0 ? footer : undefined}
        >
            {choices.length === 0 ? (
                <p className="zenith-text--muted">{t('content.series.findNone')}</p>
            ) : (
                <div className="zenith-seriesfind">
                    <p className="zenith-seriesfind__intro">{t('content.series.findIntro')}</p>
                    <ul className="zenith-seriesfind__list">
                        {choices.map((c, i) => {
                            const count = c.proposal.joining.length + c.proposal.already.length;
                            return (
                                <li key={c.proposal.key} className={c.on ? '' : 'is-off'}>
                                    <div className="zenith-seriesfind__row">
                                        <input
                                            type="checkbox"
                                            checked={c.on}
                                            aria-label={c.name}
                                            onChange={() => update(i, { on: !c.on })}
                                        />
                                        <input
                                            type="text"
                                            className="zenith-input zenith-seriesfind__name"
                                            aria-label={t('content.series.name')}
                                            value={c.name}
                                            onChange={(e) => update(i, { name: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            className={`zenith-seriesfind__count ${c.open ? 'is-open' : ''}`}
                                            aria-expanded={c.open}
                                            onClick={() => update(i, { open: !c.open })}
                                        >
                                            {t.plural('content.series.parts', count)}
                                            <ChevronRight size={13} />
                                        </button>
                                    </div>
                                    {c.open && (
                                        <ul className="zenith-seriesfind__parts">
                                            {c.proposal.joining.map((item) => (
                                                <li key={item.id}>{item.title}</li>
                                            ))}
                                            {c.proposal.already.length > 0 && (
                                                <li className="zenith-text--muted">
                                                    {t('content.series.already', {
                                                        count: c.proposal.already.length,
                                                    })}
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </Modal>
    );
};
