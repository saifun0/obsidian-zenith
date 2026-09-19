import React, { useState, useCallback, useMemo } from 'react';
import { RotateCw, BarChart3, LayoutGrid, Library, Star, FileUp } from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { ContentForm } from './ContentForm';
import { ContentImportModal } from './ContentImportModal';
import { IconButton } from '../../../components/shared/IconButton';
import { ViewHeader } from '../../../components/shared';
import { ContentGallery } from './ContentGallery';
import { ContentStats } from './ContentStats';
import { Plus } from 'lucide-react';

/**
 * ContentApp — root React component for the Content module.
 * Toggles between gallery view and stats view.
 *
 * Data is kept live by the DataService; this component only reads the store.
 * The Refresh button forces an immediate re-parse.
 */
export const ContentApp: React.FC = () => {
    const { plugin } = useApp();
    const t = useTranslation();
    const contentItems = useZenithStore((s) => s.contentItems);
    const contentLoading = useZenithStore((s) => s.contentLoading);
    const setContentGenreFilter = useZenithStore((s) => s.setContentGenreFilter);

    const [showStats, setShowStats] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);

    /** One-line pulse of the library, so the header says more than a raw count. */
    const summary = useMemo(() => {
        const rated = contentItems.filter((i) => i.rating > 0);
        return {
            inProgress: contentItems.filter((i) => i.status === 'in-progress').length,
            completed: contentItems.filter((i) => i.status === 'completed').length,
            avgRating: rated.length > 0 ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0,
        };
    }, [contentItems]);

    const loadContent = useCallback(async () => {
        await plugin.dataService.reloadContent();
    }, [plugin]);

    return (
        <div className="zenith-content">
            <ViewHeader
                icon={Library}
                title={t('content.title')}
                caption={
                    <>
                        <span>{t.plural('common.items', contentItems.length)}</span>
                        {summary.inProgress > 0 && (
                            <span className="zenith-content__summary-stat">
                                <span className="zenith-content__summary-dot is-in-progress" />
                                {t('content.summary.inProgress', { count: summary.inProgress })}
                            </span>
                        )}
                        {summary.completed > 0 && (
                            <span className="zenith-content__summary-stat">
                                <span className="zenith-content__summary-dot is-completed" />
                                {t('content.summary.completed', { count: summary.completed })}
                            </span>
                        )}
                        {summary.avgRating > 0 && (
                            <span className="zenith-content__summary-stat" title={t('content.stats.avgRating')}>
                                <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                                {summary.avgRating.toFixed(1)}
                            </span>
                        )}
                    </>
                }
            >
                    <IconButton
                        icon={Plus}
                        tooltip={t('content.addItem')}
                        onClick={() => setShowForm(true)}
                        variant="default"
                    />
                    <IconButton
                        icon={FileUp}
                        tooltip={t('content.import.title')}
                        onClick={() => setShowImport(true)}
                        variant="ghost"
                    />
                    <IconButton
                        icon={showStats ? LayoutGrid : BarChart3}
                        tooltip={t(showStats ? 'content.galleryView' : 'common.statistics')}
                        onClick={() => setShowStats(!showStats)}
                        variant="ghost"
                    />
                    <IconButton
                        icon={RotateCw}
                        tooltip={t('common.refresh')}
                        onClick={loadContent}
                        variant="ghost"
                        disabled={contentLoading}
                    />
            </ViewHeader>

            {showForm && (
                <ContentForm
                    onCancel={() => setShowForm(false)}
                    onCreated={async () => {
                        await loadContent();
                        new Notice(t('content.added'));
                    }}
                />
            )}

            {showImport && (
                <ContentImportModal
                    onClose={() => setShowImport(false)}
                    onImported={loadContent}
                />
            )}

            {showStats ? (
                <ContentStats
                    items={contentItems}
                    // Picking a genre out of the statistics is a request to see
                    // those items, so it hands the view back to the gallery.
                    onSelectGenre={(genre) => {
                        setContentGenreFilter(genre);
                        setShowStats(false);
                    }}
                />
            ) : (
                <ContentGallery items={contentItems} loading={contentLoading} />
            )}
        </div>
    );
};
