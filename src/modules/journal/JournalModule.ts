import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_JOURNAL, JOURNAL_BLOCK_LANG } from '../../core/constants';
import { getTodayString } from '../../core/dateUtils';
import { useZenithStore } from '../../store';
import { JournalView } from './JournalView';
import { JournalBlockRenderer } from './JournalCodeBlock';
import { JournalCheckinWidget } from './components/JournalCheckinWidget';
import { JournalStatsWidget } from './components/JournalStatsWidget';
import { openDailyNote } from './services/journalActions';

/**
 * JournalModule — daily notes: a calendar of the year, a check-in for the day
 * (any mix of tick-boxes, 1–5 scales and counts), and the day's tasks.
 */
export class JournalModule extends BaseModule {
    readonly id = 'journal';
    readonly name = 'Journal';
    readonly description = 'Daily notes with a calendar, habit, scale and number tracking.';
    readonly icon = 'calendar-days';

    private disposers: Array<() => void> = [];

    async onload(): Promise<void> {
        this.registerView(VIEW_TYPE_JOURNAL, (leaf) => new JournalView(leaf, this.plugin));

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

        // Two cards, split by what they are for: one records the day, one
        // reports on it. Keeping them apart is why neither has to compromise —
        // the check-in is all controls, the statistics card has nothing to
        // click but the way into the journal.
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'journal.checkin',
                title: 'Check-in',
                description: "Today's trackers as buttons — the same controls as in the note.",
                icon: 'circle-check',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 40,
                component: JournalCheckinWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'journal.stats',
                title: 'Journal stats',
                description: 'Streak, entries and every tracker over the last 30 days.',
                icon: 'bar-chart-3',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 41,
                component: JournalStatsWidget,
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
