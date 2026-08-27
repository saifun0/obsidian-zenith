import React, { type FC } from 'react';
import { ArrowDown, ArrowUp, CornerUpRight, Layers } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { SIZE_LABEL, type WidgetSize } from '../grid/gridTypes';
import type { WidgetBundle } from '../grid/bundleTypes';

interface BundleInspectorProps {
    bundle: WidgetBundle;
    /** Display name and supported presets per member, in rail order. */
    members: Array<{ id: string; label: string; sizes: readonly WidgetSize[] }>;
    onRename: (name: string) => void;
    onExtract: (widgetId: string) => void;
    /** Move a member to a new position in the rail order. */
    onReorder: (widgetId: string, index: number) => void;
}

/**
 * The bundle's own controls, appended to the cell's size panel while arranging.
 *
 * It belongs to the *bundle*, not to whichever member happens to be on top: a
 * bundle is one cell of the grid, and its members have no cells of their own to
 * size or place. The name is optional and lives here rather than in the header,
 * because at rest the header space is worth more to the active widget's title.
 *
 * This is also where the member order is set. It used to be done by dragging
 * rows in the unfolded bundle; with that view gone, the list that already names
 * every member is the obvious place for it, and it is reachable without having
 * to unfold anything.
 */
export const BundleInspector: FC<BundleInspectorProps> = ({
    bundle,
    members,
    onRename,
    onExtract,
    onReorder,
}) => {
    const t = useTranslation();

    return (
        <div className="zenith-bundle-inspector">
            <div className="zenith-bundle-inspector__head">
                <Layers size={13} />
                <span className="zenith-bundle-inspector__label">
                    {t.plural('dashboard.bundle.count', bundle.members.length)}
                </span>
                <input
                    className="zenith-bundle-inspector__name"
                    value={bundle.name ?? ''}
                    placeholder={t('dashboard.bundle.namePlaceholder')}
                    onChange={(e) => onRename(e.target.value)}
                    aria-label={t('dashboard.bundle.name')}
                />
            </div>

            {members.map((member, i) => (
                <div className="zenith-bundle-inspector__member" key={member.id}>
                    <span className="zenith-bundle-inspector__member-name">{member.label}</span>
                    <span className="zenith-bundle-inspector__member-sizes">
                        {member.sizes.map((s) => SIZE_LABEL[s]).join(' ')}
                    </span>
                    <button
                        className="zenith-bundle__row-btn"
                        onClick={() => onReorder(member.id, i - 1)}
                        disabled={i === 0}
                        aria-label={t('dashboard.bundle.moveUp')}
                        title={t('dashboard.bundle.moveUp')}
                    >
                        <ArrowUp size={12} />
                    </button>
                    <button
                        className="zenith-bundle__row-btn"
                        onClick={() => onReorder(member.id, i + 1)}
                        disabled={i === members.length - 1}
                        aria-label={t('dashboard.bundle.moveDown')}
                        title={t('dashboard.bundle.moveDown')}
                    >
                        <ArrowDown size={12} />
                    </button>
                    <button
                        className="zenith-bundle__row-btn"
                        onClick={() => onExtract(member.id)}
                        aria-label={t('dashboard.bundle.extract')}
                        title={t('dashboard.bundle.extract')}
                    >
                        <CornerUpRight size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
};
