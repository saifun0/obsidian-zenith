import { useFeature } from '../../../core/useFeature';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { RotateCw, BarChart3, LayoutGrid, Layers, Star, FileUp } from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { ContentForm } from './ContentForm';
import { ContentImportModal } from './ContentImportModal';
import { SeriesSuggestModal } from './SeriesSuggestModal';
import { PageHead, PageHeadButton } from '../../../components/shared';
import { ContentGallery } from './ContentGallery';
import { ContentStats } from './ContentStats';
import { Plus } from 'lucide-react';
import { useLibraryItems } from '../useContentTypes';

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
    const importOn = useFeature('content.import');
    const statsOn = useFeature('content.stats');
    const genreFilterOn = useFeature('content.genreFilter');
    const seriesOn = useFeature('content.series');
    // Items of a switched-off type stay in the vault and out of every view here.
    const { items: contentItems, types } = useLibraryItems();
    const contentLoading = useZenithStore((s) => s.contentLoading);
    const setContentGenreFilter = useZenithStore((s) => s.setContentGenreFilter);

    const [showStats, setShowStats] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showFindSeries, setShowFindSeries] = useState(false);
    /** The series a new item is being added to, from a series' own page. */
    const [formSeries, setFormSeries] = useState<{ name: string; typeId: string } | null>(null);

    // "Find series" from the command palette arrives as a request in the store.
    const request = useZenithStore((s) => s.contentRequest);
    const setRequest = useZenithStore((s) => s.setContentRequest);
    useEffect(() => {
        if (request !== 'findSeries') return;
        setRequest(null);
        if (seriesOn) {
            setShowStats(false);
            setShowFindSeries(true);
        }
    }, [request, setRequest, seriesOn]);

    /** The library in one line, under the page's title. */
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
            <PageHead
                title={t('content.title')}
                tally={[
                    t.plural('common.items', contentItems.length),
                    summary.inProgress > 0 &&
                        t('content.summary.inProgress', { count: summary.inProgress }),
                    summary.completed > 0 &&
                        t('content.summary.completed', { count: summary.completed }),
                    summary.avgRating > 0 && (
                        <span className="zenith-content__rating" title={t('content.stats.avgRating')}>
                            <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
                            {summary.avgRating.toFixed(1)}
                        </span>
                    ),
                ]}
            >
                <PageHeadButton
                    icon={Plus}
                    label={t('content.addItem')}
                    onClick={() => setShowForm(true)}
                />
                {seriesOn && (
                    <PageHeadButton
                        icon={Layers}
                        label={t('content.series.find')}
                        onClick={() => setShowFindSeries(true)}
                    />
                )}
                {importOn && (
                    <PageHeadButton
                        icon={FileUp}
                        label={t('content.import.title')}
                        onClick={() => setShowImport(true)}
                    />
                )}
                {statsOn && (
                    <PageHeadButton
                        icon={showStats ? LayoutGrid : BarChart3}
                        label={t(showStats ? 'content.galleryView' : 'common.statistics')}
                        onClick={() => setShowStats(!showStats)}
                    />
                )}
                <PageHeadButton
                    icon={RotateCw}
                    label={t('common.refresh')}
                    onClick={() => void loadContent()}
                    disabled={contentLoading}
                />
            </PageHead>

            {showForm && (
                <ContentForm
                    initialSeries={formSeries?.name}
                    initialType={formSeries?.typeId}
                    onCancel={() => {
                        setShowForm(false);
                        setFormSeries(null);
                    }}
                    onCreated={async () => {
                        await loadContent();
                        new Notice(t('content.added'));
                    }}
                />
            )}

            {seriesOn && showFindSeries && <SeriesSuggestModal onClose={() => setShowFindSeries(false)} />}

            {importOn && showImport && (
                <ContentImportModal
                    onClose={() => setShowImport(false)}
                    onImported={loadContent}
                />
            )}

            {statsOn && showStats ? (
                <ContentStats
                    items={contentItems}
                    types={types}
                    // Picking a genre out of the statistics is a request to see
                    // those items, so it hands the view back to the gallery.
                    onSelectGenre={
                        genreFilterOn
                            ? (genre) => {
                                  setContentGenreFilter(genre);
                                  setShowStats(false);
                              }
                            : undefined
                    }
                />
            ) : (
                <ContentGallery
                    items={contentItems}
                    types={types}
                    loading={contentLoading}
                    onCreateInSeries={(name, typeId) => {
                        setFormSeries({ name, typeId });
                        setShowForm(true);
                    }}
                />
            )}
        </div>
    );
};
