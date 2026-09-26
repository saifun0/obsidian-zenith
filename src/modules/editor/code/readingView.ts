import type { MarkdownPostProcessorContext } from 'obsidian';
import { translateNow } from '../../../core/i18n';
import { buildCodeHeader } from './codeHeader';
import { codeText, findFencedBlocks, lineCount, type FenceInfo } from './fences';
import { languageOfClass, resolveLanguage, type CodeLanguage } from './languages';
import { startsFolded, type CodeBlockOptions } from './options';

/**
 * Code blocks in reading view: Obsidian's `pre > code`, given a header, a
 * gutter of line numbers and the language's stripe.
 *
 * The `code` element itself is left alone. Obsidian highlights it after this
 * runs — Prism is loaded when first needed — and highlighting rewrites its
 * contents; anything put inside would be wiped. So the numbers are a column
 * beside it, and the block does not wrap its lines (see `editor.css`), which
 * is what keeps each number level with its line.
 *
 * The rendered block keeps only the fence's first word, as its class, so the
 * rest — the title and the fold marker — is read from the note's own lines
 * for the section. Where Obsidian gives no lines (a block drawn outside a
 * note), the block gets its language and no more.
 */

export function decorateCodeBlocks(
    root: HTMLElement,
    options: CodeBlockOptions,
    ctx?: MarkdownPostProcessorContext
): void {
    // A decorated block's code sits in its body, not directly in `pre`, so a
    // second pass over the same section finds nothing to do.
    const codes = Array.from(root.querySelectorAll<HTMLElement>('pre > code'));
    if (!codes.length) return;
    // The section's fences in order, used only when they pair off one for one
    // with its blocks — an indented code block has none, and a guess would put
    // one block's title on another.
    const fences = sectionFences(root, ctx);
    const paired = fences && fences.length === codes.length ? fences : null;
    codes.forEach((code, i) => {
        const pre = code.parentElement;
        if (pre) decorateBlock(pre, code, paired?.[i] ?? null, options);
    });
}

function sectionFences(root: HTMLElement, ctx?: MarkdownPostProcessorContext): FenceInfo[] | null {
    const section = ctx?.getSectionInfo(root);
    if (!section) return null;
    // A block inside a callout or a quote: its lines carry the `>` markers.
    const lines = section.text
        .split('\n')
        .slice(section.lineStart, section.lineEnd + 1)
        .map((line) => line.replace(/^\s*(?:>\s?)+/, ''));
    return findFencedBlocks(lines);
}

/** One block, from what its fence says (or its class, when that is all there is). */
export function decorateBlock(
    pre: HTMLElement,
    code: HTMLElement,
    info: FenceInfo | null,
    options: CodeBlockOptions
): void {
    const language = resolveLanguage(info ? info.language : languageOfClass(code.className));
    const raw = code.textContent ?? '';
    pre.addClass('zenith-code');
    applyLanguage(pre, language, options);

    let folded = startsFolded(options, info?.fold ?? null, lineCount(raw));
    const toggle = () => {
        folded = !folded;
        setFolded(pre, header, folded);
    };
    const header = buildCodeHeader(language, {
        title: info?.title ?? '',
        icons: options.icons,
        textOf: () => codeText(code.textContent ?? ''),
        fold: options.fold ? { folded, toggle } : undefined,
    });
    // The whole header folds too: a small arrow is a hard thing to hit on a phone.
    if (options.fold) header.addEventListener('click', toggle);
    pre.toggleClass('is-folded', folded);

    const body = createDiv({ cls: 'zenith-code__body' });
    if (options.lineNumbers) {
        pre.addClass('has-line-numbers');
        const gutter = body.createDiv({ cls: 'zenith-code__gutter' });
        gutter.setAttr('aria-hidden', 'true');
        gutter.setText(Array.from({ length: lineCount(raw) }, (_, i) => String(i + 1)).join('\n'));
    }

    pre.insertBefore(header, code);
    pre.insertBefore(body, code);
    body.appendChild(code);
}

/** Folded or not, on the block, its header and the arrow's own label. */
export function setFolded(block: HTMLElement, header: HTMLElement, folded: boolean): void {
    block.toggleClass('is-folded', folded);
    header.toggleClass('is-folded', folded);
    const arrow = header.querySelector('.zenith-code__fold');
    arrow?.setAttr('aria-expanded', String(!folded));
    arrow?.setAttr('aria-label', translateFold(folded));
}

/** The language's colour on the block, for its stripe — or no stripe at all. */
export function applyLanguage(
    el: HTMLElement,
    language: CodeLanguage,
    options: Pick<CodeBlockOptions, 'stripe'>
): void {
    if (!options.stripe) el.addClass('no-stripe');
    else if (language.colour) el.setCssProps({ '--zenith-code-accent': language.colour });
}

function translateFold(folded: boolean): string {
    return translateNow(folded ? 'editor.code.unfold' : 'editor.code.fold');
}
