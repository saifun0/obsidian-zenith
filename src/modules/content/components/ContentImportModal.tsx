import React, { useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { AlertTriangle, ArrowRight, Download, FileUp, Heart, Loader2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { ContentWriter } from '../services/contentWriter';
import {
    parseImport,
    planImport,
    type ImportPlan,
    type ImportResult,
    type ImportTypeMap,
    type ImportUpdate,
} from '../services/contentImport';
import { statusLabel } from '../contentLabels';
import { useContentTypes } from '../useContentTypes';

interface ContentImportModalProps {
    onClose: () => void;
    onImported?: () => void | Promise<void>;
}

const FORMAT_LABEL: Record<string, string> = {
    mal: 'MyAnimeList',
    goodreads: 'Goodreads',
    letterboxd: 'Letterboxd',
    anixart: 'Anixart',
};

/** Past this many, the lists say "and N more". */
const PREVIEW_ROWS = 8;

/**
 * ContentImportModal — bring a library across from MyAnimeList, Goodreads,
 * Letterboxd or Anixart, and later bring it up to date from a newer export.
 *
 * The export file is parsed locally and nothing is fetched. What it would do
 * is shown in three parts before anything is written: what is new, what is
 * already in the library but has moved on in the export — a status, a
 * favourite — and what is already so. Each update can be left out; one that
 * moves a status backwards ("watched" to "watching") starts left out, since
 * the library is the likelier to be right about that.
 */
export const ContentImportModal: FC<ContentImportModalProps> = ({ onClose, onImported }) => {
    const { app } = useApp();
    const t = useTranslation();
    const contentFolderPath = useZenithStore((s) => s.settings.contentFolderPath);
    const library = useZenithStore((s) => s.contentItems);
    const types = useContentTypes();

    const [fileName, setFileName] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);
    /**
     * What the file would do, worked out once, when it is read. While an import
     * writes, every new note would otherwise move itself from "new" to "same"
     * under the user's eyes.
     */
    const [plan, setPlan] = useState<ImportPlan | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Updates left out, by the item's file. */
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * Which of the user's own types each source maps onto. Custom setups may
     * have renamed or removed the built-ins, so anything missing falls back to
     * a type that certainly exists rather than writing a dangling `type:`.
     */
    const typeMap: ImportTypeMap = useMemo(() => {
        const pick = (id: string) =>
            types.all.some((x) => x.id === id) ? id : types.typeOf(id).id;
        return { anime: pick('anime'), manga: pick('manga'), book: pick('book'), movie: pick('movie') };
    }, [types]);

    const updates = useMemo(
        () => (plan ? plan.update.filter((u) => !skipped.has(u.item.filePath)) : []),
        [plan, skipped]
    );

    const byType = useMemo(() => {
        const counts = new Map<string, number>();
        for (const i of plan?.create ?? []) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
        return [...counts.entries()];
    }, [plan]);

    const readFile = async (file: File) => {
        setError(null);
        setResult(null);
        setPlan(null);
        setFileName(file.name);
        try {
            const parsed = parseImport(await file.text(), typeMap);
            if (!parsed) {
                setError(t('content.import.unrecognised'));
                return;
            }
            const next = planImport(parsed, library);
            // Backward moves start left out; the rest are taken.
            setSkipped(new Set(next.update.filter((u) => u.backward).map((u) => u.item.filePath)));
            setPlan(next);
            setResult(parsed);
        } catch (err) {
            console.error('Zenith: could not read import file:', err);
            setError(t('content.import.unreadable'));
        }
    };

    const toggle = (u: ImportUpdate) =>
        setSkipped((prev) => {
            const next = new Set(prev);
            if (next.has(u.item.filePath)) next.delete(u.item.filePath);
            else next.add(u.item.filePath);
            return next;
        });

    const work = (plan?.create.length ?? 0) + updates.length;

    const runImport = async () => {
        if (!plan || progress) return;
        setProgress({ done: 0, total: work });
        const writer = new ContentWriter(app);
        let done = 0;
        let ok = 0;

        for (const entry of plan.create) {
            try {
                await writer.createItem(contentFolderPath, { ...entry, tags: entry.tags ?? [] });
                ok++;
            } catch (err) {
                console.error('Zenith: could not import item:', entry.title, err);
            }
            setProgress({ done: ++done, total: work });
        }

        // An update writes the status alone: the export has no dates, and
        // stamping today on a status it changed would claim a finish nobody
        // recorded. See the import section of docs/…/content.md.
        for (const u of updates) {
            try {
                await writer.patch(u.item.filePath, {
                    ...(u.status ? { status: u.status } : {}),
                    ...(u.favorite !== undefined ? { favorite: u.favorite ? true : undefined } : {}),
                });
                ok++;
            } catch (err) {
                console.error('Zenith: could not update item:', u.item.title, err);
            }
            setProgress({ done: ++done, total: work });
        }

        setProgress(null);
        await onImported?.();
        new Notice(
            ok === work
                ? t('content.import.doneBoth', {
                      created: plan.create.length,
                      updated: updates.length,
                  })
                : t('content.import.partial', { created: ok, total: work })
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
                disabled={work === 0 || progress != null}
                onClick={() => void runImport()}
            >
                {progress ? <Loader2 size={14} className="zenith-spin" /> : <Download size={14} />}
                {progress
                    ? t('content.import.working', { done: progress.done, total: progress.total })
                    : t('content.import.run', {
                          created: plan?.create.length ?? 0,
                          updated: updates.length,
                      })}
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

                {result && plan && (
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

                        <section className="zenith-import__part">
                            <h4 className="zenith-import__part-title">
                                {t('content.import.new')}
                                <span className="zenith-import__part-count">{plan.create.length}</span>
                            </h4>
                            {byType.length > 0 && (
                                <div className="zenith-import__types">
                                    {byType.map(([id, count]) => {
                                        const cfg = types.typeOf(id);
                                        return (
                                            <span
                                                key={id}
                                                className="zenith-import__type"
                                                style={{ color: cfg.color }}
                                            >
                                                <ObsidianIcon name={cfg.icon} size={13} />
                                                {cfg.label}
                                                <span className="zenith-import__type-count">{count}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            <ul className="zenith-import__preview">
                                {plan.create.slice(0, PREVIEW_ROWS).map((i, n) => (
                                    <li key={`${i.title}-${n}`}>
                                        <span className="zenith-import__preview-title">
                                            {i.favorite && (
                                                <Heart
                                                    size={11}
                                                    className="zenith-import__heart"
                                                    fill="currentColor"
                                                    aria-label={t('content.favorite.filter')}
                                                />
                                            )}
                                            {i.title}
                                        </span>
                                        <span className="zenith-text--muted">
                                            {[
                                                i.year,
                                                i.rating > 0 ? `★ ${i.rating}` : null,
                                                statusLabel(t, i.status, i.type),
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {plan.create.length > PREVIEW_ROWS && (
                                <p className="zenith-text--muted">
                                    {t('common.more', { count: plan.create.length - PREVIEW_ROWS })}
                                </p>
                            )}
                        </section>

                        {plan.update.length > 0 && (
                            <section className="zenith-import__part">
                                <h4 className="zenith-import__part-title">
                                    {t('content.import.updates')}
                                    <span className="zenith-import__part-count">{plan.update.length}</span>
                                </h4>
                                <ul className="zenith-import__updates">
                                    {plan.update.map((u) => (
                                        <li
                                            key={u.item.filePath}
                                            className={u.backward ? 'is-backward' : undefined}
                                        >
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={!skipped.has(u.item.filePath)}
                                                    onChange={() => toggle(u)}
                                                />
                                                <span className="zenith-import__preview-title">
                                                    {u.item.title}
                                                </span>
                                                <span className="zenith-import__change">
                                                    {u.status && (
                                                        <>
                                                            {statusLabel(t, u.item.status, u.item.type)}
                                                            <ArrowRight size={11} />
                                                            {statusLabel(t, u.status, u.item.type)}
                                                        </>
                                                    )}
                                                    {u.favorite !== undefined && (
                                                        <Heart
                                                            size={11}
                                                            className="zenith-import__heart"
                                                            fill={u.favorite ? 'currentColor' : 'none'}
                                                            aria-label={t(
                                                                u.favorite
                                                                    ? 'content.favorite.add'
                                                                    : 'content.favorite.remove'
                                                            )}
                                                        />
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                                {plan.update.some((u) => u.backward) && (
                                    <p className="zenith-import__note">{t('content.import.backward')}</p>
                                )}
                            </section>
                        )}

                        {plan.same > 0 && (
                            <p className="zenith-text--muted">
                                {t.plural('content.import.same', plan.same)}
                            </p>
                        )}
                        <p className="zenith-import__note">{t('content.import.coversNote')}</p>
                    </>
                )}
            </div>
        </Modal>
    );
};
