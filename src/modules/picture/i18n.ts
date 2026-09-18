import type { TranslationTable } from '../../core/i18n';

/**
 * Picture — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const pictureTranslations: TranslationTable = {
    en: {
        'module.picture.name': 'Picture',
        'module.picture.desc': 'A photo or GIF on the dashboard, from a link or from the vault.',
    },
    ru: {
        'module.picture.name': 'Картинка',
        'module.picture.desc': 'Фото или GIF на дашборде — по ссылке или из хранилища.',
    },
};
