import { currentLocale, hasTranslation, translateNow, type Translator } from './i18n';

/**
 * A module's name and description in the reader's language.
 *
 * Both arrive as plain English text on the manifest. That text is a FALLBACK:
 * these two keys are looked for first, and a module fills them from
 * `getTranslations()`.
 */
export const moduleNameKey = (id: string): string => `module.${id}.name`;
export const moduleDescriptionKey = (id: string): string => `module.${id}.desc`;

export interface ModuleLabels {
    id: string;
    name: string;
    description: string;
}

/**
 * Returns the module with its name and description translated where a
 * translation exists, and untouched where none does. Never renders a bare key:
 * an English name is a worse answer than a Russian one, and `module.foo.name`
 * is worse than both.
 */
export function localizeModule<T extends ModuleLabels>(t: Translator, module: T): T {
    const nameKey = moduleNameKey(module.id);
    const descKey = moduleDescriptionKey(module.id);
    return {
        ...module,
        name: t.has(nameKey) ? t(nameKey) : module.name,
        description: t.has(descKey) ? t(descKey) : module.description,
    };
}

/**
 * A module's name outside React — a `Notice`, a command title, a log line.
 * The rule is the same one `localizeModule` applies; only the way the language
 * is resolved differs.
 */
export function moduleNameNow(module: ModuleLabels): string {
    const key = moduleNameKey(module.id);
    return hasTranslation(currentLocale(), key) ? translateNow(key) : module.name;
}

/** The same, for a list. */
export function localizeModules<T extends ModuleLabels>(t: Translator, modules: readonly T[]): T[] {
    return modules.map((module) => localizeModule(t, module));
}
