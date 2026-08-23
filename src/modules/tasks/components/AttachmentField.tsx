import React, { useState, type FC } from 'react';
import { TFile } from 'obsidian';
import { CheckSquare, FileText, Image, Link2, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { PromptModal } from '../../../core/PromptModal';
import type { AttachmentKind, TaskAttachment } from '../services/taskDetails';

/**
 * The attachment list in the task editor.
 *
 * Four kinds, because they are four different intentions: a picture to look at,
 * a note to read, another task to get to, and a link off into the web. They all
 * end up as one line each under the task, so what is really being chosen here is
 * how that line gets written — an embed, a wikilink, an arrow, or a bare URL.
 *
 * Vault targets are typed rather than picked from a tree: Obsidian's own file
 * suggester isn't available to a plugin's React tree, and a text field that
 * accepts a path both exists already and can be pasted into.
 */

const KIND_ICON: Record<AttachmentKind, React.ReactNode> = {
    image: <Image size={13} />,
    note: <FileText size={13} />,
    task: <CheckSquare size={13} />,
    link: <Link2 size={13} />,
};

interface AttachmentFieldProps {
    value: TaskAttachment[];
    onChange: (next: TaskAttachment[]) => void;
}

export const AttachmentField: FC<AttachmentFieldProps> = ({ value, onChange }) => {
    const t = useTranslation();
    const { app } = useApp();
    const [adding, setAdding] = useState(false);

    /** Ask for a path or URL, then work out what kind of thing it is. */
    const add = async (kind: AttachmentKind) => {
        setAdding(true);
        try {
            const raw = await new PromptModal(app, {
                title: t(`tasks.attach.add.${kind}`),
                placeholder: t(`tasks.attach.placeholder.${kind}`),
                confirmText: t('common.add'),
                cancelText: t('common.cancel'),
            }).ask();
            if (raw === null) return;

            const target = raw.trim().replace(/^!?\[\[|\]\]$/g, '');
            if (!target) return;

            // A vault path is checked so a typo is caught here rather than
            // rendering as a broken embed later; a URL is taken as given.
            const isUrl = /^https?:\/\//i.test(target);
            if (!isUrl && kind !== 'link') {
                const file = app.vault.getAbstractFileByPath(target);
                if (!(file instanceof TFile)) {
                    const hit = app.metadataCache.getFirstLinkpathDest(target, '');
                    if (!hit) {
                        // Kept anyway: a link to a note you are about to write is
                        // a perfectly ordinary thing to want in Obsidian.
                        onChange([...value, { kind, target }]);
                        return;
                    }
                    onChange([...value, { kind, target: hit.path }]);
                    return;
                }
                onChange([...value, { kind, target: file.path }]);
                return;
            }
            onChange([...value, { kind, target }]);
        } finally {
            setAdding(false);
        }
    };

    const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

    return (
        <div className="zenith-field">
            <label className="zenith-field__label">{t('tasks.editor.attachments')}</label>

            {value.length > 0 && (
                <div className="zenith-attach__list">
                    {value.map((attachment, i) => (
                        <div key={`${attachment.target}:${i}`} className="zenith-attach__row">
                            <span className={`zenith-attach__icon is-${attachment.kind}`}>
                                {KIND_ICON[attachment.kind]}
                            </span>
                            <span className="zenith-attach__target" title={attachment.target}>
                                {attachment.label || attachment.target}
                            </span>
                            <button
                                type="button"
                                className="zenith-icon-ghost"
                                onClick={() => remove(i)}
                                aria-label={t('common.remove')}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="zenith-attach__add">
                {(['image', 'note', 'task', 'link'] as const).map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        className="zenith-add-row zenith-attach__btn"
                        disabled={adding}
                        onClick={() => void add(kind)}
                    >
                        <Plus size={13} />
                        {KIND_ICON[kind]}
                        {t(`tasks.attach.kind.${kind}`)}
                    </button>
                ))}
            </div>
        </div>
    );
};
