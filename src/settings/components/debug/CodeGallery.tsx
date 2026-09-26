import React, { useEffect, useMemo, useRef } from 'react';
import { Component, MarkdownRenderer } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { setFeature, useFeature } from '../../../core/useFeature';
import { buildCodeHeader } from '../../../modules/editor/code/codeHeader';
import { languageTable } from '../../../modules/editor/code/languages';
import { applyLanguage } from '../../../modules/editor/code/readingView';
import { SettingRow, Toggle } from '../../controls';
import { Demo, Section } from './ComponentGallery';

/**
 * Every kind of code block the editor module draws, and every language it
 * knows, on one page.
 *
 * The blocks go through Obsidian's own renderer, so what is on this page is
 * what a note shows: Obsidian's highlighting, the module's header, gutter and
 * stripe, as the switches above them are set right now. The switches are the
 * real ones — flipping them here flips them everywhere.
 *
 * The label on each specimen names the case and is not translated, as
 * elsewhere in the debug tools.
 */

const long = `const message = ${JSON.stringify('a line long enough to leave the block and make it scroll sideways, '.repeat(3))};`;
const hundred = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');

const VARIANTS: Array<[label: string, markdown: string]> = [
    ['html', '```html\n<!DOCTYPE html>\n<html lang="ru">\n  <body>Привет</body>\n</html>\n```'],
    ['typescript', '```ts\ninterface Note {\n  title: string;\n}\n```'],
    [
        'python · words after the language',
        '```python title:"demo"\ndef greet(name):\n    return f"Hi, {name}"\n```',
    ],
    ['bash · borrowed icon', '```bash\nnpm run build\n```'],
    ['JSON · upper case', '```JSON\n{ "zenith": true }\n```'],
    ['~~~ · tilde fence', '~~~css\n.note { color: red; }\n~~~'],
    ['no language', '```\nplain text\n```'],
    ['unknown word', '```todo\nсвоё слово после ограды\n```'],
    ['one line', '```sql\nSELECT 1;\n```'],
    ['empty', '```js\n```'],
    ['long line · scrolls', '```js\n' + long + '\n```'],
    ['120 lines · three digits', '```text\n' + hundred + '\n```'],
];

export const CodeGallery: React.FC = () => {
    const t = useTranslation();
    const blocks = useFeature('editor.codeBlocks');
    const numbers = useFeature('editor.codeLineNumbers');
    // Redrawn whenever a switch flips: a rendered block keeps what it was drawn with.
    const state = `${blocks}|${numbers}`;
    const table = useMemo(() => languageTable(), []);

    return (
        <>
            <Section title={t('debug.code.switches')}>
                <Demo label="editor.codeBlocks · editor.codeLineNumbers" wide>
                    <SettingRow label={t('feature.editor.codeBlocks')}>
                        <Toggle
                            checked={blocks}
                            onChange={(v) => setFeature('editor.codeBlocks', v)}
                        />
                    </SettingRow>
                    <SettingRow label={t('feature.editor.codeLineNumbers')}>
                        <Toggle
                            checked={numbers}
                            disabled={!blocks}
                            onChange={(v) => setFeature('editor.codeLineNumbers', v)}
                        />
                    </SettingRow>
                </Demo>
            </Section>

            <Section title={t('debug.code.blocks')}>
                {VARIANTS.map(([label, markdown]) => (
                    <Demo key={label} label={label} wide>
                        <Rendered markdown={markdown} state={state} />
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

/** Markdown through Obsidian's renderer, post-processors and highlighting included. */
const Rendered: React.FC<{ markdown: string; state: string }> = ({ markdown, state }) => {
    const { app } = useApp();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const owner = new Component();
        owner.load();
        el.empty();
        void MarkdownRenderer.render(app, markdown, el, '', owner);
        return () => owner.unload();
    }, [app, markdown, state]);

    return <div ref={ref} className="markdown-rendered zenith-debug__code" />;
};

/** One header per language, drawn by the same builder the notes use. */
const LanguageGrid: React.FC<{ entries: ReturnType<typeof languageTable>['styled'] }> = ({
    entries,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.empty();
        for (const { language, words } of entries) {
            const tile = el.createDiv({ cls: 'zenith-debug__code-tile zenith-code' });
            applyLanguage(tile, language);
            tile.appendChild(buildCodeHeader(language, () => words.join(', ')));
            tile.createDiv({ cls: 'zenith-debug__code-words', text: words.join(', ') || '—' });
        }
    }, [entries]);

    return <div ref={ref} className="zenith-debug__code-grid" />;
};
