import { coreSchema } from '../../settings/schema/types';

/**
 * Editor settings: its features, which the form adds on its own, and — only
 * while Code Styler is on — why those features are doing nothing.
 */
export function editorSettingsSchema(codeStylerOn: boolean) {
    return coreSchema({
        moduleId: 'editor',
        groups: codeStylerOn
            ? [
                  {
                      id: 'codeStyler',
                      fields: [
                          {
                              type: 'heading',
                              key: 'codeStyler',
                              labelKey: 'editor.codeStyler',
                              descKey: 'editor.codeStyler.desc',
                          },
                      ],
                  },
              ]
            : [],
    });
}
