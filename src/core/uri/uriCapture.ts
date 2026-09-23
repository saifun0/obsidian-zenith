import { Notice } from 'obsidian';
import type ZenithPlugin from '../../main';
import { useZenithStore } from '../../store';
import { featureEnabled } from '../features';
import { resolveLocale, translate, type Locale } from '../i18n';
import { getTodayString } from '../dateUtils';
import { activeTrackers } from '../journalConfig';
import { quickParse } from '../../modules/tasks/services/quickParse';
import { TaskWriter } from '../../modules/tasks/services/taskWriter';
import { resolveTaskTarget } from '../../modules/tasks/services/taskTarget';
import { setTrackerValue } from '../../modules/journal/services/journalActions';
import {
    RateLimiter,
    URI_VIEWS,
    nextTrackerValue,
    readUriRequest,
    type UriRequest,
} from './uriRequest';

/**
 * `obsidian://zenith?do=…` — tasks and tracker entries from outside Obsidian,
 * a phone's shortcuts above all.
 *
 * Any web page can open an `obsidian://` link, so this is guarded in layers:
 * - off until switched on (`tasks.uriCapture`), checked on every request, so
 *   switching it off takes effect at once even though Obsidian offers no way
 *   to unregister the handler;
 * - only what adds — a task, today's tracker value — or opens a view;
 * - every write says so, with an undo, so nothing lands unseen;
 * - five requests a minute, after which links are ignored for the rest of it;
 * - an action for a module that is off does nothing.
 */

export const URI_ACTION = 'zenith';

const limiter = new RateLimiter(5, 60_000);

/** Said once per stretch, not once per link: a page firing links should not also flood notices. */
const quiet = new Map<string, number>();
function once(key: string, ms: number, say: () => void): void {
    const now = Date.now();
    if ((quiet.get(key) ?? 0) > now) return;
    quiet.set(key, now + ms);
    say();
}

function noticeWithUndo(message: string, locale: Locale, undo: () => Promise<boolean>): void {
    let notice: Notice | null = null;
    const fragment = createFragment((frag) => {
        frag.createSpan({ text: message });
        const button = frag.createEl('button', {
            text: translate(locale, 'uri.undo'),
            cls: 'zenith-notice-undo',
        });
        button.onclick = () => {
            notice?.hide();
            void undo().then(
                (ok) => new Notice(translate(locale, ok ? 'uri.undone' : 'uri.undoFailed'))
            );
        };
    });
    notice = new Notice(fragment, 10_000);
}

async function addTask(plugin: ZenithPlugin, text: string, locale: Locale): Promise<void> {
    const settings = useZenithStore.getState().settings;
    const parsed = featureEnabled(settings, 'tasks.naturalInput')
        ? quickParse(text, getTodayString())
        : null;
    const title = (parsed?.title ?? text).trim();
    if (!title) {
        new Notice(translate(locale, 'uri.error.missing-text'));
        return;
    }
    const writer = new TaskWriter(plugin.app);
    const target = await resolveTaskTarget(plugin.app, settings);
    const added = await writer.addTask(
        settings.tasksFolderPath,
        {
            title,
            priority: parsed?.priority ?? 'medium',
            tags: [],
            dueDate: parsed?.dueDate,
            dueTime: parsed?.dueTime,
            dueEndTime: parsed?.dueEndTime,
            recurrence: parsed?.recurrence,
        },
        target
    );
    noticeWithUndo(translate(locale, 'uri.added', { title }), locale, () =>
        writer.removeAddedTask(added)
    );
}

async function logTracker(
    plugin: ZenithPlugin,
    request: Extract<UriRequest, { kind: 'log' }>,
    locale: Locale
): Promise<void> {
    const { settings, journalEntries } = useZenithStore.getState();
    const tracker = activeTrackers(settings.journalTrackers).find((t) => t.id === request.tracker);
    if (!tracker) {
        new Notice(translate(locale, 'uri.error.unknown-tracker', { tracker: request.tracker }));
        return;
    }
    const today = getTodayString();
    const previous = journalEntries.find((e) => e.date === today)?.values[tracker.id];
    const next = nextTrackerValue(tracker, previous, request.value);
    if (next === undefined) {
        new Notice(translate(locale, 'uri.error.bad-value'));
        return;
    }
    if (!(await setTrackerValue(plugin.app, settings, today, tracker.id, next))) return;
    const shown = next === null ? '—' : next === true ? '✓' : String(next);
    noticeWithUndo(
        translate(locale, 'uri.logged', { tracker: tracker.label, value: shown }),
        locale,
        () =>
            setTrackerValue(
                plugin.app,
                useZenithStore.getState().settings,
                today,
                tracker.id,
                previous ?? null
            )
    );
}

async function handle(plugin: ZenithPlugin, params: Record<string, string>): Promise<void> {
    const settings = useZenithStore.getState().settings;
    const locale = resolveLocale(settings.language);

    if (!featureEnabled(settings, 'tasks.uriCapture')) {
        // Once in ten minutes: whoever set up the shortcut learns why nothing
        // happened, and a page firing links does not get a notice per link.
        once('off', 10 * 60_000, () => new Notice(translate(locale, 'uri.off')));
        return;
    }

    // Counted before anything is read: a page firing malformed links should
    // run out of notices as quickly as one firing good ones.
    if (!limiter.take()) {
        once('tooMany', 60_000, () => new Notice(translate(locale, 'uri.tooMany')));
        return;
    }
    const read = readUriRequest(params);
    if (!read.ok) {
        new Notice(translate(locale, `uri.error.${read.error}`));
        return;
    }

    const request = read.request;
    const moduleId =
        request.kind === 'add-task'
            ? 'tasks'
            : request.kind === 'log'
              ? 'journal'
              : URI_VIEWS[request.view];
    if (!settings.activeModuleIds.includes(moduleId)) {
        new Notice(translate(locale, 'uri.error.module-off'));
        return;
    }

    try {
        if (request.kind === 'add-task') await addTask(plugin, request.text, locale);
        else if (request.kind === 'log') await logTracker(plugin, request, locale);
        else await plugin.moduleManager.get(moduleId)?.activateView();
    } catch (err) {
        console.error('Zenith: a link request failed:', err);
        new Notice(translate(locale, 'uri.failed'));
    }
}

/**
 * Register the handler. Once, for the plugin's life — Obsidian has no way to
 * take it back, which is why the feature is checked per request instead.
 */
export function registerUriCapture(plugin: ZenithPlugin): void {
    plugin.registerObsidianProtocolHandler(URI_ACTION, (params) => {
        void handle(plugin, params);
    });
}
