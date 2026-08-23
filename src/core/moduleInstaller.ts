import { useZenithStore } from '../store';
import type { InstalledModuleRecord } from '../store/settingsSlice';
import { fnv1a } from './hash';
import { vaultModuleFs, type ModuleFs } from './moduleFs';
import { modulePaths, type ModulePaths } from './modulePaths';
import { askConsent } from './ThirdPartyConsentModal';
import { resolveSource, SourceError, type ModulePayload, type ModuleSource } from './moduleSources';
import type ZenithPlugin from '../main';

/**
 * Installing, updating and removing third-party modules.
 *
 * The point of this class is that the user never has to open the plugin's
 * folder — which on iOS they cannot do at all, since Files does not show hidden
 * directories.
 *
 * Order matters: everything is fetched and validated into memory BEFORE
 * anything is written. That gets near-atomic installs without temp files, and
 * means a failed download cannot leave half a module on disk.
 */

export interface InstallOutcome {
    ok: boolean;
    id?: string;
    /** Already human-readable; the UI shows it verbatim. */
    error?: string;
    /** Set when the user declined at the consent screen. */
    cancelled?: boolean;
}

export class ModuleInstaller {
    private readonly fs: ModuleFs;
    private readonly paths: ModulePaths | null;

    constructor(private readonly plugin: ZenithPlugin) {
        this.fs = vaultModuleFs(plugin.app.vault.adapter);
        this.paths = modulePaths(plugin);
    }

    private get records(): InstalledModuleRecord[] {
        return useZenithStore.getState().settings.installedModules;
    }

    getRecord(id: string): InstalledModuleRecord | undefined {
        return this.records.find((r) => r.id === id);
    }

    private saveRecord(record: InstalledModuleRecord): void {
        const rest = this.records.filter((r) => r.id !== record.id);
        useZenithStore.getState().updateSettings({ installedModules: [...rest, record] });
    }

    private dropRecord(id: string): void {
        useZenithStore
            .getState()
            .updateSettings({ installedModules: this.records.filter((r) => r.id !== id) });
    }

    /** Built-in ids, so a download can be refused before it finishes. */
    private reservedIds(): ReadonlySet<string> {
        return new Set(
            this.plugin.moduleManager
                .getAvailableManifests()
                .filter((m) => m.isBuiltIn)
                .map((m) => m.id)
        );
    }

    private async fetchPayload(
        source: ModuleSource,
        paste?: { manifest: string; code: string }
    ): Promise<ModulePayload> {
        return resolveSource(source, {
            adapter: this.plugin.app.vault.adapter,
            pluginVersion: this.plugin.manifest.version,
            reservedIds: this.reservedIds(),
            paste,
        });
    }

    /** Write the module's files. Called only once everything is in hand. */
    private async writeFiles(payload: ModulePayload): Promise<void> {
        if (!this.paths) throw new Error('Plugin folder is unknown.');
        const id = payload.manifest.id;

        await this.fs.mkdirp(this.paths.dir(id));
        // Re-serialise from the validated object rather than echoing the bytes
        // we downloaded: what lands on disk is then exactly what Zenith agreed
        // to run.
        await this.fs.write(this.paths.manifest(id), JSON.stringify(payload.manifest, null, 2));
        await this.fs.write(this.paths.main(id), payload.code);
        if (payload.styles) await this.fs.write(this.paths.styles(id), payload.styles);
    }

    async install(
        source: ModuleSource,
        options: { paste?: { manifest: string; code: string } } = {}
    ): Promise<InstallOutcome> {
        try {
            const payload = await this.fetchPayload(source, options.paste);
            const id = payload.manifest.id;
            const existing = this.getRecord(id);

            const accepted = await askConsent(this.plugin.app, {
                manifest: payload.manifest,
                origin: payload.origin,
                code: payload.code,
                reason: existing ? 'source-changed' : 'first-install',
                previousOrigin: existing?.consentedOrigin,
            });
            if (!accepted) return { ok: false, cancelled: true };

            const isNew = !(await this.fs.exists(this.paths?.dir(id) ?? ''));
            try {
                await this.writeFiles(payload);
            } catch (err) {
                // Only clean up a folder this install created — an update that
                // fails must not delete the working copy it was replacing.
                if (isNew && this.paths) await this.fs.removeDir(this.paths.dir(id));
                throw err;
            }

            const now = Date.now();
            this.saveRecord({
                id,
                name: payload.manifest.name,
                version: payload.manifest.version,
                source: { ...source, resolvedRef: payload.resolvedRef },
                installedAt: existing?.installedAt ?? now,
                updatedAt: existing ? now : undefined,
                codeHash: fnv1a(payload.code),
                consentedAt: now,
                consentedOrigin: payload.origin,
            });

            await this.plugin.refreshAvailableModules();
            await this.plugin.moduleManager.refreshModule(id);
            return { ok: true, id };
        } catch (err) {
            return { ok: false, error: describeError(err) };
        }
    }

