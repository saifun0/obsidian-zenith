import React, { useState } from 'react';
import { apiVersion, Platform } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { StudyClockDebug } from '../../../modules/study/components/StudyClockDebug';
import { Segmented } from '../../controls';
import { ComponentGallery } from './ComponentGallery';
import { InputGallery } from './InputGallery';
import { ModalGallery } from './ModalGallery';
import { ModuleDiagnostics } from './ModuleDiagnostics';
import { NotificationDebug } from './NotificationDebug';
import { StateInspector } from './StateInspector';
import { StringsAudit } from './StringsAudit';
import { CodeGallery } from './CodeGallery';

/**
 * Debug tools, reachable only from About.
 *
 * Deliberately not a row on the settings front door. Everything here answers a
 * question you only have while something is broken, and a permanent entry would
 * put a page of raw JSON one click from a page about accent colours.
 *
 * Seven tabs, each a different kind of "is this what I think it is":
 * what the controls look like, what every dialog and every field looks like,
 * what the store holds, what the loader believes, whether a reminder reaches
 * you, and which language is answering. An eighth while Study is on: the
 * timetable at any hour, without waiting for it. And while the editor is on,
 * every kind of code block and every language it knows.
 */

type Tab =
    | 'components'
    | 'modals'
    | 'inputs'
    | 'state'
    | 'modules'
    | 'notify'
    | 'study'
    | 'code'
    | 'strings';

export const DebugPanel: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const [tab, setTab] = useState<Tab>('components');
    const study = useZenithStore((s) => s.settings.activeModuleIds.includes('study'));
    const editor = useZenithStore((s) => s.settings.activeModuleIds.includes('editor'));

    // One line rather than a facts table: it is the same handful of values
    // every time, and every one of them belongs in a bug report.
    const environment = [
        `Obsidian ${apiVersion}`,
        `Zenith ${plugin.manifest.version}`,
        Platform.isMobile ? 'mobile' : 'desktop',
        t.locale,
    ];

    return (
        <div className="zenith-settings__content zenith-debug">
            <div className="zenith-debug__env">{environment.join(' · ')}</div>

            <Segmented
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                options={[
                    { value: 'components', label: t('debug.tab.components'), icon: 'layout-grid' },
                    { value: 'modals', label: t('debug.tab.modals'), icon: 'app-window' },
                    { value: 'inputs', label: t('debug.tab.inputs'), icon: 'text-cursor-input' },
                    { value: 'state', label: t('debug.tab.state'), icon: 'braces' },
                    { value: 'modules', label: t('debug.tab.modules'), icon: 'blocks' },
                    { value: 'notify', label: t('debug.tab.notify'), icon: 'bell' },
                    ...(study
                        ? [{ value: 'study', label: t('debug.tab.study'), icon: 'graduation-cap' }]
                        : []),
                    ...(editor
                        ? [{ value: 'code', label: t('debug.tab.code'), icon: 'square-code' }]
                        : []),
                    { value: 'strings', label: t('debug.tab.strings'), icon: 'languages' },
                ]}
            />

            {tab === 'components' && <ComponentGallery />}
            {tab === 'modals' && <ModalGallery />}
            {tab === 'inputs' && <InputGallery />}
            {tab === 'state' && <StateInspector />}
            {tab === 'modules' && <ModuleDiagnostics />}
            {tab === 'notify' && <NotificationDebug />}
            {tab === 'study' && study && <StudyClockDebug />}
            {tab === 'code' && editor && <CodeGallery />}
            {tab === 'strings' && <StringsAudit />}
        </div>
    );
};
