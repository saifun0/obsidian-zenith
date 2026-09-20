import React, { useCallback, useEffect, useState } from 'react';
import { Check, FileWarning, Merge, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { SyncSection } from './SyncSection';
import { vaultModuleFs } from '../../../core/moduleFs';
import { ConflictInbox, type InboxEntry } from '../services/conflictInbox';
import { openFileAtLine } from '../../../core/openInVault';

/**
 * Conflict copies lying around the vault, whoever left them.
 *
 * Deliberately independent of whether Zenith's own file engine is switched on:
 * these are usually somebody else's leftovers — Remotely Save, Syncthing,
 * iCloud — and the reason to surface them is that nothing else ever will. They
 * sit there silently until the user stumbles on one and has to work out from
 * memory which half was current.
 */
export const ConflictInboxPanel: React.FC = () => {
    const t = useTranslation();
    const { app } = useApp();

    const [entries, setEntries] = useState<InboxEntry[]>([]);
    const [scanning, setScanning] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [scanned, setScanned] = useState(false);

    const inbox = useCallback(() => new ConflictInbox(vaultModuleFs(app.vault.adapter)), [app]);

    const scan = useCallback(async () => {
        setScanning(true);
        setNote(null);
        try {
            setEntries(await inbox().scan(''));
            setScanned(true);
        } finally {
            setScanning(false);
        }
    }, [inbox]);

    // Scanned once on open rather than on a timer: it walks the whole vault, and
    // conflict copies appear at the speed of a sync run, not of a keystroke.
    useEffect(() => {
        void scan();
    }, [scan]);

    const act = async (entry: InboxEntry, what: 'reconcile' | 'original' | 'copy') => {
        const box = inbox();
        if (what === 'reconcile') {
            const result = await box.reconcile(entry);
            setNote(
                result.kind === 'merged'
                    ? t('inbox.reconciled', { name: entry.originalPath })
                    : t(`inbox.unmergeable.${result.reason ?? 'prose_diverged'}`)
            );
            // A refusal changed nothing, so the row stays — there is still a
            // decision to make about it.
            if (result.kind !== 'merged') return;
        } else if (what === 'original') {
            await box.keepOriginal(entry);
            setNote(t('inbox.keptOriginal', { name: entry.originalPath }));
        } else {
            await box.keepCopy(entry);
            setNote(t('inbox.keptCopy', { name: entry.originalPath }));
        }
        setEntries((current) => current.filter((e) => e.path !== entry.path));
    };

    // Nothing to say when the vault is clean — an empty card every time would be
    // noise on a page that is mostly about other things.
    if (scanned && entries.length === 0 && !note) return null;

    return (
        <SyncSection title={t('inbox.title')}>
            <p className="zenith-sync__hint">{t('inbox.desc')}</p>

            {note && (
                <p className="zenith-sync__hint">
                    <Check size={14} /> {note}
                </p>
            )}

            {entries.length === 0 ? (
                <p className="zenith-sync__hint">
                    <Check size={14} /> {t('inbox.empty')}
                </p>
            ) : (
                <ul className="zenith-sync__list">
                    {entries.map((entry) => (
                        <li key={entry.path} className="zenith-sync__inboxRow">
                            <FileWarning size={14} className="zenith-sync__inboxIcon" />
                            <div className="zenith-sync__inboxText">
                                {/* A button, not a bare anchor: it opens a file in the
                                    vault rather than going to a URL, and an
                                    anchor with no href cannot be reached from
                                    the keyboard — which on this panel made the
                                    one control naming WHICH file is in question
                                    unreachable. */}
                                <button
                                    type="button"
                                    className="zenith-sync__inboxPath"
                                    onClick={() => void openFileAtLine(app, entry.path)}
                                >
                                    {entry.path}
                                </button>
                                <span className="zenith-sync__peerMeta">
                                    {t(`inbox.source.${entry.source}`)}
                                    {' · '}
                                    {entry.originalExists
                                        ? t('inbox.pairedWith', { name: entry.originalPath })
                                        : t('inbox.orphan')}
                                </span>
                            </div>
                            <div className="zenith-sync__inboxActions">
                                {entry.originalExists && (
                                    <button
                                        type="button"
                                        className="zenith-sync__btn is-primary"
                                        onClick={() => void act(entry, 'reconcile')}
                                    >
                                        <Merge size={13} />
                                        {t('inbox.reconcile')}
                                    </button>
                                )}
                                {entry.originalExists && (
                                    <button
                                        type="button"
                                        className="zenith-sync__btn"
                                        onClick={() => void act(entry, 'copy')}
                                    >
                                        {t('inbox.keepCopy')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="zenith-sync__btn"
                                    onClick={() => void act(entry, 'original')}
                                >
                                    <Trash2 size={13} />
                                    {t('inbox.discardCopy')}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div className="zenith-sync__actions">
                <button
                    type="button"
                    className="zenith-sync__btn"
                    onClick={() => void scan()}
                    disabled={scanning}
                >
                    <RefreshCw size={13} className={scanning ? 'is-spinning' : undefined} />
                    {t('inbox.rescan')}
                </button>
            </div>
        </SyncSection>
    );
};
