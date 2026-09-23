import React, { useState } from 'react';
import { apiVersion, Platform } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { ZENITH_MODULE_API_VERSION } from '../../../core/moduleApi';
import { Segmented } from '../../controls';
import { ComponentGallery } from './ComponentGallery';
import { InputGallery } from './InputGallery';
import { ModalGallery } from './ModalGallery';
import { ModuleDiagnostics } from './ModuleDiagnostics';
import { StateInspector } from './StateInspector';
import { StringsAudit } from './StringsAudit';

/**
 * Debug tools, reachable only from About.
 *
 * Deliberately not a row on the settings front door. Everything here answers a
 * question you only have while something is broken, and a permanent entry would
 * put a page of raw JSON one click from a page about accent colours.
 *
 * Six tabs, each a different kind of "is this what I think it is":
 * what the controls look like, what every dialog and every field looks like,
 * what the store holds, what the loader believes, and which language is
 * answering.
 */

type Tab = 'components' | 'modals' | 'inputs' | 'state' | 'modules' | 'strings';

export const DebugPanel: React.FC = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const [tab, setTab] = useState<Tab>('components');

    // One line rather than a facts table: it is the same handful of values
    // every time, and every one of them belongs in a bug report.
    const environment = [
        `Obsidian ${apiVersion}`,
        `Zenith ${plugin.manifest.version}`,
        Platform.isMobile ? 'mobile' : 'desktop',
        `module api ${ZENITH_MODULE_API_VERSION}`,
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
                    { value: 'strings', label: t('debug.tab.strings'), icon: 'languages' },
                ]}
            />

            {tab === 'components' && <ComponentGallery />}
            {tab === 'modals' && <ModalGallery />}
            {tab === 'inputs' && <InputGallery />}
            {tab === 'state' && <StateInspector />}
            {tab === 'modules' && <ModuleDiagnostics />}
            {tab === 'strings' && <StringsAudit />}
        </div>
    );
};
