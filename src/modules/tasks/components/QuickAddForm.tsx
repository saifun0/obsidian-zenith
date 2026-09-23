import React, { useState, type FC } from 'react';
import { PRIORITIES, type Priority } from '../../../core/constants';
import { useTranslation } from '../../../core/i18n';
import { DateField, Dropdown } from '../../../components/ui/fields';

export interface QuickAddDraft {
    title: string;
    priority: Priority;
    dueDate: string;
    tags: string[];
}

const PRIORITY_KEY: Record<Priority, string> = {
    none: 'priority.none',
    low: 'priority.low',
    medium: 'priority.medium',
    high: 'priority.high',
    urgent: 'priority.urgent',
};

/**
 * The four questions quick capture asks.
 *
 * It was built from Obsidian's `Setting` rows, which meant a native select for
 * the priority and a native date box for the due date — the two most
 * platform-shaped controls there are, in the one dialog most likely to be
 * opened on a phone. The same fields as everywhere else now, and the labels
 * are translated, which the `Setting` version never was.
 */
export const QuickAddForm: FC<{
    onSubmit: (draft: QuickAddDraft) => Promise<void>;
    /** Off where the form is a specimen on a page, not the dialog itself. */
    autoFocus?: boolean;
}> = ({ onSubmit, autoFocus = true }) => {
    const t = useTranslation();
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState<Priority>('medium');
    const [dueDate, setDueDate] = useState('');
    const [tags, setTags] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await onSubmit({
                title: title.trim(),
                priority,
                dueDate,
                tags: tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter((tag) => tag.length > 0),
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="zenith-quick-add__form"
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
        >
            <label className="zenith-quick-add__field">
                <span className="zenith-quick-add__label">{t('tasks.editor.description')}</span>
                <input
                    className="zenith-input"
                    placeholder={t('tasks.editor.descriptionPlaceholder')}
                    value={title}
                    autoFocus={autoFocus}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </label>

            <div className="zenith-quick-add__row">
                <label className="zenith-quick-add__field">
                    <span className="zenith-quick-add__label">{t('tasks.editor.priority')}</span>
                    <Dropdown
                        value={priority}
                        options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_KEY[p]) }))}
                        onChange={(v) => setPriority(v as Priority)}
                    />
                </label>
                <label className="zenith-quick-add__field">
                    <span className="zenith-quick-add__label">{t('tasks.editor.due')}</span>
                    <DateField value={dueDate} onChange={setDueDate} />
                </label>
            </div>

            <label className="zenith-quick-add__field">
                <span className="zenith-quick-add__label">{t('tasks.editor.tags')}</span>
                <input
                    className="zenith-input"
                    placeholder={t('tasks.quickAdd.tagsPlaceholder')}
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />
            </label>

            <div className="zenith-quick-add__actions">
                <button type="submit" className="mod-cta" disabled={busy}>
                    {t('tasks.addTask')}
                </button>
            </div>
        </form>
    );
};
