import React, { type FC } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';

export type ArrangeTab = 'widgets' | 'grid' | 'presets';

interface ArrangePanelProps {
    tab: ArrangeTab;
    onTab: (tab: ArrangeTab) => void;
    onClose: () => void;
    /** The gallery of widgets. */
    widgets: React.ReactNode;
    /** The grid's own geometry. */
    grid: React.ReactNode;
    /** Saved arrangements; absent while that feature is off. */
    presets?: React.ReactNode;
}

/**
 * Everything arranging needs that is not the board itself, in one panel beside
 * it: the gallery of widgets, the grid's geometry, the saved arrangements.
 *
 * They used to be three bars under the board — which is the one place a board
 * being arranged cannot be seen from. Adding a widget meant scrolling down to
 * the gallery and back up to find where it had landed. Beside the board, the
 * panel and the thing it changes are on screen together.
 *
 * One panel with three sections rather than three panels: only one of the
 * three errands is ever under way, and a board with three panels open has no
 * room left to be a board.
 */
export const ArrangePanel: FC<ArrangePanelProps> = ({
    tab,
    onTab,
    onClose,
    widgets,
    grid,
    presets,
}) => {
    const t = useTranslation();
    const tabs: Array<{ id: ArrangeTab; label: string; body: React.ReactNode }> = [
        { id: 'widgets', label: t('dashboard.widgets'), body: widgets },
        { id: 'grid', label: t('dashboard.grid'), body: grid },
        ...(presets
            ? [{ id: 'presets' as const, label: t('dashboard.presets'), body: presets }]
            : []),
    ];
    // A section that has gone — the feature switched off mid-session — falls
    // back to the first rather than to an empty panel.
    const current = tabs.find((x) => x.id === tab) ?? tabs[0];

    return (
        <aside className="zenith-arrange" aria-label={t('dashboard.panel')}>
            <div className="zenith-arrange__head">
                <div className="zenith-arrange__tabs" role="tablist">
                    {tabs.map((x) => (
                        <button
                            key={x.id}
                            type="button"
                            role="tab"
                            aria-selected={x.id === current.id}
                            className={`zenith-arrange__tab${x.id === current.id ? ' is-active' : ''}`}
                            onClick={() => onTab(x.id)}
                        >
                            {x.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="zenith-arrange__close"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    title={t('common.close')}
                >
                    <X size={14} />
                </button>
            </div>
            <div className="zenith-arrange__body" role="tabpanel">
                {current.body}
            </div>
        </aside>
    );
};
