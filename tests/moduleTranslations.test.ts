import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
    clearTranslations,
    hasTranslation,
    ownsTranslationKey,
    registerTranslations,
    translate,
    type TranslationTable,
} from '../src/core/i18n';
import { localizeModule, moduleDescriptionKey, moduleNameKey } from '../src/core/moduleLabels';

import { contentTranslations } from '../src/modules/content/i18n';
import { dashboardTranslations } from '../src/modules/dashboard/i18n';
import { journalTranslations } from '../src/modules/journal/i18n';
import { mediaTranslations } from '../src/modules/media/i18n';
import { navigatorTranslations } from '../src/modules/navigator/i18n';
import { pictureTranslations } from '../src/modules/picture/i18n';
import { prayerTranslations } from '../src/modules/prayer/i18n';
import { projectsTranslations } from '../src/modules/projects/i18n';
import { searchTranslations } from '../src/modules/search/i18n';
import { studyTranslations } from '../src/modules/study/i18n';
import { syncTranslations } from '../src/modules/sync/i18n';
import { tasksTranslations } from '../src/modules/tasks/i18n';
import { tasksCalendarTranslations } from '../src/modules/tasks-calendar/i18n';
import { weatherTranslations } from '../src/modules/weather/i18n';

const BUILT_IN: Array<[string, TranslationTable]> = [
    ['content', contentTranslations],
    ['dashboard', dashboardTranslations],
    ['journal', journalTranslations],
    ['media', mediaTranslations],
    ['navigator', navigatorTranslations],
    ['picture', pictureTranslations],
    ['prayer', prayerTranslations],
    ['projects', projectsTranslations],
    ['search', searchTranslations],
    ['study', studyTranslations],
    ['sync', syncTranslations],
    ['tasks', tasksTranslations],
    ['tasks-calendar', tasksCalendarTranslations],
    ['weather', weatherTranslations],
];

/** A stand-in for the `t` a component holds, bound to one locale. */
const translatorFor = (locale: 'en' | 'ru') =>
    Object.assign((key: string) => translate(locale, key), {
        has: (key: string) => hasTranslation(locale, key),
        plural: (key: string) => key,
        locale,
    });

describe('registerTranslations', () => {
    afterEach(() => {
        clearTranslations('demo');
        clearTranslations('journal');
    });

    it('answers in the reader’s language', () => {
        registerTranslations('demo', {
            en: { 'module.demo.name': 'Demo' },
            ru: { 'module.demo.name': 'Демо' },
        });

        expect(translate('en', 'module.demo.name')).toBe('Demo');
        expect(translate('ru', 'module.demo.name')).toBe('Демо');
    });

    it('falls back to the module’s own English when a locale is missing', () => {
        registerTranslations('demo', { en: { 'demo.hello': 'Hello' } });
        expect(translate('ru', 'demo.hello')).toBe('Hello');
    });

    it('refuses a key outside the module’s namespace', () => {
        // The whole point: a module that could redefine this could also
        // redefine the sentence warning the user about that very module.
        registerTranslations('demo', { ru: { 'settings.title': 'Захвачено' } });
        expect(translate('ru', 'settings.title')).toBe('Zenith');
    });

    it('cannot take a key Zenith already answers in that language', () => {
        const before = translate('ru', 'journal.title');
        registerTranslations('journal', { ru: { 'journal.title': 'нет' } });
        expect(translate('ru', 'journal.title')).toBe(before);
    });

    it('takes the strings back when the module goes', () => {
        const dispose = registerTranslations('demo', { en: { 'demo.hello': 'Hello' } });
        expect(hasTranslation('en', 'demo.hello')).toBe(true);
        dispose();
        expect(hasTranslation('en', 'demo.hello')).toBe(false);
    });

    it('replaces the earlier chunk on the same channel, which is what a reload does', () => {
        registerTranslations('demo', { en: { 'demo.hello': 'First' } });
        registerTranslations('demo', { en: { 'demo.hello': 'Second' } });
        expect(translate('en', 'demo.hello')).toBe('Second');
    });

    it('keeps the manifest chunk when the module’s own chunk is dropped', () => {
        // Unloading a module must not un-name it: its row stays in settings,
        // and the manifest is what the row was reading before it ever ran.
        registerTranslations('demo', { ru: { 'module.demo.name': 'Из манифеста' } }, 'manifest');
        const dispose = registerTranslations('demo', { ru: { 'demo.hello': 'Привет' } });

        dispose();

        expect(hasTranslation('ru', 'demo.hello')).toBe(false);
        expect(translate('ru', 'module.demo.name')).toBe('Из манифеста');
    });

    it('recognises only its own namespace', () => {
        expect(ownsTranslationKey('demo', 'demo.hello')).toBe(true);
        expect(ownsTranslationKey('demo', 'module.demo.name')).toBe(true);
        expect(ownsTranslationKey('demo', 'settings.title')).toBe(false);
        // A prefix match on the bare id would let "demo" speak for "demo-pro".
        expect(ownsTranslationKey('demo', 'demo-pro.hello')).toBe(false);
    });
});

