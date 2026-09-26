import { Notice, setIcon } from 'obsidian';
import { translateNow } from '../../../core/i18n';
import type { CodeLanguage } from './languages';

/**
 * The strip across the top of a code block: the language's icon and name, and
 * a copy button. One builder for both modes, so a block looks the same whether
 * the note is being read or written.
 */
export function buildCodeHeader(language: CodeLanguage, textOf: () => string): HTMLElement {
    const header = createDiv({ cls: 'zenith-code__head' });

    if (language.icon) {
        header.createEl('img', {
            cls: 'zenith-code__icon',
            attr: { src: language.icon, alt: '', draggable: 'false' },
        });
    } else {
        setIcon(header.createSpan({ cls: 'zenith-code__icon is-generic' }), 'code');
    }

    header.createSpan({
        cls: 'zenith-code__lang',
        text: language.name || translateNow('editor.code.plain'),
    });

    const button = header.createEl('button', {
        cls: 'zenith-code__copy clickable-icon',
        attr: { type: 'button', 'aria-label': translateNow('editor.code.copy') },
    });
    setIcon(button, 'copy');
    // Pressed without taking the editor's cursor, or the block would open for
    // editing under the finger that only wanted its text.
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyCode(textOf(), button);
    });

    return header;
}

/** The pending "copied" reset per button, so a second press restarts it. */
const resets = new WeakMap<HTMLElement, number>();

async function copyCode(text: string, button: HTMLElement): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        new Notice(translateNow('editor.code.copyFailed'));
        return;
    }

    setIcon(button, 'check');
    button.addClass('is-copied');
    button.setAttr('aria-label', translateNow('editor.code.copied'));

    window.clearTimeout(resets.get(button));
    resets.set(
        button,
        window.setTimeout(() => {
            setIcon(button, 'copy');
            button.removeClass('is-copied');
            button.setAttr('aria-label', translateNow('editor.code.copy'));
        }, 1500)
    );
}
