import React, { type FC } from 'react';
import { Modal, Notice } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useZenithStore } from '../../store';
import { translateNow, useTranslation } from '../i18n';
import { getTodayString } from '../dateUtils';
import { DynamicIcon } from '../../components/shared/DynamicIcon';
import { applyProfile } from './profileActions';
import { TEMPLATES, templateProfile } from './templates';

/**
 * The first thing a fresh install shows: pick how you will use Zenith.
 *
 * One click applies a template — there is nothing yet to lose, and "put it
 * back" is in Settings → Profiles all the same. Closing the dialog, or
 * choosing to keep everything, is an answer too: it is not asked again on
 * this device.
 *
 * Only ever for a config that started empty. Anyone upgrading was already
 * using Zenith their own way, and a snapshot of that way is waiting in their
 * profiles instead.
 */
export class FirstRunModal extends Modal {
    private root: Root | null = null;

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(translateNow('profiles.firstRun.title'));
        contentEl.addClass('zenith-root', 'zenith-first-run');
        this.root = createRoot(contentEl.createDiv());
        this.root.render(<FirstRun onDone={() => this.close()} />);
    }

    onClose(): void {
        useZenithStore.getState().updateSettings({ profilesOnboarded: true });
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}

const FirstRun: FC<{ onDone: () => void }> = ({ onDone }) => {
    const t = useTranslation();

    const pick = (id: string) => {
        const tpl = TEMPLATES.find((x) => x.id === id);
        if (!tpl) return;
        const name = t(`profiles.template.${id}`);
        applyProfile(templateProfile(tpl, name, getTodayString()), 'replace', true, name);
        new Notice(t('profiles.firstRun.done', { name }));
        onDone();
    };

    return (
        <div className="zenith-first-run__body">
            <p className="zenith-first-run__lead">{t('profiles.firstRun.lead')}</p>
            <div className="zenith-first-run__grid">
                {TEMPLATES.map((tpl) => (
                    <button
                        key={tpl.id}
                        type="button"
                        className="zenith-first-run__card"
                        onClick={() => pick(tpl.id)}
                    >
                        <DynamicIcon name={tpl.icon} size={20} />
                        <span className="zenith-first-run__name">
                            {t(`profiles.template.${tpl.id}`)}
                        </span>
                        <span className="zenith-first-run__desc">
                            {t(`profiles.template.${tpl.id}.desc`)}
                        </span>
                    </button>
                ))}
            </div>
            <button type="button" className="zenith-btn zenith-btn--ghost" onClick={onDone}>
                {t('profiles.firstRun.keep')}
            </button>
        </div>
    );
};
