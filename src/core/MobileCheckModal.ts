import { Modal, Notice, Platform, normalizePath, setIcon, type App } from 'obsidian';
import type ZenithPlugin from '../main';

/**
 * Mobile capability check.
 *
 * Third-party Zenith modules are JavaScript loaded at runtime. On desktop that
 * used Node's `fs` and `require`, neither of which exists on iOS — so the whole
 * feature silently did nothing there. The replacement reads through Obsidian's
 * vault adapter and evaluates with `new Function`, which is how Obsidian loads
 * its own community plugins on mobile.
 *
 * "Which is how Obsidian does it" is a strong argument, not a proof: if the
 * WebView's content-security policy refused `new Function`, the entire approach
 * would be dead and modules would have to ship as ESM instead. iOS has no
 * developer console to check that from, hence this: a command that runs the
 * checks on the device and shows what happened.
 *
 * Delete this file once the answer is known and recorded.
 */

interface CheckResult {
    name: string;
    ok: boolean;
    detail: string;
}

/** Run `work`, turning any throw into a failed result rather than a crash. */
async function attempt(name: string, work: () => Promise<string> | string): Promise<CheckResult> {
    try {
        return { name, ok: true, detail: await work() };
    } catch (err) {
        return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
}

async function runChecks(plugin: ZenithPlugin): Promise<CheckResult[]> {
    const adapter = plugin.app.vault.adapter;
    const dir = plugin.manifest.dir ?? '';
    const modulesDir = normalizePath(`${dir}/modules`);
    const probe = normalizePath(`${modulesDir}/.zenith-probe.js`);

    const results: CheckResult[] = [
        {
            name: 'Platform',
            ok: true,
            detail: [
                Platform.isMobileApp ? 'mobile app' : 'desktop app',
                Platform.isIosApp ? 'iOS' : Platform.isAndroidApp ? 'Android' : 'other',
                // Cast because @types/node declares `require` as always present;
                // in the mobile WebView it genuinely is not.
                typeof (window as { require?: unknown }).require === 'function'
                    ? 'Node available'
                    : 'no Node (expected on mobile)',
            ].join(' · '),
        },
    ];

    // The gate. Everything else is pointless if this fails.
    results.push(
        await attempt('new Function (CSP gate)', () => {
            const value = new Function('return 1 + 1')() as number;
            if (value !== 2) throw new Error(`returned ${value}, expected 2`);
            return 'allowed';
        })
    );

    // Closer to the real thing: a CommonJS-shaped factory with an injected
    // require, which is exactly the shape the module loader will use.
    results.push(
        await attempt('new Function (CJS module shape)', () => {
            const factory = new Function(
                'module',
                'exports',
                'require',
                'module.exports = { id: require("probe") };\n//# sourceURL=zenith-probe://check.js'
            );
            const mod = { exports: {} as { id?: string } };
            factory(mod, mod.exports, (id: string) => id);
            if (mod.exports.id !== 'probe') throw new Error('exports did not come back');
            return 'module.exports + require shim work';
        })
    );

    results.push(
        await attempt('Plugin directory is known', () => {
            if (!dir) throw new Error('manifest.dir is empty');
            return dir;
        })
    );

    results.push(
        await attempt('Adapter can read the plugin folder', async () => {
            const listing = await adapter.list(dir);
            return `${listing.files.length} files, ${listing.folders.length} folders`;
        })
    );

    // The full installer round trip: create the folder, write a file, read it
    // back, list it, then clean up. This is what "install a module" reduces to.
    results.push(
        await attempt('Adapter can write / read / delete', async () => {
            if (!(await adapter.exists(modulesDir))) await adapter.mkdir(modulesDir);
            await adapter.write(probe, '// zenith probe\n');
            const back = await adapter.read(probe);
            if (!back.includes('zenith probe')) throw new Error('read back the wrong content');
            const listing = await adapter.list(modulesDir);
            await adapter.remove(probe);
            return `round trip OK (${listing.files.length} file(s) in modules/)`;
        })
    );

    return results;
}

export class MobileCheckModal extends Modal {
    constructor(
        app: App,
        private readonly plugin: ZenithPlugin
    ) {
        super(app);
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Zenith — device capability check' });
        contentEl.createEl('p', {
            text: 'Checks whether third-party modules can be loaded and installed on this device.',
            cls: 'setting-item-description',
        });

        const list = contentEl.createDiv();
        list.createEl('p', { text: 'Running…' });

        const results = await runChecks(this.plugin);
        list.empty();

        for (const r of results) {
            const row = list.createDiv({ cls: 'zenith-devcheck__row' });

            const head = row.createDiv({ cls: 'zenith-devcheck__head' });
            const mark = head.createSpan({
                cls: `zenith-devcheck__mark ${r.ok ? 'is-ok' : 'is-fail'}`,
                attr: { 'aria-label': r.ok ? 'OK' : 'Failed' },
            });
            setIcon(mark, r.ok ? 'circle-check' : 'circle-x');
            head.createSpan({ text: r.name });

            row.createDiv({
                text: r.detail,
                cls: 'setting-item-description zenith-devcheck__detail',
            });
        }

        const gate = results.find((r) => r.name.startsWith('new Function (CSP'));
        const verdict = contentEl.createEl('p', { cls: 'zenith-devcheck__verdict' });
        verdict.setText(
            gate?.ok
                ? 'Verdict: third-party modules can run on this device.'
                : 'Verdict: this device blocks runtime evaluation — modules would have to ship as ES modules instead.'
        );

        // The whole point is reporting this back, and there is no console to
        // copy from on a phone.
        const copy = contentEl.createEl('button', { text: 'Copy results' });
        copy.onclick = () => {
            const text = results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} ${r.name}: ${r.detail}`).join('\n');
            void navigator.clipboard.writeText(text);
            new Notice('Copied');
        };
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
