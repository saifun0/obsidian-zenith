import { CORE_MODULE, FEATURES, NOTIFICATIONS_MODULE, type FeatureId } from '../features';
import { PROFILE_FORMAT, PROFILE_VERSION, type Profile } from './profiles';

/**
 * The built-in starting points: a set of modules, which of their features are
 * on, and — when a template needs any — a few settings.
 *
 * A template speaks for its own modules and for the parts of Zenith no module
 * owns. The features of a module it leaves off are left as they are, so
 * switching that module on later brings it back the way it was rather than
 * with everything unexpectedly dark.
 *
 * Features named here that a later stage has not built yet are simply not in
 * the registry; each stage adds its own to the templates that want them.
 */
export interface ProfileTemplate {
    id: string;
    /** Lucide icon for its card. */
    icon: string;
    modules: readonly string[];
    /** Features switched on among the template's modules; the rest of theirs go off. */
    on: readonly FeatureId[] | 'all';
}

/**
 * Modules no template decides about. Sync is how the user's devices agree,
 * and choosing "Minimum" is not a request to stop that.
 */
export const TEMPLATE_UNTOUCHED: readonly string[] = ['sync'];

/** What every template keeps from outside its modules. */
const BASICS: FeatureId[] = ['core.vaultScaffold', 'notify.center'];

export const TEMPLATES: readonly ProfileTemplate[] = [
    {
        id: 'minimum',
        icon: 'circle',
        modules: ['dashboard', 'tasks', 'journal'],
        on: [
            ...BASICS,
            'tasks.captureDaily',
            'tasks.subtasks',
            'tasks.smartGroups',
            'tasks.widget',
            'journal.dailyBlock',
            'journal.widget',
        ],
    },
    {
        id: 'everything',
        icon: 'layers',
        modules: [
            'dashboard',
            'navigator',
            'picture',
            'weather',
            'tasks',
            'tasks-calendar',
            'projects',
            'content',
            'journal',
            'prayer',
            'media',
            'sync',
        ],
        on: 'all',
    },
    {
        id: 'habits',
        icon: 'repeat',
        modules: ['dashboard', 'navigator', 'journal', 'tasks'],
        on: [
            ...BASICS,
            'dashboard.date',
            'journal.dailyBlock',
            'journal.moodColors',
            'journal.habitMonth',
            'journal.wordCount',
            'journal.stats',
            'journal.widget',
            'tasks.captureDaily',
            'tasks.subtasks',
            'tasks.smartGroups',
            'tasks.widget',
        ],
    },
    {
        id: 'planning',
        icon: 'calendar-check',
        // The journal only as the place captured tasks are written to.
        modules: ['dashboard', 'navigator', 'tasks', 'tasks-calendar', 'projects', 'journal'],
        on: [
            ...BASICS,
            'dashboard.date',
            'dashboard.presets',
            'tasks.captureDaily',
            'tasks.subtasks',
            'tasks.attachments',
            'tasks.timer',
            'tasks.dragDrop',
            'tasks.smartGroups',
            'tasks.fileGroups',
            'tasks.stats',
            'tasks.heatmap',
            'tasks.widget',
            'calendar.timeViews',
            'calendar.allHours',
            'calendar.agenda',
            'calendar.spans',
            'calendar.dailyNotes',
            'calendar.spotlight',
            'calendar.widget',
            'calendar.overdue',
            'projects.taskLinks',
            'projects.widget',
            'journal.dailyBlock',
        ],
    },
    {
        id: 'prayer',
        icon: 'moon-star',
        // The journal in its smallest form: the day's prayers are written
        // into the daily note.
        modules: ['dashboard', 'navigator', 'prayer', 'journal'],
        on: [
            ...BASICS,
            'prayer.sunrise',
            'prayer.extras',
            'prayer.hijri',
            'prayer.weekStrip',
            'prayer.stats',
            'prayer.reminders',
            'prayer.widget',
            'journal.dailyBlock',
        ],
    },
    {
        id: 'reading',
        icon: 'book-open',
        modules: ['dashboard', 'navigator', 'content'],
        on: [
            ...BASICS,
            'content.resume',
            'content.quickIncrement',
            'content.multiSelect',
            'content.genreFilter',
            'content.import',
            'content.stats',
            'content.widget',
        ],
    },
];

export function getTemplate(id: string): ProfileTemplate | undefined {
    return TEMPLATES.find((t) => t.id === id);
}

/** A template as a profile, ready for the same preview and apply as any other. */
export function templateProfile(template: ProfileTemplate, name: string, today: string): Profile {
    const scope = new Set([...template.modules, CORE_MODULE, NOTIFICATIONS_MODULE]);
    const on = template.on === 'all' ? null : new Set<string>(template.on);
    const features: Record<string, boolean> = {};
    for (const def of FEATURES) {
        if (scope.has(def.moduleId)) features[def.id] = on === null || on.has(def.id);
    }
    return {
        zenith: PROFILE_FORMAT,
        version: PROFILE_VERSION,
        name,
        createdAt: today,
        modules: [...template.modules],
        features,
        settings: {},
    };
}
