import React, { useId, useMemo, useRef, useState } from 'react';
import { FileUp, Layers, Minus, Plus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { CONTENT_STATUSES, PRIORITIES, TASK_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import {
    ColorField,
    DateField,
    Dropdown,
    SearchField,
    TimeField,
} from '../../../components/ui/fields';
import { AttachmentField } from '../../../modules/tasks/components/AttachmentField';
import { QuickAddForm } from '../../../modules/tasks/components/QuickAddForm';
import { TaskFilters } from '../../../modules/tasks/components/TaskFilters';
import type { TaskFilterState } from '../../../modules/tasks/components/TasksApp';
import type { TaskAttachment } from '../../../modules/tasks/services/taskDetails';
import { MetadataPicker } from '../../../modules/content/components/MetadataPicker';
import { ProgressControl } from '../../../modules/content/components/ProgressControl';
import type { ProgressValue } from '../../../modules/content/services/progress';
import {
    ColorInput,
    MultiSelect,
    NumberInput,
    Select,
    SettingRow,
    Slider,
    TextArea,
    TextInput,
} from '../../controls';
import { FolderInput } from '../../controls/FolderInput';
import { vaultImageField } from '../../controls/VaultImageField';
import { Demo, Section } from './ComponentGallery';

/**
 * Every field Zenith draws, on one page.
 *
 * The first section is the kit itself — `components/ui/fields` and the
 * `.zenith-input` skin — in every state it has: this is what a CSS change to
 * `fields.css` should be checked against. None of it is a native control; the
 * whole point of the kit is that a select, a date, a time and a colour look
 * the same on Windows, macOS, iOS and Android.
 *
 * The sections after it are the kit where it is used, grouped by the
 * stylesheet around it. Where a field is its own component it is the component
 * itself, fed local state. Where it is a few lines inside a whole view, the
 * specimen repeats those lines — same classes, same ancestors — and names the
 * view it was taken from, so a change there has an obvious second place to go.
 * Every value is the page's own and goes nowhere; the one exception is a
 * button that acts on the vault by itself, like the folder field's "Create
 * folder", which still does.
 *
 * The labels name the class or component the specimen is, and are not
 * translated, for the same reason as on the components tab. The words inside
 * the fields are the real ones, looked up by the same keys the views use.
 */

/** A dialog's ancestors, without the dialog: its field rules are all scoped under it. */
const DialogScope: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="zenith-root zenith-dialog zenith-dialog--inline zenith-debug__scope">
        {children}
    </div>
);

/** The token scope a view's fields resolve `--zenith-*` from, minus the view's scrolling. */
const RootScope: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="zenith-root zenith-debug__scope">{children}</div>
);

/** A popover's surface, standing still instead of hung from an anchor. */
const PopScope: React.FC<{ className: string; children: React.ReactNode }> = ({
    className,
    children,
}) => (
    <RootScope>
        <div className={`zenith-pop zenith-debug__pop ${className}`}>{children}</div>
    </RootScope>
);

const DialogField: React.FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <DialogScope>
        <div className="zenith-field">
            <label className="zenith-field__label">{label}</label>
            {children}
        </div>
    </DialogScope>
);

/** `in-progress` → `status.inProgress`: the key every status field looks up. */
const statusKey = (status: string) =>
    `status.${status.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`;

/** A text field's worth of state, for the specimens that are only markup. */
function useText(initial = '') {
    const [value, setValue] = useState(initial);
    return {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValue(e.target.value),
    };
}

const FRUIT = [
    { value: 'apple', label: 'Apple', icon: 'apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry', icon: 'cherry' },
    { value: 'durian', label: 'Durian — unavailable', disabled: true },
    { value: 'elderberry', label: 'Elderberry, with a label long enough to wrap in the list' },
    { value: 'fig', label: 'Fig' },
    { value: 'grape', label: 'Grape', icon: 'grape' },
    { value: 'kiwi', label: 'Kiwi' },
    { value: 'lemon', label: 'Lemon', icon: 'citrus' },
    { value: 'mango', label: 'Mango' },
];

