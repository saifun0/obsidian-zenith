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
        'editor.code.fold': 'Fold',
        'editor.code.unfold': 'Unfold',
        'settings.editorCodeFold': 'Blocks start',
        'settings.editorCodeFold.desc':
            'For a block with no `+` or `-` after its language. The arrow folds or opens any block afterwards.',
        'settings.editorCodeFold.open': 'Open',
        'settings.editorCodeFold.closed': 'Folded',
        'settings.editorCodeFold.long': 'Folded when long',
        'settings.editorCodeFoldLines': 'Long means more lines than',
        'editor.codeStyler': 'Code Styler is on',
        'editor.codeStyler.desc':
            'It draws code blocks too, so Zenith leaves them to it. Switch Code Styler off in Community plugins to use Zenith’s.',
    },
    ru: {
        'editor.code.plain': 'Текст',
        'editor.code.copy': 'Копировать код',
        'editor.code.copied': 'Скопировано',
        'editor.code.copyFailed': 'Zenith: не удалось скопировать код.',
        'editor.code.fold': 'Свернуть',
        'editor.code.unfold': 'Развернуть',
        'settings.editorCodeFold': 'Блоки открываются',
        'settings.editorCodeFold.desc':
            'Для блока без `+` или `-` после языка. Потом стрелка сворачивает и разворачивает любой блок.',
        'settings.editorCodeFold.open': 'Развёрнутыми',
        'settings.editorCodeFold.closed': 'Свёрнутыми',
        'settings.editorCodeFold.long': 'Свёрнутыми, если длинные',
        'settings.editorCodeFoldLines': 'Длинный — это больше строк, чем',
        'editor.codeStyler': 'Включён Code Styler',
        'editor.codeStyler.desc':
            'Он тоже оформляет блоки кода, поэтому Zenith их не трогает. Выключите Code Styler в сторонних плагинах, чтобы работало оформление Zenith.',
    },
};
