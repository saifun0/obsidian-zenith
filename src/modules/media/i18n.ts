import type { TranslationTable } from '../../core/i18n';

/**
 * Media Banner — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const mediaTranslations: TranslationTable = {
    en: {
        'module.media.name': 'Media Banner',
        'module.media.desc': 'Show a GIF or image above the file explorer, with an easy picker.',
        'media.banner.empty': 'Add banner image',
        'media.picker.title': 'Banner picture',
        'media.picker.search': 'Find a picture, or paste a link…',
        'media.picker.current': 'On the banner now',
        'media.picker.clear': 'Remove banner',
        'media.picker.saved': 'Saved',
        'media.picker.vault': 'In the vault',
        'media.picker.link': 'From the link',
        'media.picker.use': 'Put on the banner',
        'media.picker.save': 'Save',
        'media.picker.unsave': 'Remove from saved',
        'media.picker.empty': 'No pictures in the vault yet. A link to one can be pasted above.',
        'media.picker.noMatch': 'Nothing is called “{query}”.',
        'media.picker.broken': 'No picture at this link',
        'media.picker.more': 'and {count} more — the search finds them',
    },
    ru: {
        'module.media.name': 'Медиа-баннер',
        'module.media.desc': 'GIF или картинка над проводником файлов, с удобным выбором.',
        'media.banner.empty': 'Добавить баннер',
        'media.picker.title': 'Картинка баннера',
        'media.picker.search': 'Найти картинку или вставить ссылку…',
        'media.picker.current': 'Сейчас на баннере',
        'media.picker.clear': 'Убрать баннер',
        'media.picker.saved': 'Сохранённые',
        'media.picker.vault': 'В хранилище',
        'media.picker.link': 'По ссылке',
        'media.picker.use': 'Поставить на баннер',
        'media.picker.save': 'Сохранить',
        'media.picker.unsave': 'Убрать из сохранённых',
        'media.picker.empty': 'В хранилище пока нет картинок. Ссылку на картинку можно вставить выше.',
        'media.picker.noMatch': 'Ничего с названием «{query}».',
        'media.picker.broken': 'По этой ссылке нет картинки',
        'media.picker.more': 'и ещё {count} — их найдёт поиск',
    },
    zh: {
        'module.media.name': '横幅图片',
        'module.media.desc': '在文件列表上方显示 GIF 或图片，并提供便捷的选择器。',
        'media.banner.empty': '添加横幅图片',
        'media.picker.title': '横幅图片',
        'media.picker.search': '查找图片，或粘贴链接…',
        'media.picker.current': '当前横幅',
        'media.picker.clear': '移除横幅',
        'media.picker.saved': '已保存',
        'media.picker.vault': '库中图片',
        'media.picker.link': '来自链接',
        'media.picker.use': '设为横幅',
        'media.picker.save': '保存',
        'media.picker.unsave': '从已保存中移除',
        'media.picker.empty': '库中还没有图片。可以在上方粘贴图片链接。',
        'media.picker.noMatch': '没有名为“{query}”的图片。',
        'media.picker.broken': '此链接没有图片',
        'media.picker.more': '还有 {count} 张——可通过搜索找到',
    },
};
