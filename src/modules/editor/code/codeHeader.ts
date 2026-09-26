import { Notice, setIcon } from 'obsidian';
import { translateNow } from '../../../core/i18n';
import type { CodeLanguage } from './languages';

/**
 * The strip across the top of a code block: the language's icon and name, the
 * block's title after it, a copy button and the fold arrow. One builder for
 * both modes, so a block looks the same whether the note is being read or
 * written.
 */

export interface HeaderParts {
    title: string;
    icons: boolean;
    /** The code as it would be copied, read at the moment of copying. */
    textOf: () => string;
    /** Present when the block can fold; `folded` is how it is drawn now. */
    fold?: { folded: boolean; toggle: () => void };
}

export function buildCodeHeader(language: CodeLanguage, parts: HeaderParts): HTMLElement {
    const header = createDiv({ cls: 'zenith-code__head' });

    if (parts.icons) {
        if (language.icon) {
            header.createEl('img', {
                cls: 'zenith-code__icon',
                attr: { src: language.icon, alt: '', draggable: 'false' },
            });
        } else {
            setIcon(header.createSpan({ cls: 'zenith-code__icon is-generic' }), 'code');
        }
    }

    const label = header.createSpan({ cls: 'zenith-code__label' });
    label.createSpan({
        cls: 'zenith-code__lang',
        text: language.name || translateNow('editor.code.plain'),
    });
    if (parts.title) {
        label.createSpan({ cls: 'zenith-code__sep', text: ' - ' });
        label.createSpan({ cls: 'zenith-code__title', text: parts.title });
    }

    const copy = button(header, 'zenith-code__copy', 'copy', translateNow('editor.code.copy'));
    copy.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyCode(parts.textOf(), copy);
    });

    const fold = parts.fold;
    if (fold) {
        header.addClass('is-foldable');
        header.toggleClass('is-folded', fold.folded);
        const arrow = button(
            header,
            'zenith-code__fold',
            'chevron-down',
            translateNow(fold.folded ? 'editor.code.unfold' : 'editor.code.fold')
        );
        arrow.setAttr('aria-expanded', String(!fold.folded));
        arrow.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fold.toggle();
        });
    }

    return header;
}

/** A header button that never takes the editor's cursor with it. */
function button(header: HTMLElement, cls: string, icon: string, label: string): HTMLElement {
    const el = header.createEl('button', {
        cls: `${cls} clickable-icon`,
        attr: { type: 'button', 'aria-label': label },
    });
    setIcon(el, icon);
    // Pressed without moving the cursor, or the block would open for editing
    // under the finger that only wanted its text or its arrow.
    el.addEventListener('mousedown', (e) => e.preventDefault());
    return el;
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
