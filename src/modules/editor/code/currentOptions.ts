import { isFeatureOn } from '../../../core/useFeature';
import { useZenithStore } from '../../../store';
import type { CodeBlockOptions } from './options';

/** The code-block options as the editor module's features and settings stand now. */
export function currentCodeOptions(): CodeBlockOptions {
    const { editorCodeFold, editorCodeFoldLines } = useZenithStore.getState().settings;
    return {
        lineNumbers: isFeatureOn('editor.codeLineNumbers'),
        icons: isFeatureOn('editor.codeIcons'),
        stripe: isFeatureOn('editor.codeStripe'),
        fold: isFeatureOn('editor.codeFold'),
        foldDefault: editorCodeFold,
        foldLines: editorCodeFoldLines,
    };
}
