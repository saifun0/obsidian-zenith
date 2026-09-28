import React, { useEffect, useMemo, useState } from 'react';
import { Notice } from 'obsidian';
import { GripVertical, Pencil, Plus, Search, Unlink, X } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import { useApp } from '../../../context/AppContext';
import { ConfirmModal } from '../../../core/ConfirmModal';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { groupSeries, partTitle, seriesKey, seriesProgress } from '../services/series';
import { renameSeries, setItemsSeries, setSeriesOrder } from '../services/contentActions';
import { STATUS_COLOR, STATUS_ORDER, statusLabel } from '../contentLabels';
import { useLibraryItems } from '../useContentTypes';
import { useSortableRows, type SortableRow } from '../../tasks/components/useSortableRows';
import type { DropPosition } from '../../tasks/services/taskMove';
import { ContentRow } from './ContentRow';
import { SeriesArt, useSeriesSub } from './SeriesRow';

interface SeriesModalProps {
    /** The series' key — `seriesKey(name)` — which a rename keeps. */
    seriesKey: string;
    onClose: () => void;
    /** Open one part's card; the series gives way to it. */
    onOpenItem: (item: ContentItem) => void;
    /** Add a new item to this series; the series gives way to the add form. */
    onCreatePart?: (name: string, typeId: string) => void;
    /** The series was renamed to a name with another key; the page follows it. */
    onRenamed?: (key: string) => void;
}

/** Search results offered for "add a part", at most. */
const ADD_LIMIT = 8;

/**
 * SeriesModal — one series' own page: how far through it is, and every part
 * in order.
 *
 * Reading is the default — the parts are ordinary rows, with their "+1" and
 * heart, and a tap opens one. "Edit" turns the same list into the series'
 * workbench: the name, the order by dragging, taking a part out, adding one
 * from the library or a new one, and ungrouping it all. Kept behind the one
 * button so the page you come back to most stays a list rather than a form.
 */
