import React, { useMemo, useState, type FC } from 'react';
import { Notice, TFile } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { PRIORITIES, type Priority } from '../../../core/constants';
import { IconPickerModal } from '../../../core/IconPickerModal';
import { ColorInput, Select, SettingRow, TextInput, useFieldIds } from '../../../settings/controls';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { DateField } from '../../../components/ui/fields';
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '../projectsTypes';
import { ProjectWriter, projectFileName, type ProjectInput } from '../services/projectWriter';
import { ProjectCard } from './ProjectCard';

export interface ProjectFormProps {
    /** The project being edited, or nothing when one is being made. */
    project?: Project;
    /** A new project's name, already typed elsewhere — "проект Ремонт" in Search. */
    initialTitle?: string;
    onClose: () => void;
}

/** Comma-separated in the field, a list in the note. */
const splitTags = (raw: string): string[] =>
    raw
        .split(',')
        .map((s) => s.replace(/^#/, '').trim())
        .filter(Boolean);

/**
 * Describing a project.
 *
 * Every field the note can hold, on one screen, with nothing folded away. A
 * project is created about once a fortnight and this is the one moment its
 * author has the whole of it in mind; hiding half the form to keep the window
 * small saves a scroll and costs the description, the colour and the deadline
 * that would otherwise have been set now and never afterwards.
 *
 * The same form creates and edits, which is what keeps `icon` and `color` from
 * being write-once fields — before this they could only be changed by opening
 * the note and editing YAML by hand.
 */
export const ProjectForm: FC<ProjectFormProps> = ({ project, initialTitle, onClose }) => {
    const t = useTranslation();
    const { app } = useApp();
    const folder = useZenithStore((s) => s.settings.projectsFolderPath);

    const editing = !!project;
    const [title, setTitle] = useState(project?.title ?? initialTitle ?? '');
    const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
    const [priority, setPriority] = useState<Priority>(project?.priority ?? 'medium');
    const [startDate, setStartDate] = useState(project?.startDate ?? '');
    const [targetDate, setTargetDate] = useState(project?.targetDate ?? '');
    const [tags, setTags] = useState((project?.tags ?? []).join(', '));
    const [taskTags, setTaskTags] = useState((project?.taskTags ?? []).join(', '));
    const [description, setDescription] = useState(project?.description ?? '');
    const [color, setColor] = useState(project?.color ?? '');
    const [icon, setIcon] = useState(project?.icon ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const input = (): ProjectInput => ({
        title: title.trim(),
        status,
        priority,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
        tags: splitTags(tags),
        taskTags: splitTags(taskTags),
        description: description.trim() || undefined,
        color: color.trim() || undefined,
        icon: icon.trim() || undefined,
    });

    /**
     * The card as it will be, from the values as they are.
     *
     * Built rather than fetched: the project does not exist yet when this is
     * a creation, and when it is an edit the stored copy is the old one. The
     * counts come from the real project where there is one, so an edit does
     * not redraw its own progress bar as empty.
     */
    const preview = useMemo<Project>(
        () => ({
            id: project?.id ?? 'preview',
            filePath: project?.filePath ?? '',
            fileName: project?.fileName ?? '',
            title: title.trim() || t('projects.template.title'),
            status,
            priority,
            startDate: startDate || undefined,
            targetDate: targetDate || undefined,
            tags: splitTags(tags),
            taskTags: splitTags(taskTags),
            description: description.trim() || undefined,
            color: color.trim() || undefined,
            icon: icon.trim() || undefined,
            tasks: [],
            stats: project?.stats ?? {
                totalTasks: 0,
                completedTasks: 0,
                inProgressTasks: 0,
                progressPercent: 0,
                isOverdue: false,
            },
        }),
        [
            project,
            title,
            status,
            priority,
            startDate,
            targetDate,
            tags,
            taskTags,
            description,
            color,
            icon,
            t,
        ]
    );

    const submit = async () => {
        if (!title.trim()) {
            setError(t('projects.form.name.required'));
            return;
        }
        setBusy(true);
        try {
            const writer = new ProjectWriter(app);
            if (project) {
                const file = app.vault.getAbstractFileByPath(project.filePath);
                // The note can go while the form is open — renamed in the
                // file tree, or deleted from another device by sync.
                if (!(file instanceof TFile)) throw new Error(`gone: ${project.filePath}`);
                await writer.update(file, input());
                new Notice(t('projects.notice.saved'));
            } else {
                const file = await writer.create(folder, input());
                new Notice(t('projects.notice.created'));
                // The note is the project: its fields are set, its body is a
                // skeleton, and what comes next is written rather than picked.
                await app.workspace.openLinkText(file.path, '', false);
            }
            onClose();
        } catch (err) {
            console.error('Zenith: failed to save the project:', err);
            new Notice(t('projects.notice.saveFailed'));
            setBusy(false);
        }
    };

    return (
        <div className="zenith-project-form">
            <div className="zenith-project-form__preview">
                <span className="zenith-settings__section-label">{t('projects.form.preview')}</span>
                <ProjectCard project={preview} tasks={[]} preview />
            </div>

            <div className="zenith-settings__card">
                <SettingRow
                    label={t('projects.form.name')}
                    // The file name is shown, never asked for. It follows the
                    // title with anything illegal replaced by a dash, and
                    // seeing the result is what keeps that from surprising
                    // anyone who called a project "Q3: launch".
                    desc={
                        editing
                            ? undefined
                            : t('projects.form.file', {
                                  name: `${projectFileName(title, t('projects.template.title'))}.md`,
                              })
                    }
                    error={error ?? undefined}
                    layout="stack"
                >
                    <TextInput
                        value={title}
                        placeholder={t('projects.form.name.placeholder')}
                        onChange={(v) => {
                            setTitle(v);
                            if (error) setError(null);
                        }}
                    />
                </SettingRow>

                <SettingRow label={t('projects.form.status')} compact>
                    <Select
                        value={status}
                        options={PROJECT_STATUSES.map((s) => ({
                            value: s,
                            label: t(`projects.state.${s}`),
                        }))}
                        onChange={(v) => setStatus(v as ProjectStatus)}
                    />
                </SettingRow>

                <SettingRow label={t('projects.form.priority')} compact>
                    <Select
                        value={priority}
                        options={PRIORITIES.map((p) => ({
                            value: p,
                            label: t(`priority.${p}`),
                        }))}
                        onChange={(v) => setPriority(v as Priority)}
                    />
                </SettingRow>

                <SettingRow label={t('projects.form.startDate')} compact>
                    <DateInput value={startDate} onChange={setStartDate} />
                </SettingRow>

                <SettingRow label={t('projects.form.targetDate')} compact>
                    <DateInput value={targetDate} onChange={setTargetDate} />
                </SettingRow>
            </div>

            <div className="zenith-settings__card">
                <SettingRow
                    label={t('projects.form.description')}
                    desc={t('projects.form.description.desc')}
                    layout="stack"
                >
                    <TextInput value={description} onChange={setDescription} />
                </SettingRow>

                <SettingRow label={t('projects.form.icon')} group compact>
                    <IconField value={icon} onChange={setIcon} />
                </SettingRow>

                <SettingRow label={t('projects.form.color')} group compact>
                    <ColorInput
                        value={color}
                        allowEmpty
                        resetLabel={t('settings.reset')}
                        onChange={setColor}
                    />
                </SettingRow>
            </div>

            <div className="zenith-settings__card">
                <SettingRow
                    label={t('projects.form.tags')}
                    desc={t('projects.form.tags.desc')}
                    layout="stack"
                >
                    <TextInput value={tags} onChange={setTags} />
                </SettingRow>

                <SettingRow
                    label={t('projects.form.taskTags')}
                    desc={t('projects.form.taskTags.desc')}
                    layout="stack"
                >
                    <TextInput value={taskTags} onChange={setTaskTags} />
                </SettingRow>
            </div>

            <div className="zenith-project-form__actions">
                <button type="button" className="zenith-btn" onClick={onClose} disabled={busy}>
                    {t('projects.form.cancel')}
                </button>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--cta"
                    onClick={() => void submit()}
                    disabled={busy}
                >
                    {editing ? t('projects.form.submit.save') : t('projects.form.submit.create')}
                </button>
            </div>
        </div>
    );
};

/**
 * A date, in the settings form's own clothes.
 *
 * `SettingRow` mints the ids and puts them in context; a field that is not one
 * of its controls has to pick them up itself or the label above it points at
 * nothing. Three lines to stay inside the contract rather than an exception
 * to it.
 */
const DateInput: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
    const ids = useFieldIds();

    return (
        <DateField
            className="zenith-settings__picker"
            id={ids?.id}
            aria-describedby={ids?.describedBy}
            value={value}
            onChange={onChange}
        />
    );
};

/**
 * The icon, picked from the grid the rest of the plugin picks icons from.
 *
 * A modal over a modal, which sounds worse than it is: Obsidian stacks them,
 * and three React components in settings already open this exact picker the
 * same way. Building a second searchable icon grid inside this form would be
 * a second one to keep in step with the first.
 */
const IconField: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
    const t = useTranslation();
    const { app } = useApp();

    return (
        <div className="zenith-project-form__icon">
            <button
                type="button"
                className="zenith-settings__inline-btn"
                onClick={() => new IconPickerModal(app, value || undefined, onChange).open()}
            >
                {value ? <DynamicIcon name={value} size={15} /> : null}
                <span>{value || t('projects.form.icon.none')}</span>
            </button>
            {value && (
                <button
                    type="button"
                    className="zenith-settings__inline-btn"
                    onClick={() => onChange('')}
                >
                    {t('settings.reset')}
                </button>
            )}
        </div>
    );
};
