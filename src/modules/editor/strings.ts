/**
 * Editor strings, merged into the dictionary in `core/i18n.ts`. The module's
 * name and description are in its own chunk, `i18n.ts`.
 */
export const EDITOR_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'editor.code.plain': 'Text',
        'editor.code.copy': 'Copy code',
        'editor.code.copied': 'Copied',
        'editor.code.copyFailed': 'Zenith: could not copy the code.',
        'editor.codeStyler': 'Code Styler is on',
        'editor.codeStyler.desc':
            'It draws code blocks too, so Zenith leaves them to it. Switch Code Styler off in Community plugins to use Zenith’s.',
    },
    ru: {
        'editor.code.plain': 'Текст',
        'editor.code.copy': 'Копировать код',
        'editor.code.copied': 'Скопировано',
        'editor.code.copyFailed': 'Zenith: не удалось скопировать код.',
        'editor.codeStyler': 'Включён Code Styler',
        'editor.codeStyler.desc':
            'Он тоже оформляет блоки кода, поэтому Zenith их не трогает. Выключите Code Styler в сторонних плагинах, чтобы работало оформление Zenith.',
    },
};