// The settings row that names a picture, closed over a key of this page's own.
const DemoVaultImage = vaultImageField('path', 'settings.dashBgPath', 'settings.dashBgPath.desc');

// ── The kit ──────────────────────────────────────────

const Kit: React.FC = () => {
    const t = useTranslation();

    const text = useText('Zenith');
    const empty = useText();
    const mono = useText('zi:acme/logo');
    const bad = useText('Attachments/nope.png');
    const number = useText('42');
    const area = useText('One line.\nAnd another.');
    const [fruit, setFruit] = useState('cherry');
    const [unpicked, setUnpicked] = useState('');
    const [date, setDate] = useState('2026-09-21');
    const [noDate, setNoDate] = useState('');
    const [time, setTime] = useState('09:30');
    const [noTime, setNoTime] = useState('');
    const [colour, setColour] = useState('#7c6cff');
    const [noColour, setNoColour] = useState('');
    const [query, setQuery] = useState('');
    const [smallQuery, setSmallQuery] = useState('tag:work');

    return (
        <Section title={t('debug.inputs.kit')}>
            <Demo label="zenith-input">
                <input className="zenith-input" {...text} />
            </Demo>
            <Demo label="zenith-input · placeholder">
                <input className="zenith-input" placeholder="owner/repo" {...empty} />
            </Demo>
            <Demo label="zenith-input--sm">
                <input className="zenith-input zenith-input--sm" {...text} />
            </Demo>
            <Demo label="zenith-input · is-mono">
                <input className="zenith-input is-mono" {...mono} />
            </Demo>
            <Demo label="zenith-input · is-invalid">
                <input className="zenith-input is-invalid" {...bad} />
            </Demo>
            <Demo label="zenith-input · disabled">
                <input
                    className="zenith-input"
                    disabled
                    value="Zenith"
                    onChange={() => undefined}
                />
            </Demo>
            <Demo label="zenith-input · number">
                <input className="zenith-input" type="number" inputMode="numeric" {...number} />
            </Demo>
            <Demo label="textarea.zenith-input">
                <textarea className="zenith-input" rows={3} {...area} />
            </Demo>

            <Demo label="Dropdown">
                <Dropdown value={fruit} options={FRUIT} onChange={setFruit} />
            </Demo>
            <Demo label="Dropdown · placeholder">
                <Dropdown
                    value={unpicked}
                    options={FRUIT}
                    placeholder={t('fields.select.placeholder')}
                    onChange={setUnpicked}
                />
            </Demo>
            <Demo label="Dropdown · sm">
                <Dropdown size="sm" value={fruit} options={FRUIT} onChange={setFruit} />
            </Demo>
            <Demo label="Dropdown · disabled">
                <Dropdown value={fruit} options={FRUIT} disabled onChange={() => undefined} />
            </Demo>

            <Demo label="DateField">
                <DateField value={date} onChange={setDate} />
            </Demo>
            <Demo label="DateField · empty">
                <DateField value={noDate} onChange={setNoDate} />
            </Demo>
            <Demo label="DateField · sm">
                <DateField size="sm" value={date} onChange={setDate} />
            </Demo>
            <Demo label="DateField · disabled">
                <DateField value={date} disabled onChange={() => undefined} />
            </Demo>

            <Demo label="TimeField">
                <TimeField value={time} onChange={setTime} />
            </Demo>
            <Demo label="TimeField · empty">
                <TimeField value={noTime} onChange={setNoTime} />
            </Demo>
            <Demo label="TimeField · disabled">
                <TimeField value="" disabled onChange={() => undefined} />
            </Demo>

            <Demo label="ColorField">
                <div className="zenith-debug__strip">
                    <ColorField value={colour} onChange={setColour} />
                    <code>{colour || '—'}</code>
                </div>
            </Demo>
            <Demo label="ColorField · empty · reset">
                <div className="zenith-debug__strip">
                    <ColorField
                        value={noColour}
                        fallback="#7c6cff"
                        resetLabel="Reset"
                        onChange={setNoColour}
                    />
                    <code>{noColour || '—'}</code>
                </div>
            </Demo>

            <Demo label="SearchField">
                <SearchField value={query} onChange={setQuery} placeholder={t('common.search')} />
            </Demo>
            <Demo label="SearchField · sm">
                <SearchField
                    size="sm"
                    value={smallQuery}
                    onChange={setSmallQuery}
                    placeholder={t('common.search')}
                />
            </Demo>
        </Section>
    );
};

