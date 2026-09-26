import React, { useEffect, useMemo, useRef } from 'react';
import { loadPrism } from 'obsidian';
import { useTranslation } from '../../../core/i18n';
import { setFeature, useFeature } from '../../../core/useFeature';
import type { FeatureId } from '../../../core/features';
import { useZenithStore } from '../../../store';
import { buildCodeHeader } from '../../../modules/editor/code/codeHeader';
import { currentCodeOptions } from '../../../modules/editor/code/currentOptions';
import { findFencedBlocks } from '../../../modules/editor/code/fences';
import { languageTable, type LanguageEntry } from '../../../modules/editor/code/languages';
import { applyLanguage, decorateBlock } from '../../../modules/editor/code/readingView';
import { SettingRow, Toggle } from '../../controls';
import { Demo, Section } from './ComponentGallery';

/**
 * Every kind of code block the editor module draws, and every language it
 * knows, on one page.
 *
 * Each block is drawn by the same function reading view uses, from its fence
 * as written, and highlighted by Obsidian's own Prism — not through the
 * Markdown renderer, because a block rendered outside a note gets no lines
 * back from Obsidian, and without them there is no title and no `+` / `-`.
 * The switches are the real ones: flipping them here flips them everywhere.
 *
 * The label on each specimen names the case and is not translated, as
 * elsewhere in the debug tools.
 */

const long = `const message = ${JSON.stringify('a line long enough to leave the block and make it scroll sideways, '.repeat(3))};`;
const hundred = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');

const VARIANTS: Array<[label: string, markdown: string]> = [
    ['html', '```html\n<!DOCTYPE html>\n<html lang="ru">\n  <body>Привет</body>\n</html>\n```'],
    ['html · title', '```html Стандартный скелет\n<!DOCTYPE html>\n<html></html>\n```'],
    ['- · folded, with a title', '```js - Свёрнут с самого начала\nconsole.log("hidden");\n```'],
    ['+ · open, whatever the default', '```python + Развёрнут всегда\nprint("shown")\n```'],
    ['- · folded, no title', '```css -\n.note { color: red; }\n```'],
    ['Code Styler · title:"…" fold', '```ts title:"Из Code Styler" fold\nconst old = true;\n```'],
    ['typescript', '```ts\ninterface Note {\n  title: string;\n}\n```'],
    ['bash · borrowed icon', '```bash\nnpm run build\n```'],
    ['JSON · upper case', '```JSON\n{ "zenith": true }\n```'],
    ['~~~ · tilde fence', '~~~css\n.note { color: red; }\n~~~'],
    ['no language', '```\nplain text\n```'],
    ['no language · title', '``` + Просто заметка\nplain text\n```'],
    ['unknown word', '```todo\nсвоё слово после ограды\n```'],
    ['one line', '```sql\nSELECT 1;\n```'],
    ['empty', '```js\n```'],
    ['long line · scrolls', '```js\n' + long + '\n```'],
    ['120 lines · three digits', '```text\n' + hundred + '\n```'],
];

const SWITCHES: FeatureId[] = [
    'editor.codeBlocks',
    'editor.codeLineNumbers',
    'editor.codeFold',
    'editor.codeIcons',
    'editor.codeStripe',
];

export const CodeGallery: React.FC = () => {
    const t = useTranslation();
    // Redrawn whenever anything the blocks read changes, and only then.
    const state = useZenithStore(() => JSON.stringify(currentCodeOptions()));
    const table = useMemo(() => languageTable(), []);

    return (
        <>
            <Section title={t('debug.code.switches')}>
                <Demo label={SWITCHES.join(' · ')} wide>
                    {SWITCHES.map((id) => (
                        <Switch key={id} id={id} />
                    ))}
                </Demo>
            </Section>

            <Section title={t('debug.code.blocks')}>
                {VARIANTS.map(([label, markdown]) => (
                    <Demo key={label} label={label} wide>
                        <Block markdown={markdown} state={state} />
                    </Demo>
                ))}
            </Section>

            <Section title={t('debug.code.styled', { count: String(table.styled.length) })}>
                <Demo label="header, stripe, and the words that lead to it" wide>
                    <LanguageGrid entries={table.styled} />
                </Demo>
            </Section>

            <Section title={t('debug.code.plain', { count: String(table.plain.length) })}>
                <Demo label="name ← words" wide>
                    <div className="zenith-debug__code-plain">
                        {table.plain.map(({ language, words }) => (
                            <span key={language.name}>
                                <b>{language.name}</b> ← {words.join(', ')}
                            </span>
                        ))}
                    </div>
                </Demo>
            </Section>
        </>
    );
};

const Switch: React.FC<{ id: FeatureId }> = ({ id }) => {
    const t = useTranslation();
    const on = useFeature(id);
    return (
        <SettingRow label={t(`feature.${id}`)}>
            <Toggle checked={on} onChange={(v) => setFeature(id, v)} />
        </SettingRow>
    );
};

/** One block, from its fence as written, drawn and highlighted as a note would. */
const Block: React.FC<{ markdown: string; state: string }> = ({ markdown, state }) => {
    const ref = useRef<HTMLDivElement>(null);
    const blocks = useFeature('editor.codeBlocks');

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.empty();
        const lines = markdown.split('\n');
        const [fence] = findFencedBlocks(lines);
        if (!fence) return;
        const pre = el.createEl('pre');
        const code = pre.createEl('code');
        if (fence.language) {
            pre.addClass(`language-${fence.language}`);
            code.addClass(`language-${fence.language}`);
        }
        code.setText(lines.slice(fence.open + 1, fence.close ?? lines.length).join('\n') + '\n');
        if (blocks) decorateBlock(pre, code, fence, currentCodeOptions());
        if (fence.language) {
            void loadPrism().then((prism: { highlightElement(el: Element): void }) => {
                if (code.isConnected) prism.highlightElement(code);
            });
        }
    }, [markdown, state, blocks]);

    return <div ref={ref} className="markdown-rendered zenith-debug__code" />;
};

/** One header per language, drawn by the same builder the notes use. */
const LanguageGrid: React.FC<{ entries: LanguageEntry[] }> = ({ entries }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.empty();
        for (const { language, words } of entries) {
            const tile = el.createDiv({ cls: 'zenith-debug__code-tile zenith-code' });
            applyLanguage(tile, language, { stripe: true });
            tile.appendChild(
                buildCodeHeader(language, {
                    title: '',
                    icons: true,
                    textOf: () => words.join(', '),
                })
            );
            tile.createDiv({ cls: 'zenith-debug__code-words', text: words.join(', ') || '—' });
        }
    }, [entries]);

    return <div ref={ref} className="zenith-debug__code-grid" />;
};
