import type { TranslationTable } from '../../core/i18n';

/**
 * Canvas — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const canvasTranslations: TranslationTable = {
    en: {
        'module.canvas.name': 'Canvas',
        'module.canvas.desc': 'Tidy, generate and reshape Obsidian canvases.',
    },
    ru: {
        'module.canvas.name': 'Холсты',
        'module.canvas.desc': 'Порядок, генерация и перестройка холстов Obsidian.',
    },
};
