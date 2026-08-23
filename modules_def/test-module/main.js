/*
 * Reference third-party Zenith module.
 *
 * This file is the executable spec for module authors. It is plain CommonJS —
 * no build step, no bundler — because that is all Zenith's loader needs: the
 * source is read through Obsidian's vault adapter and evaluated with
 * `new Function`, which works identically on desktop and on iOS.
 *
 * Available to `require`: 'zenith', 'obsidian', 'react', 'react-dom',
 * 'react-dom/client'. Anything else throws with a message naming what it asked
 * for. Use React only via these — importing your own copy gives the page a
 * second React instance and every hook you write will fail.
 *
 * ICONS: the `icon.svg` beside this file is picked up automatically and becomes
 * `zi:test-module/icon` — which is why `manifest.json` can just say
 * `"icon": "icon.svg"`. Drop an `icons/` folder here to ship several; each
 * `name.svg` becomes `zi:test-module/name`. Both work without any code. SVG
 * only, and it is sanitized on the way in: `<script>`, `<style>`, `<image>` and
 * external `href`s are refused outright, so flatten your artwork before
 * shipping it. Everything registered this way is removed when the module is
 * uninstalled.
 */

const zenith = require('zenith');

module.exports = class TestModule {
    constructor(plugin) {
        // Constructors must stay side-effect free. Zenith may build an instance
        // just to read `getSettingsSchema()` for a module the user has not
        // switched on — register things in `onload`, not here.
        this.plugin = plugin;
        this.id = 'test-module';
        this.name = 'Test Module';
        this.description = 'Reference module: dashboard widget, settings, cleanup.';
        this.icon = 'zap';
    }

    getManifest() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            isBuiltIn: false,
        };
    }

    /**
     * Declarative settings. Zenith renders these with the same form it uses for
     * its own modules, and stores the values in this module's own bucket —
     * reachable through `zenith.settings`.
     */
    getSettingsSchema() {
        return {
            moduleId: this.id,
            groups: [
                {
                    id: 'general',
                    fields: [
                        {
                            type: 'toggle',
                            key: 'showCounter',
                            labelKey: 'Show the counter',
                            descKey: 'Uncheck to hide the elapsed-time line.',
                            default: true,
                        },
                        {
                            type: 'text',
                            key: 'greeting',
                            labelKey: 'Greeting',
                            default: '👋 Hello from a third-party module!',
                        },
                    ],
                },
            ],
        };
    }

    async onload() {
        // Icons that are GENERATED rather than shipped go through the API. For
        // artwork that is just a file, `icon.svg` next to this one is already
        // registered before `onload` runs and needs none of this. Returns the id
        // to use, or null if the SVG was rejected (the reason is logged).
        const badgeIcon = zenith.registerIcon(
            'badge',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'
        );

        // Registering through `zenith` rather than `plugin` directly is what
        // makes this survive a hot reload: registrations are tracked per module
        // id, so a re-install does not hit Obsidian's "already registered"
        // error, and anything registered here is torn down automatically even
        // if `onunload` forgets it.
        zenith.registerDashboardWidget({
            id: 'test-module.hello',
            title: 'Test Module',
            // A custom id works anywhere Zenith takes an icon name; falling back
            // to a lucide name keeps the widget sane if the SVG was refused.
            icon: badgeIcon ?? 'zap',
            order: 50,
            // `mount` is the framework-agnostic path — no React required.
            mount: (el) => {
                const settings = zenith.settings.get();
                const wrap = el.createDiv({ cls: 'zenith-thirdparty-demo' });
                wrap.createEl('div', {
                    text: settings.greeting,
                    cls: 'zenith-thirdparty-demo__title',
                });

                if (!settings.showCounter) return;

                const counter = wrap.createEl('div', { cls: 'zenith-thirdparty-demo__counter' });
                let seconds = 0;
                const render = () => counter.setText(`Loaded ${seconds}s ago`);
                render();

                const timer = window.setInterval(() => {
                    seconds += 1;
                    render();
                }, 1000);
                // Returning a disposer is how a widget cleans up after itself.
                return () => window.clearInterval(timer);
            },
        });

        // A button on the dashboard's navigation launcher, right beside the
        // ones for Zenith's own views. `viewType` opens (or reveals) a view;
        // `onClick` covers everything else — a modal, a note, a command.
        // Registered through `zenith`, so it is removed on unload like the
        // widget above, and it works whether or not the Navigation module is
        // switched on.
        zenith.registerNavAction({
            id: 'test-module.hello',
            label: 'Test Module',
            description: 'Says hello from a third-party module.',
            icon: badgeIcon ?? 'zap',
            order: 70,
            onClick: () => zenith.notice('👋 Hello from a third-party module!'),
        });
    }

    async onunload() {
        // Nothing to do: everything above went through `zenith`, which disposes
        // it. Any raw listener or timer you set up yourself belongs here — or
        // better, hand it to `zenith.register(() => ...)`.
    }

    async activateView() {
        // This module has no view of its own.
    }
};
