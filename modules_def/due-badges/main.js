/*
 * Example module for module API 2.
 *
 * It shows the four things a version-2 module can do with Zenith's own views,
 * each behind a permission declared in manifest.json:
 *
 *   - `ui:slots`   — draw in a named place of a built-in view
 *                    (`tasks.item.afterTitle`: right after a task's title);
 *   - `tasks:read` — a task action in the task's menu, and the `task:completed`
 *                    event;
 *   - `features`   — a switch of its own in Settings → the module → Features,
 *                    saved into profiles like Zenith's.
 *
 * Asking for anything it did not declare — `zenith.tasks.update(...)` without
 * `tasks:write`, say — throws a ZenithPermissionError naming the permission.
 * Everything registered here is taken back when the module unloads, and a
 * renderer that throws is dropped from the view (three failures in a session
 * and Zenith switches the module off) — Zenith's own view is never at stake.
 *
 * Plain CommonJS, no build step: see modules_def/test-module for the basics.
 */

const zenith = require('zenith');

const DAY = 24 * 60 * 60 * 1000;

function daysUntil(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - today) / DAY);
}

module.exports = class DueBadgesModule {
    constructor(plugin) {
        this.plugin = plugin;
        this.id = 'due-badges';
        this.name = 'Due badges';
        this.description = 'Days left, next to each dated task.';
        this.icon = 'hourglass';
    }

    getManifest() {
        return { id: this.id, name: this.name, description: this.description, isBuiltIn: false };
    }

    async onload() {
        // A switch of its own, among the module's features. On by default.
        zenith.features.register({
            name: 'badges',
            label: 'Days-left badges',
            description: 'Show how many days are left after each dated task.',
        });

        // Plain DOM: `mount` gets an element of its own and the view's props.
        // Returning a function would clean up; setting text needs none.
        zenith.ui.registerSlot('tasks.item.afterTitle', {
            id: 'days-left',
            mount(el, { task }) {
                if (!zenith.features.enabled('badges')) return;
                if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return;
                const days = daysUntil(task.dueDate);
                el.textContent = days < 0 ? `${-days}d late` : days === 0 ? 'today' : `${days}d`;
                el.className = `due-badge${days < 0 ? ' is-late' : ''}`;
            },
        });

        // An entry in the task's "More — from modules" menu.
        zenith.tasks.registerAction({
            id: 'copy-title',
            label: 'Copy task text',
            icon: 'copy',
            run: (task) => navigator.clipboard.writeText(task.title),
        });

        // Read-only: the task that was ticked, wherever it was ticked.
        zenith.events.on('task:completed', ({ task }) => {
            if (zenith.features.enabled('badges')) zenith.notice(`Done: ${task.title}`);
        });
    }

    async onunload() {
        // Nothing to do: every registration above is reclaimed by Zenith.
    }
};
