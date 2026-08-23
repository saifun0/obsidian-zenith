/**
 * What each module has registered with Obsidian, keyed by module ID.
 *
 * View types, command ids and code-block languages are plugin-scoped: Obsidian
 * throws when one is registered twice, and only releases them when the whole
 * plugin unloads. `BaseModule` used to track this on the instance, which was
 * fine while an instance outlived every enable/disable cycle.
 *
 * Re-evaluating a module's source produces a NEW instance, so per-instance
 * bookkeeping forgets everything and the second `registerView` throws. That is
 * the one non-obvious thing standing between us and hot reload, so the record
 * is keyed by module ID and outlives instances — cleared only on uninstall.
 */
export class ModuleRegistrationLedger {
    private views = new Map<string, Set<string>>();
    private commands = new Map<string, Set<string>>();
    private codeBlocks = new Map<string, Set<string>>();
    private disposers = new Map<string, Array<() => void>>();

    private bucket(map: Map<string, Set<string>>, moduleId: string): Set<string> {
        let set = map.get(moduleId);
        if (!set) {
            set = new Set();
            map.set(moduleId, set);
        }
        return set;
    }

    hasView(moduleId: string, viewType: string): boolean {
        return this.views.get(moduleId)?.has(viewType) ?? false;
    }
    markView(moduleId: string, viewType: string): void {
        this.bucket(this.views, moduleId).add(viewType);
    }

    hasCommand(moduleId: string, commandId: string): boolean {
        return this.commands.get(moduleId)?.has(commandId) ?? false;
    }
    markCommand(moduleId: string, commandId: string): void {
        this.bucket(this.commands, moduleId).add(commandId);
    }

    hasCodeBlock(moduleId: string, language: string): boolean {
        return this.codeBlocks.get(moduleId)?.has(language) ?? false;
    }
    markCodeBlock(moduleId: string, language: string): void {
        this.bucket(this.codeBlocks, moduleId).add(language);
    }

    /** Cleanup to run when the module unloads. */
    addDisposer(moduleId: string, dispose: () => void): void {
        const list = this.disposers.get(moduleId) ?? [];
        list.push(dispose);
        this.disposers.set(moduleId, list);
    }

    /**
     * Run every disposer for a module. Reclaims what a module registered
     * through the Zenith API even if its own `onunload` forgot to — a badly
     * written module should not be able to leave a widget behind forever.
     */
    disposeAll(moduleId: string): void {
        for (const dispose of this.disposers.get(moduleId) ?? []) {
            try {
                dispose();
            } catch (err) {
                console.error(`Zenith: disposer for "${moduleId}" threw`, err);
            }
        }
        this.disposers.delete(moduleId);
    }

    /**
     * Forget a module entirely. Uninstall only — NOT on unload, because the
     * Obsidian-side registrations those flags describe survive until the plugin
     * itself unloads.
     */
    forget(moduleId: string): void {
        this.disposeAll(moduleId);
        this.views.delete(moduleId);
        this.commands.delete(moduleId);
        this.codeBlocks.delete(moduleId);
    }
}
