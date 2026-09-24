import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_JOURNAL, JOURNAL_BLOCK_LANG } from '../../core/constants';
import { getTodayString } from '../../core/dateUtils';
import { useZenithStore } from '../../store';
import { JournalView } from './JournalView';
import { JournalBlockRenderer } from './JournalCodeBlock';
import { SummaryBlockRenderer } from './SummaryCodeBlock';
import { YearReviewModal } from './YearReviewModal';
import { SUMMARY_BLOCK_LANG, openReviewNote } from './services/reviewNotes';
import { REVIEW_PERIODS, type ReviewPeriod } from './services/reviewPeriods';
import { defaultReviewYear } from './services/yearReview';
import { JournalCheckinWidget } from './components/JournalCheckinWidget';
import { JournalStatsWidget } from './components/JournalStatsWidget';
import { RitualWidget } from './components/RitualWidget';
import { RitualModal } from './RitualModal';
import { RitualReminderService } from './services/ritualReminders';
import { featureEnabled } from '../../core/features';
import { translate, resolveLocale } from '../../core/i18n';
import { Notice } from 'obsidian';
import { openDailyNote } from './services/journalActions';
import { journalTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * JournalModule — daily notes: a calendar of the year, a check-in for the day
 * (any mix of tick-boxes, 1–5 scales and counts), and the day's tasks.
 */
export class JournalModule extends BaseModule {
    readonly id = 'journal';
    readonly name = 'Journal';
    readonly description = 'Daily notes with a calendar, habit, scale and number tracking.';
    readonly icon = 'calendar-days';

    getTranslations(): TranslationTable {
        return journalTranslations;
    }

    private disposers: Array<() => void> = [];

    /** Open a ritual — or say why not, while the feature is off. */
    private openRitual(kind: 'morning' | 'evening'): void {
        const { settings } = useZenithStore.getState();
        if (!featureEnabled(settings, 'journal.rituals')) {
            new Notice(translate(resolveLocale(settings.language), 'ritual.off'));
            return;
        }
        new RitualModal(this.plugin.app, this.plugin, kind).open();
    }

    /** A feature's command, or a line on why it does nothing while the feature is off. */
    private whenOn(feature: string, run: () => void): void {
        const { settings } = useZenithStore.getState();
        if (!featureEnabled(settings, feature)) {
            new Notice(translate(resolveLocale(settings.language), 'review.off'));
            return;
        }
        run();
    }

    async onload(): Promise<void> {
        this.registerView(VIEW_TYPE_JOURNAL, (leaf) => new JournalView(leaf, this.plugin));

        // A period's numbers, counted live wherever the block is put.
        this.registerCodeBlock(SUMMARY_BLOCK_LANG, (source, el, ctx) => {
            ctx.addChild(new SummaryBlockRenderer(el, this.plugin, source, ctx));
        });

        // Review notes: created by these commands, never on their own.
        const commandName: Record<ReviewPeriod, string> = {
            week: "Open this week's note",
            month: "Open this month's note",
            quarter: "Open this quarter's note",
            year: "Open this year's note",
        };
        for (const period of REVIEW_PERIODS) {
            this.addCommand({
                id: `open-${period}-note`,
                name: commandName[period],
                callback: () =>
                    this.whenOn('journal.reviews', () => {
                        const { settings } = useZenithStore.getState();
                        void openReviewNote(this.plugin.app, settings, period, getTodayString());
                    }),
            });
        }
        this.addCommand({
            id: 'year-in-review',
            name: 'Year in review',
            callback: () =>
                this.whenOn('journal.yearInReview', () =>
                    new YearReviewModal(
                        this.plugin.app,
                        this.plugin,
                        defaultReviewYear(getTodayString())
                    ).open()
                ),
        });

        // The day's check-in, rendered inside the note itself.
        this.registerCodeBlock(JOURNAL_BLOCK_LANG, (_source, el, ctx) => {
            ctx.addChild(new JournalBlockRenderer(el, this.plugin, ctx.sourcePath));
        });

        this.addCommand({
            id: 'open-journal',
            name: 'Open Journal',
            callback: () => this.activateView(),
        });

        // The fast path: capture today without going through the calendar.
        this.addCommand({
            id: 'open-today-note',
            name: "Open today's note",
            callback: () => {
                const { settings } = useZenithStore.getState();
                void openDailyNote(this.plugin.app, settings, getTodayString());
            },
        });

        this.addCommand({
            id: 'ritual-morning',
            name: 'Morning ritual',
            callback: () => this.openRitual('morning'),
        });
        this.addCommand({
            id: 'ritual-evening',
            name: 'Evening review',
            callback: () => this.openRitual('evening'),
        });

        const reminders = new RitualReminderService(this.plugin);
        reminders.start();
        this.disposers.push(() => reminders.stop());

        // Two cards, split by what they are for: one records the day, one
        // reports on it. Keeping them apart is why neither has to compromise —
        // the check-in is all controls, the statistics card has nothing to
        // click but the way into the journal.
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'journal.checkin',
                feature: 'journal.widget',
                title: 'Check-in',
                titleKey: 'widget.checkin',
                description: "Today's trackers as buttons — the same controls as in the note.",
                icon: 'circle-check',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 40,
                component: JournalCheckinWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'journal.stats',
                feature: 'journal.stats',
                title: 'Journal stats',
                titleKey: 'widget.journalStats',
                description: 'Streak, entries and every tracker over the last 30 days.',
                icon: 'bar-chart-3',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 41,
                component: JournalStatsWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'journal.ritual',
                feature: 'journal.rituals',
                title: 'Ritual',
                titleKey: 'widget.ritual',
                description:
                    'The morning plan or the evening review, whichever the hour calls for.',
                icon: 'sunrise',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 42,
                component: RitualWidget,
            })
        );

        // Two ways in from the launcher: the calendar view, and the fast path
        // straight into today's note — which is what the module is for.
        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'journal.view',
                labelKey: 'nav.journal',
                descriptionKey: 'nav.journal.desc',
                icon: 'calendar-days',
                order: 50,
                viewType: VIEW_TYPE_JOURNAL,
            }),
            this.plugin.registerNavAction({
                id: 'journal.today',
                labelKey: 'nav.today',
                descriptionKey: 'nav.today.desc',
                icon: 'pen-line',
                order: 51,
                onClick: async ({ app }) => {
                    const { settings } = useZenithStore.getState();
                    await openDailyNote(app, settings, getTodayString());
                },
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        // NOTE: leaves are intentionally left attached (see TasksModule).
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_JOURNAL);
    }
}
