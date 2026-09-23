import React, { useMemo, useState, type FC } from 'react';
import { Plus, Check, LayoutGrid } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { SearchField } from '../../../components/ui/fields';
import { sizeDims, type WidgetSize } from '../grid/gridTypes';
import { useTranslation } from '../../../core/i18n';

export interface AddableWidget {
    id: string;
    label: string;
    icon?: string;
    /** One line on what the widget shows. */
    description?: string;
    defaultSize: WidgetSize;
}

interface AddWidgetSheetProps {
    /** Registered widgets not currently on the grid. */
    widgets: AddableWidget[];
    /** Registered widgets already placed — shown as "added". */
    placed: AddableWidget[];
    /** Live column count, so the footprint preview matches the real grid. */
    columns: number;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
}

/** Show the search box once scanning the list stops being instant. */
const SEARCH_THRESHOLD = 6;

/**
 * The module a widget came from, taken from its namespaced id
 * (`content.overview` → `content`). Widgets without a namespace group together
 * under "Other".
 */
function moduleOf(id: string): string {
    const [head, ...rest] = id.split('.');
    return rest.length > 0 ? head : 'other';
}

function prettyModule(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, ' ');
}

/** A miniature of the widget's footprint on the current grid. */
const Footprint: FC<{ size: WidgetSize; columns: number }> = ({ size, columns }) => {
    const { w, h } = sizeDims(size, columns);
    return (
        <span
            className="zenith-add-sheet__footprint"
            aria-hidden="true"
            style={{
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gridTemplateRows: `repeat(${h}, 1fr)`,
            }}
        >
            {Array.from({ length: columns * h }).map((_, i) => (
                <span
                    key={i}
                    className={`zenith-add-sheet__cell ${i % columns < w ? 'is-filled' : ''}`}
                />
            ))}
        </span>
    );
};

/**
 * The widget gallery shown under the grid while arranging — the equivalent of
 * the picker you get from a long-press on a phone home screen.
 *
 * It lists the *whole* catalogue, not just what's missing: with everything
 * placed the panel used to collapse to a single sentence, which read as though
 * the dashboard had run out of widgets. Placed ones stay visible, marked as
 * added and clickable to take them off the grid again.
 */
export const AddWidgetSheet: FC<AddWidgetSheetProps> = ({
    widgets,
    placed,
    columns,
    onAdd,
    onRemove,
}) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');

    const all = useMemo(
        () => [
            ...widgets.map((w) => ({ ...w, added: false })),
            ...placed.map((w) => ({ ...w, added: true })),
        ],
        [widgets, placed]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (w) =>
                w.label.toLowerCase().includes(q) ||
                w.description?.toLowerCase().includes(q) ||
                w.id.toLowerCase().includes(q)
        );
    }, [all, query]);

    // Grouped by source module, available widgets first within each group.
    const groups = useMemo(() => {
        const map = new Map<string, typeof filtered>();
        for (const w of filtered) {
            const key = moduleOf(w.id);
            map.set(key, [...(map.get(key) ?? []), w]);
        }
        return [...map.entries()]
            .map(([key, items]) => ({
                key,
                label: prettyModule(key),
                items: [...items].sort(
                    (a, b) => Number(a.added) - Number(b.added) || a.label.localeCompare(b.label)
                ),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [filtered]);

    const showSearch = all.length > SEARCH_THRESHOLD;

    return (
        <div className="zenith-add-sheet">
            <div className="zenith-add-sheet__head">
                <div className="zenith-add-sheet__title">
                    {t('dashboard.widgets')}
                    <span className="zenith-add-sheet__count">
                        {widgets.length > 0
                            ? t('dashboard.widgets.available', { count: widgets.length })
                            : t('dashboard.widgets.allAdded')}
                    </span>
                </div>

                {showSearch && (
                    <SearchField
                        size="sm"
                        className="zenith-add-sheet__search"
                        value={query}
                        onChange={setQuery}
                        placeholder={t('dashboard.widgets.searchPlaceholder')}
                    />
                )}
            </div>

            {all.length === 0 ? (
                <div className="zenith-add-sheet__empty">
                    <LayoutGrid size={22} strokeWidth={1.5} />
                    <span>{t('dashboard.widgets.noneRegistered')}</span>
                    <span className="zenith-add-sheet__empty-hint">
                        {t('dashboard.widgets.enableModules')}
                    </span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="zenith-add-sheet__empty">
                    <span>{t('dashboard.widgets.noMatch', { query: query.trim() })}</span>
                </div>
            ) : (
                groups.map((group) => (
                    <section key={group.key} className="zenith-add-sheet__group">
                        {groups.length > 1 && (
                            <div className="zenith-add-sheet__group-label">{group.label}</div>
                        )}
                        <div className="zenith-add-sheet__list">
                            {group.items.map((w) => (
                                <button
                                    key={w.id}
                                    type="button"
                                    className={`zenith-add-sheet__item ${w.added ? 'is-added' : ''}`}
                                    onClick={() => (w.added ? onRemove(w.id) : onAdd(w.id))}
                                    title={
                                        w.added
                                            ? t('dashboard.widget.removeFromDashboard')
                                            : `${t('common.add')} — ${w.label}`
                                    }
                                >
                                    <span className="zenith-add-sheet__icon">
                                        <DynamicIcon name={w.icon} fallback={LayoutGrid} size={15} />
                                    </span>

                                    <span className="zenith-add-sheet__text">
                                        <span className="zenith-add-sheet__name">{w.label}</span>
                                        <span className="zenith-add-sheet__meta">
                                            {w.description ??
                                                t('dashboard.widgets.startsAt', {
                                                    size: w.defaultSize.toUpperCase(),
                                                })}
                                        </span>
                                    </span>

                                    <Footprint size={w.defaultSize} columns={columns} />

                                    <span className="zenith-add-sheet__action">
                                        {w.added ? <Check size={14} /> : <Plus size={14} />}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
};
