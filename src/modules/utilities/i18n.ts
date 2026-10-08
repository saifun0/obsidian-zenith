import type { TranslationTable } from '../../core/i18n';

/**
 * Utilities — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for — and the id is still `picture`, the one the module was
 * born with (see `UtilitiesModule`).
 */
export const utilitiesTranslations: TranslationTable = {
    en: {
        'module.picture.name': 'Utilities',
        'module.picture.desc':
            'Small cards for the dashboard: a text or a note, a picture, links, recent notes, a quick note and a timer.',
    },
    ru: {
        'module.picture.name': 'Утилиты',
        'module.picture.desc':
            'Небольшие карточки для дашборда: текст или заметка, картинка, ссылки, недавние заметки, быстрая запись и таймер.',
    },
    zh: {
        'module.picture.name': '小工具',
        'module.picture.desc':
            '仪表盘上的小卡片：文字或笔记、图片、链接、最近的笔记、速记和计时器。',
    },
};
