import React, { useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { AlertTriangle, Download, FileUp, Loader2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { Modal } from '../../../components/shared/Modal';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { ContentWriter } from '../services/contentWriter';
import { findDuplicates } from '../services/contentDuplicates';
import { parseImport, type ImportResult, type ImportTypeMap, type ImportedItem } from '../services/contentImport';

interface ContentImportModalProps {
    onClose: () => void;
    onImported?: () => void | Promise<void>;
}

const FORMAT_LABEL: Record<string, string> = {
    mal: 'MyAnimeList',
    goodreads: 'Goodreads',
    letterboxd: 'Letterboxd',
};

/**
 * ContentImportModal — bring a library across from MyAnimeList, Goodreads or
 * Letterboxd.
 *
 * The export file is parsed locally and nothing is fetched: an import of 400
 * books that also went looking for 400 covers would take a quarter of an hour
 * and hammer an API that asked for none of it. Covers and synopses are what the
 * per-item "refresh metadata" action is for.
 *
 * Existing titles are skipped by default, so re-importing an updated export
 * tops the library up instead of doubling it.
 */
export const ContentImportModal: FC<ContentImportModalProps> = ({ onClose, onImported }) => {
    const { app } = useApp();
    const t = useTranslation();
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
    const existingItems = useZenithStore((s) => s.contentItems);
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);

    const [fileName, setFileName] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [skipExisting, setSkipExisting] = useState(true);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * Which of the user's own types each source maps onto. Custom setups may
     * have renamed or removed the built-ins, so anything missing falls back to
     * a type that certainly exists rather than writing a dangling `type:`.
     */
    const typeMap: ImportTypeMap = useMemo(() => {
        const pick = (id: string) => (types.some((x) => x.id === id) ? id : resolveContentType(types, id).id);
        return { anime: pick('anime'), manga: pick('manga'), book: pick('book'), movie: pick('movie') };
    }, [types]);

    /** Entries that would land, after the "skip what I already have" filter. */
    const toImport = useMemo(() => {
        if (!result) return [];
        if (!skipExisting) return result.items;
        return result.items.filter(
            (i) => !findDuplicates(existingItems, i.title, i.type).some((d) => d.kind === 'exact')
        );
    }, [result, skipExisting, existingItems]);

    const byType = useMemo(() => {
        const counts = new Map<string, number>();
        for (const i of toImport) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
        return [...counts.entries()];
    }, [toImport]);

    const readFile = async (file: File) => {
        setError(null);
        setResult(null);
        setFileName(file.name);
        try {
            const parsed = parseImport(await file.text(), typeMap);
            if (!parsed) {
                setError(t('content.import.unrecognised'));
                return;
            }
            setResult(parsed);
        } catch (err) {
            console.error('Zenith: could not read import file:', err);
            setError(t('content.import.unreadable'));
        }
    };

    const runImport = async () => {
        if (!result || progress) return;
        setProgress({ done: 0, total: toImport.length });
        const writer = new ContentWriter(app);
        let created = 0;

        for (const [index, entry] of toImport.entries()) {
            try {
                await writer.createItem(contentFolderPath, itemInput(entry));
                created++;
            } catch (err) {
                console.error('Zenith: could not import item:', entry.title, err);
            }
            setProgress({ done: index + 1, total: toImport.length });
        }

        setProgress(null);
        await onImported?.();
        new Notice(
            created === toImport.length
                ? t.plural('content.import.done', created)
                : t('content.import.partial', { created, total: toImport.length })
        );
        onClose();
    };

    const footer = (
        <>
            <button type="button" className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
            </button>
            <button
                type="button"
                className="zenith-btn zenith-btn--primary"
                disabled={toImport.length === 0 || progress != null}
                onClick={() => void runImport()}
            >
                {progress ? <Loader2 size={14} className="zenith-spin" /> : <Download size={14} />}
                {progress
                    ? t('content.import.working', { done: progress.done, total: progress.total })
                    : t.plural('content.import.action', toImport.length)}
            </button>
        </>
    );

    return (
        <Modal title={t('content.import.title')} onClose={onClose} size="md" footer={footer}>
            <div className="zenith-import">
                <p className="zenith-import__intro">{t('content.import.intro')}</p>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.xml,text/csv,text/xml"
                    className="zenith-import__file"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void readFile(file);
                    }}
                />
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-import__pick"
                    onClick={() => inputRef.current?.click()}
                >
                    <FileUp size={15} />
                    {fileName || t('content.import.choose')}
                </button>

                {error && (
                    <p className="zenith-import__error">
                        <AlertTriangle size={13} /> {error}
                    </p>
                )}

                {result && (
                    <>
                        <div className="zenith-import__summary">
                            <span className="zenith-import__badge">{FORMAT_LABEL[result.format]}</span>
                            <span>{t.plural('content.import.found', result.items.length)}</span>
                            {result.skipped > 0 && (
                                <span className="zenith-text--muted">
                                    {t.plural('content.import.skippedRows', result.skipped)}
                                </span>
                            )}
                        </div>

                        <label className="zenith-import__option">
                            <input
                                type="checkbox"
                                checked={skipExisting}
                                onChange={(e) => setSkipExisting(e.target.checked)}
                            />
                            {t('content.import.skipExisting')}
                        </label>

                        <div className="zenith-import__types">
                            {byType.map(([id, count]) => {
                                const cfg = resolveContentType(types, id);
                                return (
                                    <span key={id} className="zenith-import__type" style={{ color: cfg.color }}>
                                        <ObsidianIcon name={cfg.icon} size={13} />
                                        {cfg.label}
                                        <span className="zenith-import__type-count">{count}</span>
                                    </span>
                                );
                            })}
                        </div>

                        <ul className="zenith-import__preview">
                            {toImport.slice(0, 8).map((i, n) => (
                                <li key={`${i.title}-${n}`}>
                                    <span className="zenith-import__preview-title">{i.title}</span>
                                    <span className="zenith-text--muted">
                                        {[i.year, i.rating > 0 ? `★ ${i.rating}` : null, i.status]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {toImport.length > 8 && (
                            <p className="zenith-text--muted">
                                {t('common.more', { count: toImport.length - 8 })}
                            </p>
                        )}
                        <p className="zenith-import__note">{t('content.import.coversNote')}</p>
                    </>
                )}
            </div>
        </Modal>
    );
};

/** An imported entry as `createItem` wants it. */
function itemInput(entry: ImportedItem) {
    return {
        ...entry,
        tags: entry.tags ?? [],
    };
}