export const SeriesModal: React.FC<SeriesModalProps> = ({
    seriesKey: key,
    onClose,
    onOpenItem,
    onCreatePart,
    onRenamed,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const { items, types } = useLibraryItems();
    const group = useMemo(() => groupSeries(items).get(key), [items, key]);
    const parts = useMemo(() => group?.items ?? [], [group]);
    const name = group?.name ?? '';

    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [query, setQuery] = useState('');

    // Ungrouped, or its last part taken out: there is no series left to show.
    useEffect(() => {
        if (!group) onClose();
    }, [group, onClose]);

    const sub = useSeriesSub(parts, types.typeOf);
    const { done, total, byStatus } = seriesProgress(parts);
    const oneType = new Set(parts.map((p) => p.type)).size === 1 ? parts[0]?.type : undefined;

    const fail = (err: unknown) => {
        console.error('Zenith: series change failed:', err);
        new Notice(t('content.error.series'));
    };

    // ── Order ───────────────────────────────────────────────────────────────
    const rows: SortableRow[] = useMemo(
        () => parts.map((p) => ({ key: p.id, filePath: p.filePath, lineNumber: 0 })),
        [parts]
    );
    const move = (source: SortableRow, target: SortableRow, position: DropPosition) => {
        const order = parts.filter((p) => p.id !== source.key);
        const moved = parts.find((p) => p.id === source.key);
        const at = order.findIndex((p) => p.id === target.key);
        if (!moved || at < 0) return;
        order.splice(position === 'before' ? at : at + 1, 0, moved);
        setSeriesOrder(app, order).catch(fail);
    };
    const sortable = useSortableRows({ rows, onMove: move, disabled: !editing });

    // ── Name ────────────────────────────────────────────────────────────────
    const commitName = () => {
        const next = draftName.trim();
        if (!next || next === name) {
            setDraftName(name);
            return;
        }
        // A new spelling of the same name keeps the key; a new name moves the
        // page along with the series.
        renameSeries(app, parts, next).catch(fail);
        const nextKey = seriesKey(next);
        if (nextKey !== key) {
            if (onRenamed) onRenamed(nextKey);
            else onClose();
        }
    };

    // ── Adding ──────────────────────────────────────────────────────────────
    const q = query.trim().toLowerCase();
    const candidates = useMemo(() => {
        if (!q) return [];
        return items
            .filter(
                (i) =>
                    !(i.series && seriesKey(i.series) === key) &&
                    (i.title.toLowerCase().includes(q) || i.aliases?.some((a) => a.toLowerCase().includes(q)))
            )
            .slice(0, ADD_LIMIT);
    }, [items, q, key]);

    const add = (item: ContentItem) => {
        setQuery('');
        setItemsSeries(app, [item], name).catch(fail);
    };

    const remove = (item: ContentItem) => {
        setItemsSeries(app, [item], undefined).catch(fail);
    };

    const ungroup = async () => {
        const ok = await new ConfirmModal(app, {
            title: t('content.series.ungroup'),
            body: t('content.series.ungroupConfirm', { name }),
            confirmText: t('content.series.ungroup'),
            cancelText: t('common.cancel'),
        }).ask();
        if (!ok) return;
        await setItemsSeries(app, parts, undefined).catch(fail);
        onClose();
    };

    if (!group) return null;

    const header = (
        <div className="zenith-series__head">
            <SeriesArt parts={parts} typeOf={types.typeOf} className="zenith-series__art" iconSize={26} />
            <div className="zenith-series__heading">
                {editing ? (
                    <input
                        type="text"
                        className="zenith-input zenith-series__name-input"
                        aria-label={t('content.series.name')}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                    />
                ) : (
                    <h2 className="zenith-dialog__title zenith-series__name">{name}</h2>
                )}
                <span className="zenith-series__sub">{sub}</span>
            </div>
        </div>
    );

    return (
        <Modal title={name} header={header} onClose={onClose} size="md" className="zenith-series">
            <div className="zenith-series__summary">
                <span className="zenith-series__done">
                    {t('content.series.doneOf', {
                        status: statusLabel(t, 'completed', oneType),
                        done,
                        total,
                    })}
                </span>
                <span className="zenith-cstats__stack zenith-series__stack" aria-hidden="true">
                    {STATUS_ORDER.filter((s) => byStatus[s]).map((s) => (
                        <span
                            key={s}
                            title={`${statusLabel(t, s, oneType)}: ${byStatus[s]}`}
                            style={{ flexGrow: byStatus[s], background: STATUS_COLOR[s] }}
                        />
                    ))}
                </span>
                <button
                    type="button"
                    className={`zenith-btn zenith-btn--ghost zenith-series__edit ${editing ? 'is-active' : ''}`}
                    aria-pressed={editing}
                    onClick={() => {
                        if (editing) commitName();
                        else setDraftName(name);
                        setEditing((on) => !on);
                        setQuery('');
                    }}
                >
                    {!editing && <Pencil size={13} />}
                    {t(editing ? 'content.series.editDone' : 'content.series.edit')}
                </button>
            </div>

            <div className={`zenith-series__parts ${editing ? 'is-editing' : ''}`}>
                {parts.map((part) => {
                    const drop =
                        sortable.dropTarget?.kind === 'row' && sortable.dropTarget.key === part.id
                            ? ` is-drop-${sortable.dropTarget.position}`
                            : '';
                    return (
                        <div
                            key={part.id}
                            ref={sortable.registerRow(part.id)}
                            className={`zenith-series__part${sortable.dragKey === part.id ? ' is-dragging' : ''}${drop}`}
                        >
                            {editing && (
                                <span
                                    className="zenith-series__grip"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={t('content.series.drag')}
                                    title={t('content.series.drag')}
                                    {...sortable.handleProps(part.id)}
                                >
                                    <GripVertical size={14} />
                                </span>
                            )}
                            <ContentRow
                                item={part}
                                type={types.typeOf(part.type)}
                                title={partTitle(part.title, name)}
                                onOpen={onOpenItem}
                            />
                            {editing && (
                                <button
                                    type="button"
                                    className="zenith-series__remove"
                                    aria-label={t('content.series.remove')}
                                    title={t('content.series.remove')}
                                    onClick={() => remove(part)}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {editing && (
                <div className="zenith-series__tools">
                    <div className="zenith-series__add">
                        <span className="zenith-series__add-field">
                            <Search size={13} />
                            <input
                                type="text"
                                className="zenith-input"
                                aria-label={t('content.series.addPart')}
                                placeholder={t('content.series.addSearch')}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </span>
                        {q && (
                            <ul className="zenith-series__found">
                                {candidates.length === 0 ? (
                                    <li className="zenith-text--muted">{t('content.series.addNone')}</li>
                                ) : (
                                    candidates.map((c) => (
                                        <li key={c.id}>
                                            <button type="button" onClick={() => add(c)}>
                                                <Plus size={13} />
                                                <span className="zenith-series__found-title">{c.title}</span>
                                                {c.series && <span className="zenith-text--muted">{c.series}</span>}
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                    <div className="zenith-series__actions">
                        {onCreatePart && (
                            <button
                                type="button"
                                className="zenith-btn zenith-btn--ghost"
                                onClick={() => onCreatePart(name, oneType ?? parts[0].type)}
                            >
                                <Plus size={14} /> {t('content.series.createPart')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="zenith-btn zenith-btn--ghost zenith-series__ungroup"
                            onClick={() => void ungroup()}
                        >
                            <Unlink size={14} /> {t('content.series.ungroup')}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};