describe('localizeModule', () => {
    afterEach(() => clearTranslations('demo'));

    it('leaves an untranslated module exactly as its author wrote it', () => {
        const module = { id: 'demo', name: 'Demo', description: 'Does things.' };
        expect(localizeModule(translatorFor('ru'), module)).toEqual(module);
    });

    it('never renders a bare key', () => {
        const module = { id: 'demo', name: 'Demo', description: 'Does things.' };
        const shown = localizeModule(translatorFor('ru'), module);
        expect(shown.name).not.toContain(moduleNameKey('demo'));
        expect(shown.description).not.toContain(moduleDescriptionKey('demo'));
    });

    it('uses the translation where there is one', () => {
        registerTranslations('demo', {
            ru: { 'module.demo.name': 'Демо', 'module.demo.desc': 'Делает всякое.' },
        });
        const shown = localizeModule(translatorFor('ru'), {
            id: 'demo',
            name: 'Demo',
            description: 'Does things.',
        });
        expect(shown).toEqual({ id: 'demo', name: 'Демо', description: 'Делает всякое.' });
    });

    it('keeps the untranslated half when only one key is there', () => {
        registerTranslations('demo', { ru: { 'module.demo.name': 'Демо' } });
        const shown = localizeModule(translatorFor('ru'), {
            id: 'demo',
            name: 'Demo',
            description: 'Does things.',
        });
        expect(shown.name).toBe('Демо');
        expect(shown.description).toBe('Does things.');
    });
});

describe('built-in module chunks', () => {
    it('names and describes every module in both languages', () => {
        for (const [id, table] of BUILT_IN) {
            expect(table.en?.[moduleNameKey(id)], `${id} en name`).toBeTruthy();
            expect(table.ru?.[moduleNameKey(id)], `${id} ru name`).toBeTruthy();
            expect(table.en?.[moduleDescriptionKey(id)], `${id} en desc`).toBeTruthy();
            expect(table.ru?.[moduleDescriptionKey(id)], `${id} ru desc`).toBeTruthy();
        }
    });

    it('defines the same keys in both languages', () => {
        for (const [id, table] of BUILT_IN) {
            expect(Object.keys(table.en ?? {}).sort(), id).toEqual(
                Object.keys(table.ru ?? {}).sort()
            );
        }
    });

    it('stays inside its own namespace, exactly as a third-party one must', () => {
        for (const [id, table] of BUILT_IN) {
            for (const chunk of Object.values(table)) {
                for (const key of Object.keys(chunk)) {
                    expect(ownsTranslationKey(id, key), `${id} → ${key}`).toBe(true);
                }
            }
        }
    });

    it('covers every module that ships', () => {
        // A module added without a chunk is invisible: it simply renders in
        // English inside a Russian settings page, which is the bug this whole
        // mechanism exists to fix.
        const folders = readdirSync('src/modules', { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        expect(BUILT_IN.map(([id]) => id).sort()).toEqual(folders);
    });
});