    /** Re-resolve the recorded source and install over the top. */
    async update(id: string): Promise<InstallOutcome> {
        const record = this.getRecord(id);
        if (!record) return { ok: false, error: 'Zenith has no record of where this module came from.' };
        if (record.source.kind === 'paste') {
            return {
                ok: false,
                error: 'This module was pasted in, so there is nothing to update from. Paste a new version instead.',
            };
        }
        return this.install(record.source);
    }

    async uninstall(id: string, options: { forgetSettings?: boolean } = {}): Promise<InstallOutcome> {
        try {
            await this.plugin.moduleManager.removeModule(id);
            if (this.paths) await this.fs.removeDir(this.paths.dir(id));

            this.dropRecord(id);
            // Settings are kept by default: reinstalling should restore the
            // configuration rather than silently start from scratch.
            if (options.forgetSettings) useZenithStore.getState().forgetModuleSettings(id);

            const active = useZenithStore.getState().settings.activeModuleIds;
            useZenithStore
                .getState()
                .updateSettings({ activeModuleIds: active.filter((a) => a !== id) });

            await this.plugin.refreshAvailableModules();
            return { ok: true, id };
        } catch (err) {
            return { ok: false, error: describeError(err) };
        }
    }

    /**
     * Whether this exact code has already been approved to run.
     *
     * Synchronous by design — it is called from the module loader during plugin
     * startup, where anything that waits stalls Obsidian. Everything it needs
     * (the record, the hash) is already in memory.
     *
     * A module with no record was dropped into the folder by hand or arrived
     * through vault sync, so it has never been approved here. A record whose
     * hash no longer matches means the file changed since it was approved —
     * edited locally, or replaced by sync from another device.
     */
    isApproved(id: string, code: string): boolean {
        const record = this.getRecord(id);
        if (!record) return false;
        return record.codeHash === fnv1a(code);
    }

    /**
     * Ask the user to approve a module, then start it.
     *
     * This is where the consent dialog belongs: triggered from settings, by a
     * deliberate click, with the workspace up and the plugin fully loaded.
     */
    async approve(id: string): Promise<InstallOutcome> {
        if (!this.paths) return { ok: false, error: 'Plugin folder is unknown.' };

        try {
            const mainPath = this.paths.main(id);
            if (!(await this.fs.exists(mainPath))) {
                return { ok: false, error: 'main.js is missing.' };
            }
            const code = await this.fs.read(mainPath);
            const record = this.getRecord(id);

            // Prefer the module's own manifest so the dialog can show what it
            // claims about itself, but never fail for the want of one.
            let manifest = { id, name: record?.name ?? id, description: '', version: '0.0.0' };
            const manifestPath = this.paths.manifest(id);
            if (await this.fs.exists(manifestPath)) {
                try {
                    const raw = JSON.parse(await this.fs.read(manifestPath));
                    manifest = { ...manifest, ...raw, id };
                } catch {
                    /* an unreadable manifest is not a reason to block approval */
                }
            }

            const accepted = await askConsent(this.plugin.app, {
                manifest,
                origin: record?.consentedOrigin ?? 'installed outside Zenith (no install record)',
                code,
                reason: record ? 'code-changed' : 'first-install',
            });
            if (!accepted) return { ok: false, cancelled: true };

            const now = Date.now();
            this.saveRecord({
                id,
                name: manifest.name,
                version: manifest.version,
                source: record?.source ?? { kind: 'vault', ref: mainPath },
                installedAt: record?.installedAt ?? now,
                updatedAt: record ? now : undefined,
                codeHash: fnv1a(code),
                consentedAt: now,
                consentedOrigin: record?.consentedOrigin ?? `vault: ${mainPath}`,
            });

            await this.plugin.moduleManager.refreshModule(id);
            return { ok: true, id };
        } catch (err) {
            return { ok: false, error: describeError(err) };
        }
    }
}

function describeError(err: unknown): string {
    if (err instanceof SourceError) {
        return err.detail ? `${err.message} ${err.detail}` : err.message;
    }
    return err instanceof Error ? err.message : String(err);
}
