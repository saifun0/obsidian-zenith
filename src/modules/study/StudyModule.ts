import { createElement } from 'react';
import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_STUDY } from '../../core/constants';
import { resolveLocale, translatorFor } from '../../core/i18n';
import { useZenithStore } from '../../store';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { StudyView } from './StudyView';
import { StudyWidget } from './components/StudyWidget';
import { ImportDialog } from './components/ImportDialog';
import { EditorDialog } from './components/EditorDialog';
import { copyPrompt } from './components/parts';
import { openStudyDialog } from './openStudyDialog';
import { StudyReminderService } from './studyReminders';
import { studySettingsSchema } from './settings.schema';
import { studyTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * Study — the class timetable: a view of the week, a dashboard card for the
 * day, reminders before classes, and two ways in: a paste box an AI chat can
 * fill from a photo, and an editor.
 */
export class StudyModule extends BaseModule {
    readonly id = 'study';
    readonly name = 'Study';
    readonly description = 'Your class timetable: what is on now, where, and what comes next.';
    readonly icon = 'graduation-cap';

    private disposers: Array<() => void> = [];

    getTranslations(): TranslationTable {
        return studyTranslations;
    }

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    onload(): Promise<void> {
        this.registerView(VIEW_TYPE_STUDY, (leaf) => new StudyView(leaf, this.plugin));

        this.addViewCommand({
            id: 'open-study',
            name: 'Open the timetable',
            callback: () => void this.activateView(),
        });
        this.addCommand({
            id: 'study-import',
            name: 'Paste a timetable',
            callback: () =>
                openStudyDialog(this.plugin, (close) =>
                    createElement(ImportDialog, { onClose: close })
                ),
        });
        this.addCommand({
            id: 'study-edit',
            name: 'Edit the timetable',
            callback: () =>
                openStudyDialog(this.plugin, (close) =>
                    createElement(EditorDialog, { onClose: close })
                ),
        });
        this.addCommand({
            id: 'study-copy-prompt',
            name: 'Copy the AI prompt for a timetable',
            callback: () =>
                void copyPrompt(
                    translatorFor(resolveLocale(useZenithStore.getState().settings.language))
                ),
        });

        const reminders = new StudyReminderService(this.plugin);
        reminders.start();
        this.disposers.push(() => reminders.stop());

        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'study.today',
                feature: 'study.widget',
                title: 'Classes',
                titleKey: 'widget.study',
                description: 'What is on now and next, the day at a glance and the week.',
                icon: 'graduation-cap',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 35,
                component: StudyWidget,
            }),
            this.plugin.registerNavAction({
                id: 'study.view',
                labelKey: 'nav.study',
                descriptionKey: 'nav.study.desc',
                icon: 'graduation-cap',
                order: 55,
                viewType: VIEW_TYPE_STUDY,
            })
        );
        return Promise.resolve();
    }

    onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        return Promise.resolve();
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_STUDY);
    }

    getSettingsSchema(): SettingsSchema {
        return studySettingsSchema;
    }
}