// ── Settings fields ──────────────────────────────────

const SettingsFields: React.FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();

    const [text, setText] = useState('Zenith');
    const [secret, setSecret] = useState('hunter2');
    const [count, setCount] = useState(12);
    const [level, setLevel] = useState(64);
    const [notes, setNotes] = useState('One line.\nAnd another.');
    const [colour, setColour] = useState('#7c6cff');
    const [picked, setPicked] = useState('b');
    const [many, setMany] = useState<string[]>(['a']);
    const [folder, setFolder] = useState('');
    const [image, setImage] = useState('');
    const [date, setDate] = useState('');

    const choices = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
    ];

    return (
        <Section title={t('debug.inputs.settings')}>
            <Demo label="TextInput">
                <TextInput value={text} onChange={setText} />
            </Demo>
            <Demo label="TextInput · secret">
                <TextInput
                    value={secret}
                    secret
                    revealLabel="Show"
                    hideLabel="Hide"
                    onChange={setSecret}
                />
            </Demo>
            <Demo label="TextInput · disabled">
                <TextInput value={text} disabled onChange={() => undefined} />
            </Demo>
            <Demo label="NumberInput · unit">
                <NumberInput value={count} min={0} max={99} unit="px" onChange={setCount} />
            </Demo>
            <Demo label="Select">
                <Select value={picked} options={choices} onChange={setPicked} />
            </Demo>
            <Demo label="MultiSelect">
                <MultiSelect value={many} options={choices} onChange={setMany} />
            </Demo>
            <Demo label="ColorInput">
                <ColorInput value={colour} allowEmpty resetLabel="Reset" onChange={setColour} />
            </Demo>
            <Demo label="Slider">
                <Slider value={level} min={0} max={240} step={8} unit="px" onChange={setLevel} />
            </Demo>
            <Demo label="DateField · zenith-settings__picker" source="ProjectForm">
                <DateField className="zenith-settings__picker" value={date} onChange={setDate} />
            </Demo>
            <Demo label="FolderInput">
                <FolderInput value={folder} placeholder="10 Tasks" onChange={setFolder} />
            </Demo>
            <Demo label="TextArea" wide>
                <TextArea value={notes} rows={3} onChange={setNotes} />
            </Demo>
            <Demo label="row · error" wide>
                <SettingRow label="With an error" error="That folder does not exist.">
                    <TextInput value="10 Nope" onChange={() => undefined} />
                </SettingRow>
            </Demo>
            <Demo label="VaultImageField" wide>
                <DemoVaultImage
                    app={app}
                    plugin={plugin}
                    t={t}
                    values={{ path: image }}
                    set={(patch) => setImage(typeof patch.path === 'string' ? patch.path : '')}
                />
            </Demo>
        </Section>
    );
};

// ── Dialog forms ─────────────────────────────────────

