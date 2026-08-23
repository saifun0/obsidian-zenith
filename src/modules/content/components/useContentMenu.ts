import React from 'react';
import { Menu, Notice } from 'obsidian';
import type { ContentItem } from '../../../store/contentSlice';
import type { ContentTypeConfig } from '../../../core/contentTypes';
import { CONTENT_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { openFileAtLine } from '../../../core/openInVault';
import { bumpProgress, deleteItems, setItemStatus } from '../services/contentActions';
import { shortUnit } from '../services/progress';

const STATUS_KEY: Record<ContentStatus, string> = {
    backlog: 'status.backlog',
    'in-progress': 'status.inProgress',
    completed: 'status.completed',
    dropped: 'status.dropped',
};

const STATUS_ICON: Record<ContentStatus, string> = {
    backlog: 'inbox',
    'in-progress': 'play',
    completed: 'check',
    dropped: 'x',
};

/**
 * The right-click menu shared by every representation of a library item.
 *
 * Poster tiles and the "Continue" shelf render differently but mean the same
 * thing, so the same gesture has to offer the same actions on both. Keeping the
 * menu here rather than inside one card component is what makes that true by
 * construction instead of by remembering to update two copies.
 */
export function useContentMenu(
    item: ContentItem,
    type: ContentTypeConfig,
    onOpen: (item: ContentItem) => void
): (e: React.MouseEvent) => void {
    const { app } = useApp();
    const t = useTranslation();
    const patchContentItem = useZenithStore((s) => s.patchContentItem);

    const run = async (fn: () => Promise<unknown>, errorKey: string) => {
        try {
            await fn();
        } catch (err) {
            console.error('Zenith: content action failed:', err);
            new Notice(t(errorKey));
        }
    };

    return (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const tracksProgress = type.fields.includes('progress');
        const current = item.progressCurrent ?? 0;
        const total = item.progressTotal;
        const canBump = tracksProgress && item.status === 'in-progress' && (!total || current < total);

        const changeStatus = (next: ContentStatus) =>
            void run(async () => {
                const patch = await setItemStatus(app, item, next);
                patchContentItem(item.id, patch);
            }, 'content.error.status');

        const bump = (delta: number) =>
            void run(async () => {
                const patch = await bumpProgress(app, item, delta);
                if (patch) patchContentItem(item.id, patch);
            }, 'content.error.progress');

        const menu = new Menu();

        for (const s of CONTENT_STATUSES) {
            menu.addItem((mi) =>
                mi
                    .setTitle(t(STATUS_KEY[s]))
                    .setIcon(STATUS_ICON[s])
                    .setChecked(item.status === s)
                    .onClick(() => changeStatus(s))
            );
        }

        if (tracksProgress) {
            menu.addSeparator();
            if (canBump) {
                menu.addItem((mi) =>
                    mi
                        .setTitle(t('content.card.plusOne', { unit: shortUnit(type.progressUnit) }))
                        .setIcon('plus')
                        .onClick(() => bump(1))
                );
            }
            if (current > 0) {
                menu.addItem((mi) =>
                    mi
                        .setTitle(t('content.card.minusOne', { unit: shortUnit(type.progressUnit) }))
                        .setIcon('minus')
                        .onClick(() => bump(-1))
                );
            }
        }

        menu.addSeparator();
        menu.addItem((mi) =>
            mi
                .setTitle(t('content.detail.openDetails'))
                .setIcon('panel-right-open')
                .onClick(() => onOpen(item))
        );
        menu.addItem((mi) =>
            mi
                .setTitle(t('common.openNote'))
                .setIcon('file-text')
                .onClick(() => void openFileAtLine(app, item.filePath))
        );
        menu.addSeparator();
        menu.addItem((mi) =>
            mi
                .setTitle(t('common.delete'))
                .setIcon('trash-2')
                .onClick(() =>
                    void run(async () => {
                        if (!window.confirm(t('content.detail.deleteConfirm', { title: item.title })))
                            return;
                        if (!(await deleteItems(app, [item]))) new Notice(t('content.error.delete'));
                    }, 'content.error.delete')
                )
        );

        menu.showAtMouseEvent(e.nativeEvent);
    };
}
