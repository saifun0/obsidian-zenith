import { buildCodeHeader } from './codeHeader';
import { codeText, lineCount } from './fences';
import { languageOfClass, resolveLanguage, type CodeLanguage } from './languages';

/**
 * Code blocks in reading view: Obsidian's `pre > code`, given a header, a
 * gutter of line numbers and the language's stripe.
 *
 * The `code` element itself is left alone. Obsidian highlights it after this
 * runs — Prism is loaded when first needed — and highlighting rewrites its
 * contents; anything put inside would be wiped. So the numbers are a column
 * beside it, and the block does not wrap its lines (see `editor.css`), which
 * is what keeps each number level with its line.
 */

export interface CodeBlockOptions {
    lineNumbers: boolean;
}

export function decorateCodeBlocks(root: HTMLElement, options: CodeBlockOptions): void {
    // A decorated block's code sits in its body, not directly in `pre`, so a
    // second pass over the same section finds nothing to do.
    for (const code of Array.from(root.querySelectorAll<HTMLElement>('pre > code'))) {
        const pre = code.parentElement;
        if (pre) decorate(pre, code, options);
    }
}

function decorate(pre: HTMLElement, code: HTMLElement, options: CodeBlockOptions): void {
    const language = resolveLanguage(languageOfClass(code.className));
    pre.addClass('zenith-code');
    applyLanguage(pre, language);

    const header = buildCodeHeader(language, () => codeText(code.textContent ?? ''));
    const body = createDiv({ cls: 'zenith-code__body' });
    if (options.lineNumbers) {
        pre.addClass('has-line-numbers');
        const gutter = body.createDiv({ cls: 'zenith-code__gutter' });
        gutter.setAttr('aria-hidden', 'true');
        const count = lineCount(code.textContent ?? '');
        gutter.setText(Array.from({ length: count }, (_, i) => String(i + 1)).join('\n'));
    }

    pre.insertBefore(header, code);
    pre.insertBefore(body, code);
    body.appendChild(code);
}

/** The language's colour on the block, for its stripe. */
export function applyLanguage(el: HTMLElement, language: CodeLanguage): void {
    if (language.colour) el.setCssProps({ '--zenith-code-accent': language.colour });
}