const TagField: React.FC = () => {
    const t = useTranslation();
    const [tags, setTags] = useState(['work', 'errand']);
    const [draft, setDraft] = useState('');

    const add = () => {
        const tag = draft.trim().replace(/^#/, '');
        if (tag && !tags.includes(tag)) setTags([...tags, tag]);
        setDraft('');
    };

    return (
        <DialogField label={t('tasks.editor.tags')}>
            {tags.length > 0 && (
                <div className="zenith-tagchips">
                    {tags.map((tag) => (
                        <span key={tag} className="zenith-tagchip">
                            #{tag}
                            <button
                                onClick={() => setTags(tags.filter((x) => x !== tag))}
                                aria-label={t('common.remove')}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="zenith-autocomplete">
                <input
                    className="zenith-input zenith-field__input"
                    placeholder={t('tasks.editor.tagPlaceholder')}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                />
            </div>
        </DialogField>
    );
};

const ImportPick: React.FC = () => {
    const t = useTranslation();
    const input = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [skip, setSkip] = useState(true);

    return (
        <DialogScope>
            <div className="zenith-import">
                <input
                    ref={input}
                    type="file"
                    className="zenith-import__file"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                />
                <button
                    type="button"
                    className="zenith-btn zenith-btn--ghost zenith-import__pick"
                    onClick={() => input.current?.click()}
                >
                    <FileUp size={15} />
                    {fileName || t('content.import.choose')}
                </button>
                <label className="zenith-import__option">
                    <input
                        type="checkbox"
                        checked={skip}
                        onChange={(e) => setSkip(e.target.checked)}
                    />
                    {t('content.import.skipExisting')}
                </label>
            </div>
        </DialogScope>
    );
};

const PRIORITY_KEY: Record<string, string> = {
    none: 'priority.none',
    low: 'priority.low',
    medium: 'priority.medium',
    high: 'priority.high',
    urgent: 'priority.urgent',
};

const DialogFields: React.FC = () => {
    const t = useTranslation();

    const title = useText();
    const cover = useText('https://example.com/cover.jpg');
    const year = useText('2024');
    const notes = useText();
    const [status, setStatus] = useState('todo');
    const [priority, setPriority] = useState('none');
    const [contentStatus, setContentStatus] = useState('in-progress');
    const [due, setDue] = useState('');
    const [dueTime, setDueTime] = useState('09:30');
    const [attachments, setAttachments] = useState<TaskAttachment[]>([
        { kind: 'link', target: 'https://obsidian.md', label: 'Obsidian' },
    ]);
    const [searchTitle, setSearchTitle] = useState('');
    const [progress, setProgress] = useState<ProgressValue>({ current: 3, total: 12 });

    return (
        <Section title={t('debug.inputs.dialog')}>
            <Demo label="zenith-field__input" source="TaskEditorModal">
                <DialogField label={t('tasks.editor.description')}>
                    <input
                        className="zenith-input zenith-field__input"
                        placeholder={t('tasks.editor.descriptionPlaceholder')}
                        {...title}
                    />
                </DialogField>
            </Demo>
            <Demo label="zenith-field__input · value" source="ContentForm">
                <DialogField label={t('content.form.cover')}>
                    <input
                        type="text"
                        className="zenith-input zenith-field__input"
                        placeholder={t('content.form.coverPlaceholder')}
                        {...cover}
                    />
                </DialogField>
            </Demo>
            <Demo label="Dropdown" source="TaskEditorModal">
                <DialogField label={t('tasks.editor.status')}>
                    <Dropdown
                        className="zenith-field__input"
                        value={status}
                        options={TASK_STATUSES.map((s) => ({ value: s, label: t(statusKey(s)) }))}
                        onChange={setStatus}
                    />
                </DialogField>
            </Demo>
            <Demo label="Dropdown" source="TaskEditorModal">
                <DialogField label={t('tasks.editor.priority')}>
                    <Dropdown
                        className="zenith-field__input"
                        value={priority}
                        options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_KEY[p]) }))}
                        onChange={setPriority}
                    />
                </DialogField>
            </Demo>
            <Demo label="Dropdown" source="ContentForm">
                <DialogField label={t('content.form.status')}>
                    <Dropdown
                        className="zenith-field__input"
                        value={contentStatus}
                        options={CONTENT_STATUSES.map((s) => ({
                            value: s,
                            label: t(statusKey(s)),
                        }))}
                        onChange={setContentStatus}
                    />
                </DialogField>
            </Demo>
            <Demo label="zenith-input · number" source="ContentForm">
                <DialogField label={t('content.form.year')}>
                    <input
                        type="number"
                        inputMode="numeric"
                        className="zenith-input zenith-field__input"
                        placeholder="2024"
                        {...year}
                    />
                </DialogField>
            </Demo>
            <Demo label="DateField" source="TaskEditorModal">
                <DialogField label={t('tasks.editor.due')}>
                    <DateField className="zenith-field__input" value={due} onChange={setDue} />
                </DialogField>
            </Demo>
            <Demo label="TimeField" source="TaskEditorModal · SubtaskEditorModal">
                <DialogField label={t('tasks.editor.dueTime')}>
                    <TimeField
                        className="zenith-field__input"
                        value={dueTime}
                        disabled={!due}
                        title={!due ? t('tasks.editor.dueTimeHint') : undefined}
                        onChange={setDueTime}
                    />
                </DialogField>
            </Demo>
            <Demo label="zenith-picker__input" source="MetadataPicker">
                <DialogScope>
                    <MetadataPicker
                        provider="books"
                        value={searchTitle}
                        onValueChange={setSearchTitle}
                        onPick={(result) => setSearchTitle(result.title)}
                        suppressed={false}
                        inputId="zenith-debug-picker"
                    />
                </DialogScope>
            </Demo>
            <Demo label="zenith-import__pick · option" source="ContentImportModal">
                <ImportPick />
            </Demo>
            <Demo label="zenith-field__textarea" source="TaskEditorModal" wide>
                <DialogField label={t('tasks.editor.notes')}>
                    <textarea
                        className="zenith-input zenith-field__input zenith-field__textarea"
                        placeholder={t('tasks.editor.notesPlaceholder')}
                        rows={3}
                        {...notes}
                    />
                </DialogField>
            </Demo>
            <Demo label="zenith-tagchips · zenith-autocomplete" source="TaskEditorModal" wide>
                <TagField />
            </Demo>
            <Demo label="AttachmentField" wide>
                <DialogScope>
                    <AttachmentField value={attachments} onChange={setAttachments} />
                </DialogScope>
            </Demo>
            <Demo label="ProgressControl" source="ContentForm" wide>
                <DialogScope>
                    <ProgressControl
                        value={progress}
                        onChange={setProgress}
                        unit="episodes"
                        idPrefix="zenith-debug-progress"
                    />
                </DialogScope>
            </Demo>
            <Demo label="ProgressControl · compact" source="ContentDetailModal" wide>
                <DialogScope>
                    <ProgressControl
                        value={progress}
                        onChange={setProgress}
                        unit="episodes"
                        compact
                        idPrefix="zenith-debug-progress-compact"
                    />
                </DialogScope>
            </Demo>
        </Section>
    );
};

// ── Search and filters ───────────────────────────────

const SearchFields: React.FC = () => {
    const t = useTranslation();
    const tasks = useZenithStore((s) => s.tasks);
    const allTags = useMemo(() => {
        const seen = new Set(tasks.flatMap((task) => task.tags));
        return seen.size > 0 ? [...seen].sort() : ['errand', 'home', 'work'];
    }, [tasks]);

    const [filters, setFilters] = useState<TaskFilterState>({
        priority: 'all',
        tag: '',
        sort: 'manual',
        group: 'smart',
        due: 'all',
    });
    const [tasksQuery, setTasksQuery] = useState('');
    const [libraryQuery, setLibraryQuery] = useState('');
    const [projectsQuery, setProjectsQuery] = useState('');
    const [widgetsQuery, setWidgetsQuery] = useState('');
    const [contentStatus, setContentStatus] = useState<string>('all');

    return (
        <Section title={t('debug.inputs.search')}>
            <Demo label="SearchField · zenith-tasks-search" source="TasksApp">
                <RootScope>
                    <SearchField
                        className="zenith-tasks-search"
                        value={tasksQuery}
                        onChange={setTasksQuery}
                        placeholder={t('tasks.searchPlaceholder')}
                    />
                </RootScope>
            </Demo>
            <Demo label="SearchField · zenith-content-gallery__search" source="ContentGallery">
                <RootScope>
                    <SearchField
                        className="zenith-content-gallery__search"
                        value={libraryQuery}
                        onChange={setLibraryQuery}
                        placeholder={t('content.searchPlaceholder')}
                    />
                </RootScope>
            </Demo>
            <Demo label="Dropdown · zenith-content-gallery__select" source="ContentGallery">
                <RootScope>
                    <Dropdown
                        className="zenith-content-gallery__select"
                        value={contentStatus}
                        options={[
                            { value: 'all', label: t('content.allStatuses') },
                            ...CONTENT_STATUSES.map((s, i) => ({
                                value: s,
                                label: `${t(statusKey(s))} (${i})`,
                                disabled: i === 0,
                            })),
                        ]}
                        onChange={setContentStatus}
                    />
                </RootScope>
            </Demo>
            <Demo label="SearchField · zenith-projects__search-box" source="ProjectsApp">
                <RootScope>
                    <SearchField
                        className="zenith-projects__search-box"
                        value={projectsQuery}
                        onChange={setProjectsQuery}
                        placeholder={t('projects.search')}
                    />
                </RootScope>
            </Demo>
            <Demo label="SearchField · sm · zenith-add-sheet__search" source="AddWidgetSheet">
                <RootScope>
                    <SearchField
                        size="sm"
                        className="zenith-add-sheet__search"
                        value={widgetsQuery}
                        onChange={setWidgetsQuery}
                        placeholder={t('dashboard.widgets.searchPlaceholder')}
                    />
                </RootScope>
            </Demo>
            <Demo label="TaskFilters" source="TasksApp · zenith-task-filters-popover" wide>
                <PopScope className="zenith-task-filters-popover">
                    <TaskFilters filters={filters} onFilterChange={setFilters} allTags={allTags} />
                </PopScope>
            </Demo>
        </Section>
    );
};

// ── Edited in place ──────────────────────────────────

const ProgressStepper: React.FC = () => {
    const t = useTranslation();
    const total = 24;
    const unit = 'episodes';
    const [draft, setDraft] = useState('7');
    const current = Number(draft) || 0;
    const step = (by: number) => setDraft(String(Math.min(total, Math.max(0, current + by))));

    return (
        <PopScope className="zenith-cwp">
            <div className="zenith-pop__title">Sample title</div>
            <div className="zenith-cwp__stepper">
                <button
                    type="button"
                    className="zenith-cwp__step"
                    aria-label={t('content.progress.less', { unit })}
                    disabled={current <= 0}
                    onClick={() => step(-1)}
                >
                    <Minus size={14} />
                </button>
                <span className="zenith-cwp__value">
                    <input
                        className="zenith-input zenith-input--sm zenith-cwp__num"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={total}
                        aria-label={t('content.progress.done', { unit })}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <span className="zenith-cwp__of">
                        / {total} {unit}
                    </span>
                </span>
                <button
                    type="button"
                    className="zenith-cwp__step"
                    aria-label={t('content.progress.more', { unit })}
                    disabled={current >= total}
                    onClick={() => step(1)}
                >
                    <Plus size={14} />
                </button>
            </div>
        </PopScope>
    );
};

const InlineFields: React.FC = () => {
    const t = useTranslation();

    const subtask = useText();
    const typeName = useText('Book');
    const creator = useText();
    const trackerStep = useText('1');
    const picture = useText('Attachments/cover.png');
    const missingPicture = useText('Attachments/nope.png');
    const bundleName = useText();
    const authCode = useText();
    const deviceName = useText('Desktop');
    const [typeColour, setTypeColour] = useState('#8b5cf6');
    const [provider, setProvider] = useState('books');
    const [status, setStatus] = useState<ContentStatus>('in-progress');

    return (
        <Section title={t('debug.inputs.inline')}>
            <Demo label="zenith-subtask__input" source="SubtaskList">
                <div className="zenith-debug__strip">
                    <input
                        className="zenith-input zenith-input--sm zenith-subtask__input"
                        placeholder={t('tasks.subtask.placeholder')}
                        {...subtask}
                    />
                </div>
            </Demo>
            <Demo label="Dropdown · zenith-content-modal__status" source="ContentDetailModal">
                <RootScope>
                    <Dropdown
                        size="sm"
                        className={`zenith-content-modal__status is-${status}`}
                        value={status}
                        options={CONTENT_STATUSES.map((s) => ({
                            value: s,
                            label: t(statusKey(s)),
                        }))}
                        onChange={(v) => setStatus(v as ContentStatus)}
                    />
                </RootScope>
            </Demo>
            <Demo label="zenith-picture-settings__input" source="PictureSettings">
                <RootScope>
                    <div className="zenith-picture-settings__field">
                        <input
                            type="text"
                            className="zenith-input zenith-input--sm is-mono zenith-picture-settings__input"
                            placeholder={t('picture.path.placeholder')}
                            spellCheck={false}
                            {...picture}
                        />
                    </div>
                </RootScope>
            </Demo>
            <Demo label="zenith-picture-settings__input · is-invalid" source="PictureSettings">
                <RootScope>
                    <div className="zenith-picture-settings__field">
                        <input
                            type="text"
                            className="zenith-input zenith-input--sm is-mono zenith-picture-settings__input is-invalid"
                            spellCheck={false}
                            {...missingPicture}
                        />
                    </div>
                </RootScope>
            </Demo>
            <Demo label="zenith-bundle-inspector__name" source="BundleInspector">
                <RootScope>
                    <div className="zenith-bundle-inspector">
                        <div className="zenith-bundle-inspector__head">
                            <Layers size={13} />
                            <span className="zenith-bundle-inspector__label">
                                {t.plural('dashboard.bundle.count', 3)}
                            </span>
                            <input
                                className="zenith-input zenith-input--sm zenith-bundle-inspector__name"
                                placeholder={t('dashboard.bundle.namePlaceholder')}
                                {...bundleName}
                            />
                        </div>
                    </div>
                </RootScope>
            </Demo>
            <Demo label="zenith-cwp__num" source="ProgressPopover">
                <ProgressStepper />
            </Demo>
            <Demo label="zenith-sync__input" source="RemoteAuthPanel · SyncApp" wide>
                <RootScope>
                    <div className="zenith-sync is-embedded">
                        <div className="zenith-sync__row">
                            <label className="zenith-sync__label">{t('auth.paste')}</label>
                            <input
                                type="text"
                                className="zenith-input zenith-sync__input"
                                placeholder={t('auth.paste.placeholder')}
                                {...authCode}
                            />
                        </div>
                        <ul className="zenith-sync__list">
                            <li className="zenith-sync__peer is-self">
                                <input
                                    type="text"
                                    className="zenith-input zenith-sync__input"
                                    aria-label={t('sync.deviceName')}
                                    {...deviceName}
                                />
                                <span className="zenith-sync__tag">{t('sync.thisDeviceTag')}</span>
                            </li>
                        </ul>
                    </div>
                </RootScope>
            </Demo>
            <Demo
                label="zenith-ctype__label · ColorField · __field"
                source="ContentTypesSettings · JournalSettings"
                wide
            >
                <div className="zenith-ctype">
                    <div className="zenith-ctype__head">
                        <input
                            className="zenith-input zenith-ctype__label"
                            aria-label={t('ctypes.typeName')}
                            {...typeName}
                        />
                        <ColorField
                            value={typeColour}
                            aria-label={t('ctypes.colour')}
                            onChange={setTypeColour}
                        />
                    </div>
                    <div className="zenith-ctype__row">
                        <label className="zenith-ctype__field">
                            <span>{t('ctypes.metadataSource')}</span>
                            <Dropdown
                                size="sm"
                                value={provider}
                                options={[
                                    { value: 'books', label: 'Books' },
                                    { value: 'movie', label: 'Movie' },
                                    { value: 'anime', label: 'Anime' },
                                ]}
                                onChange={setProvider}
                            />
                        </label>
                        <label className="zenith-ctype__field">
                            <span>{t('ctypes.creatorLabel')}</span>
                            <input
                                className="zenith-input zenith-input--sm"
                                placeholder={t('ctypes.defaultCreator')}
                                {...creator}
                            />
                        </label>
                        <label className="zenith-ctype__field">
                            <span>{t('settings.journalTrackers.step')}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="zenith-input zenith-input--sm"
                                min="0"
                                step="any"
                                {...trackerStep}
                            />
                        </label>
                    </div>
                </div>
            </Demo>
        </Section>
    );
};

// ── Inside Obsidian dialogs ──────────────────────────

const ObsidianDialogFields: React.FC = () => {
    const t = useTranslation();
    const consentId = useId();

    const prompt = useText(t('dashboard.presets.defaultName'));
    const iconSearch = useText();
    const mediaRef = useText();
    const mediaSearch = useText();
    const [understood, setUnderstood] = useState(false);

    return (
        <Section title={t('debug.inputs.obsidian')}>
            <Demo label="zenith-prompt__input" source="PromptModal">
                <input
                    type="text"
                    className="zenith-input zenith-prompt__input"
                    placeholder={t('dashboard.presets.namePlaceholder')}
                    {...prompt}
                />
            </Demo>
            <Demo label="zenith-icon-picker__search" source="IconPickerModal">
                <input
                    type="text"
                    className="zenith-input zenith-icon-picker__search"
                    placeholder="Search icons…"
                    {...iconSearch}
                />
            </Demo>
            <Demo label="zenith-consent__confirm" source="ThirdPartyConsentModal">
                <div className="zenith-consent__confirm">
                    <input
                        id={consentId}
                        type="checkbox"
                        checked={understood}
                        onChange={(e) => setUnderstood(e.target.checked)}
                    />
                    <label htmlFor={consentId}>{t('consent.understood')}</label>
                </div>
            </Demo>
            <Demo label="zenith-media-picker__input" source="MediaPickerModal" wide>
                <div className="zenith-media-picker__quick-row">
                    <input
                        type="text"
                        className="zenith-input zenith-media-picker__input"
                        placeholder="https://… or path/to/image.png"
                        {...mediaRef}
                    />
                    <button type="button" className="zenith-media-picker__add-btn">
                        Add &amp; select
                    </button>
                </div>
            </Demo>
            <Demo label="zenith-media-picker__search" source="MediaPickerModal" wide>
                <input
                    type="text"
                    className="zenith-input zenith-media-picker__search"
                    placeholder="Search by name or path…"
                    {...mediaSearch}
                />
            </Demo>
            <Demo label="QuickAddForm" source="QuickAddTaskModal" wide>
                <div className="zenith-quick-add">
                    <QuickAddForm autoFocus={false} onSubmit={() => Promise.resolve()} />
                </div>
            </Demo>
        </Section>
    );
};

export const InputGallery: React.FC = () => {
    const t = useTranslation();
    return (
        <div className="zenith-debug__gallery">
            <div className="zenith-debug__note">{t('debug.inputs.intro')}</div>
            <Kit />
            <SettingsFields />
            <DialogFields />
            <SearchFields />
            <InlineFields />
            <ObsidianDialogFields />
        </div>
    );
};
