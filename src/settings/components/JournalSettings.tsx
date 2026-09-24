import React, { useEffect, useMemo, useState } from 'react';
import { Notice, TFolder } from 'obsidian';
import { Plus, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useZenithStore } from '../../store';
import { useTranslation } from '../../core/i18n';
import { getTodayString } from '../../core/dateUtils';
import {
    DEFAULT_SCALE_GOAL,
    DEFAULT_TRACKERS,
    SCALE_MAX,
    TRACKER_KINDS,
    uniqueTrackerId,
    trackerIdProblem,
    weeklyCount,
    withGoalHistory,
    type JournalTracker,
    type TrackerKind,
} from '../../core/journalConfig';
import { addDays } from '../../modules/journal/services/journalDates';
import { useFeature } from '../../core/useFeature';
import { RITUAL_STEPS } from '../../modules/journal/services/rituals';
import { DEFAULT_JOURNAL_FOLDER } from '../../core/constants';
import type { JournalWeekStart } from '../../store/settingsSlice';
import { ObsidianIcon } from '../../components/shared/ObsidianIcon';
import { IconPickerModal } from '../../core/IconPickerModal';
import { ColorField, Dropdown } from '../../components/ui/fields';
import { journalNotePath, isoToDate } from '../../modules/journal/services/journalDates';
import { translateNow } from '../../core/i18n';
import { CoreSettingsForm } from '../schema/CoreSettingsForm';
import { featureOnlySchema } from '../schema/featureGroup';

const JOURNAL_FEATURES = featureOnlySchema('journal');
import {
    readDailyNotesConfig,
    dailyNotesConflict,
    type DailyNotesConfig,
} from '../../modules/journal/services/dailyNotesConflict';

/**
 * JournalSettings — the Journal module's settings page: where daily notes live,
 * how they're named and templated, what each day records, and whether new tasks
 * are captured into the day's note.
 *
 * It also surfaces the one genuine hazard of running an independent journal
 * alongside Obsidian's own Daily notes: two plugins with different ideas of
 * where "today" is. We read the core plugin's config and say so plainly rather
 * than adopting its settings behind the user's back.
 */
export const JournalSettings: React.FC = () => {
    const { app } = useApp();
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const trackers = settings.journalTrackers;

    // Bumped after creating the folder, to re-check that it now exists.
    const [, forceRefresh] = useState(0);
    const [coreConfig, setCoreConfig] = useState<DailyNotesConfig | null>(null);

    useEffect(() => {
        let cancelled = false;
        void readDailyNotesConfig(app).then((config) => {
            if (!cancelled) setCoreConfig(config);
        });
        return () => {
            cancelled = true;
        };
    }, [app]);

    const conflict = dailyNotesConflict(
        coreConfig,
        settings.journalFolderPath,
        settings.journalDateFormat
    );

    const folderMissing =
        settings.journalFolderPath.trim().length > 0 &&
        !(app.vault.getAbstractFileByPath(settings.journalFolderPath.trim()) instanceof TFolder);

    const createFolder = async () => {
        const path = settings.journalFolderPath.trim();
        try {
            // The default path is nested, so create the chain rather than
            // failing on a missing parent.
            let current = '';
            for (const segment of path.split('/').filter(Boolean)) {
                current = current ? `${current}/${segment}` : segment;
                if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
            }
            new Notice(translateNow('notice.folderCreated', { path }));
            forceRefresh((n) => n + 1);
        } catch (err) {
            console.error('Zenith: Failed to create folder:', err);
            new Notice(translateNow('notice.folderFailed'));
        }
    };

    const todayPath = useMemo(() => {
        try {
            return journalNotePath(
                settings.journalFolderPath,
                settings.journalDateFormat,
                isoToDate(getTodayString())
            );
        } catch {
            return '';
        }
    }, [settings.journalFolderPath, settings.journalDateFormat]);

    // ── Trackers ────────────────────────────────────────────────────────────

    const commit = (next: JournalTracker[]) => updateSettings({ journalTrackers: next });
    // Addressed by position rather than id, because one of the editable fields
    // *is* the id — matching on it would miss the row being renamed.
    //
    // A change to the goal keeps the old one as history, so the days before
    // today are still judged by what they were asked.
    const yesterday = addDays(getTodayString(), -1);
    const patch = (index: number, partial: Partial<JournalTracker>) =>
        commit(
            trackers.map((tr, i) =>
                i === index ? withGoalHistory(tr, { ...tr, ...partial }, yesterday) : tr
            )
        );
    const goalsOn = useFeature('journal.goals');
    const quitOn = useFeature('journal.quitHabits');
    const promptOn = useFeature('journal.dailyPrompt');
    const ritualsOn = useFeature('journal.rituals');
    const hours = Array.from({ length: 24 }, (_, h) => ({
        value: String(h),
        label: `${String(h).padStart(2, '0')}:00`,
    }));
    const toggleStep = (step: string) =>
        updateSettings({
            ritualSkip: settings.ritualSkip.includes(step)
                ? settings.ritualSkip.filter((s) => s !== step)
                : [...settings.ritualSkip, step],
        });
    const remove = (index: number) => commit(trackers.filter((_, i) => i !== index));

    const add = (kind: TrackerKind) => {
        const label = t(`journal.kind.${kind}`);
        commit([
            ...trackers,
            {
                id: uniqueTrackerId(kind, trackers),
                label,
                icon: kind === 'check' ? 'circle-check' : kind === 'scale' ? 'smile' : 'hash',
                color: '#8b5cf6',
                kind,
                ...(kind === 'number' ? { step: 1, max: 10 } : {}),
            },
        ]);
    };

    // Keyed by position, not by id: the property field edits the id itself, and
    // an id-based key would remount the input on every keystroke and drop focus.
    const renderTracker = (tracker: JournalTracker, index: number) => {
        const problem = trackerIdProblem(tracker.id, tracker, trackers);
        return (
            <div key={index} className={`zenith-ctype ${tracker.disabled ? 'is-off' : ''}`}>
                <div className="zenith-ctype__head">
                    <button
                        type="button"
                        className="zenith-ctype__icon"
                        style={{ color: tracker.color }}
                        aria-label={t('a11y.changeIcon')}
                        onClick={() =>
                            new IconPickerModal(app, tracker.icon, (icon) =>
                                patch(index, { icon })
                            ).open()
                        }
                    >
                        <ObsidianIcon name={tracker.icon} size={18} />
                    </button>
                    <input
                        className="zenith-input zenith-ctype__label"
                        value={tracker.label}
                        aria-label={t('settings.journalTrackers.name')}
                        onChange={(e) => patch(index, { label: e.target.value })}
                    />
                    <ColorField
                        className="zenith-ctype__color"
                        value={tracker.color}
                        aria-label={t('ctypes.colour')}
                        onChange={(color) => patch(index, { color })}
                    />
                    {/* Off, not gone: the id still names a frontmatter key in
                        every note that recorded it, so switching a tracker off
                        keeps that history reachable in a way deleting cannot. */}
                    <button
                        type="button"
                        className="zenith-ctype__remove"
                        aria-label={t(
                            tracker.disabled
                                ? 'settings.journalTrackers.enable'
                                : 'settings.journalTrackers.disable'
                        )}
                        title={t(
                            tracker.disabled
                                ? 'settings.journalTrackers.enable'
                                : 'settings.journalTrackers.disable'
                        )}
                        aria-pressed={!tracker.disabled}
                        onClick={() => patch(index, { disabled: !tracker.disabled })}
                    >
                        {tracker.disabled ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                        type="button"
                        className="zenith-ctype__remove"
                        aria-label={t('common.remove')}
                        onClick={() => remove(index)}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>

                <div className="zenith-ctype__row">
                    <label className="zenith-ctype__field">
                        <span>{t('settings.journalTrackers.kind')}</span>
                        <Dropdown
                            size="sm"
                            value={tracker.kind}
                            options={TRACKER_KINDS.map((kind) => ({
                                value: kind,
                                label: t(`journal.kind.${kind}`),
                            }))}
                            onChange={(kind) => patch(index, { kind: kind as TrackerKind })}
                        />
                    </label>

                    <label className="zenith-ctype__field">
                        <span>{t('settings.journalTrackers.key')}</span>
                        <input
                            className="zenith-input zenith-input--sm"
                            value={tracker.id}
                            spellCheck={false}
                            onChange={(e) => patch(index, { id: e.target.value.trim() })}
                        />
                    </label>

                    {/* A scale has no `max` to state its target through — five
                        is the top of every scale — so the threshold the habit
                        grid counts from is its own field. */}
                    {tracker.kind === 'scale' && (
                        <label className="zenith-ctype__field">
                            <span title={t('settings.journalTrackers.goal.desc')}>
                                {t('settings.journalTrackers.goal')}
                            </span>
                            <Dropdown
                                size="sm"
                                value={String(tracker.goal ?? DEFAULT_SCALE_GOAL)}
                                options={Array.from({ length: SCALE_MAX }, (_, i) => ({
                                    value: String(i + 1),
                                    label: String(i + 1),
                                }))}
                                onChange={(goal) => patch(index, { goal: Number(goal) })}
                            />
                        </label>
                    )}

                    {tracker.kind === 'number' && (
                        <>
                            <label className="zenith-ctype__field">
                                <span>{t('settings.journalTrackers.unit')}</span>
                                <input
                                    className="zenith-input zenith-input--sm"
                                    value={tracker.unit ?? ''}
                                    onChange={(e) => patch(index, { unit: e.target.value })}
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
                                    value={tracker.step ?? 1}
                                    onChange={(e) =>
                                        patch(index, { step: Number(e.target.value) || 1 })
                                    }
                                />
                            </label>
                            <label className="zenith-ctype__field">
                                <span>{t('settings.journalTrackers.target')}</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    className="zenith-input zenith-input--sm"
                                    min="0"
                                    step="any"
                                    value={tracker.max ?? ''}
                                    onChange={(e) =>
                                        patch(index, {
                                            max: e.target.value ? Number(e.target.value) : undefined,
                                        })
                                    }
                                />
                            </label>
                        </>
                    )}
                </div>

                {(goalsOn || quitOn) && (
                    <div className="zenith-ctype__row">
                        {quitOn && tracker.kind !== 'scale' && (
                            <label className="zenith-ctype__field">
                                <span>{t('settings.journalTrackers.mode')}</span>
                                <Dropdown
                                    size="sm"
                                    value={tracker.mode ?? 'build'}
                                    options={(['build', 'quit'] as const).map((mode) => ({
                                        value: mode,
                                        label: t(`settings.journalTrackers.mode.${mode}`),
                                    }))}
                                    onChange={(mode) =>
                                        patch(index, { mode: mode === 'quit' ? 'quit' : undefined })
                                    }
                                />
                            </label>
                        )}
                        {goalsOn && tracker.mode !== 'quit' && (
                            <label className="zenith-ctype__field">
                                <span title={t('settings.journalTrackers.goalKept')}>
                                    {t('settings.journalTrackers.period')}
                                </span>
                                <Dropdown
                                    size="sm"
                                    value={tracker.goalPeriod ?? 'day'}
                                    options={(['day', 'week'] as const).map((period) => ({
                                        value: period,
                                        label: t(`settings.journalTrackers.period.${period}`),
                                    }))}
                                    onChange={(period) =>
                                        patch(index, {
                                            goalPeriod:
                                                period === 'week' ? 'week' : undefined,
                                            goalCount:
                                                period === 'week' ? weeklyCount(tracker) : undefined,
                                        })
                                    }
                                />
                            </label>
                        )}
                        {goalsOn && tracker.mode !== 'quit' && tracker.goalPeriod === 'week' && (
                            <label className="zenith-ctype__field">
                                <span>{t('settings.journalTrackers.count')}</span>
                                <Dropdown
                                    size="sm"
                                    value={String(weeklyCount(tracker))}
                                    options={Array.from({ length: 7 }, (_, i) => ({
                                        value: String(i + 1),
                                        label: String(i + 1),
                                    }))}
                                    onChange={(count) => patch(index, { goalCount: Number(count) })}
                                />
                            </label>
                        )}
                        {goalsOn && tracker.mode !== 'quit' && tracker.kind !== 'check' && (
                            <label className="zenith-ctype__field">
                                <span>{t('settings.journalTrackers.direction')}</span>
                                <Dropdown
                                    size="sm"
                                    value={tracker.goalDirection ?? 'atLeast'}
                                    options={(['atLeast', 'atMost'] as const).map((direction) => ({
                                        value: direction,
                                        label: t(`settings.journalTrackers.direction.${direction}`),
                                    }))}
                                    onChange={(direction) =>
                                        patch(index, {
                                            goalDirection:
                                                direction === 'atMost'
                                                    ? 'atMost'
                                                    : undefined,
                                        })
                                    }
                                />
                            </label>
                        )}
                    </div>
                )}

                {problem && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        <AlertTriangle size={14} />
                        <span>{t(`settings.journalTrackers.key.${problem}`)}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="zenith-settings__content">
            {conflict && (
                <div className="zenith-settings__hint zenith-settings__hint--warn">
                    <AlertTriangle size={14} />
                    <span>
                        {t('settings.journalConflict', {
                            folder: conflict.folder || t('settings.journalConflict.rootFolder'),
                            format: conflict.format,
                        })}
                    </span>
                </div>
            )}
            {/* A hand-written page, so the generated switches are put in by
                hand — the same group every schema-drawn page gets in front. */}
            <CoreSettingsForm schema={JOURNAL_FEATURES} />

            {/* The four rows above the trackers are one run with nothing
                between them, so they are one card — the same shape the schema
                renderer now gives every other module. This page builds its own
                markup rather than going through `SettingRow`, so the card is
                written out here; converting the page is its own job. */}
            <div className="zenith-settings__card">
            {/* ── Folder ── */}
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t('settings.journalFolder')}</span>
                    <span className="zenith-settings__item-desc">
                        {t('settings.journalFolder.desc')}
                    </span>
                </div>
                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={settings.journalFolderPath}
                        placeholder={DEFAULT_JOURNAL_FOLDER}
                        onChange={(e) => updateSettings({ journalFolderPath: e.target.value })}
                    />
                </div>
                {folderMissing && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        <span>{t('settings.folderMissing')}</span>
                        <button className="zenith-settings__inline-btn" onClick={() => void createFolder()}>
                            {t('settings.createFolder')}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Filename pattern ── */}
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t('settings.journalFormat')}</span>
                    <span className="zenith-settings__item-desc">
                        {t('settings.journalFormat.desc')}
                    </span>
                </div>
                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={settings.journalDateFormat}
                        placeholder="YYYY-MM-DD"
                        onChange={(e) => updateSettings({ journalDateFormat: e.target.value })}
                    />
                </div>
                {todayPath && (
                    <div className="zenith-settings__hint">
                        {t('settings.journalFormat.preview', { path: todayPath })}
                    </div>
                )}
            </div>

            {/* ── Template ── */}
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t('settings.journalTemplate')}</span>
                    <span className="zenith-settings__item-desc">
                        {t('settings.journalTemplate.desc')}
                    </span>
                </div>
                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={settings.journalTemplatePath}
                        placeholder={t('journal.templatePlaceholder')}
                        onChange={(e) => updateSettings({ journalTemplatePath: e.target.value })}
                    />
                </div>
                <div className="zenith-settings__hint">{t('settings.journalTemplate.block')}</div>
            </div>

            {/* ── The day's question ── */}
            {promptOn && (
                <div className="zenith-settings__item zenith-settings__item--stack">
                    <div className="zenith-settings__item-info">
                        <span className="zenith-settings__item-name">
                            {t('settings.journalPrompt')}
                        </span>
                        <span className="zenith-settings__item-desc">
                            {t('settings.journalPrompt.desc')}
                        </span>
                    </div>
                    <div className="zenith-settings__item-control">
                        <input
                            type="text"
                            className="zenith-settings__input"
                            value={settings.journalPromptPath}
                            placeholder={t('settings.journalPrompt.placeholder')}
                            onChange={(e) => updateSettings({ journalPromptPath: e.target.value })}
                        />
                    </div>
                </div>
            )}

            {/* ── Rituals ── */}
            {ritualsOn && (
                <div className="zenith-settings__item zenith-settings__item--stack">
                    <div className="zenith-settings__item-info">
                        <span className="zenith-settings__item-name">{t('settings.ritual')}</span>
                        <span className="zenith-settings__item-desc">
                            {t('settings.ritual.reminders.desc')}
                        </span>
                    </div>
                    <div className="zenith-ritual-settings">
                        <label className="zenith-ctype__field">
                            <span>{t('settings.ritual.morning')}</span>
                            <Dropdown
                                size="sm"
                                value={String(settings.ritualMorningHour)}
                                options={hours}
                                onChange={(h) => updateSettings({ ritualMorningHour: Number(h) })}
                            />
                        </label>
                        <label className="zenith-ctype__field">
                            <span>{t('settings.ritual.evening')}</span>
                            <Dropdown
                                size="sm"
                                value={String(settings.ritualEveningHour)}
                                options={hours}
                                onChange={(h) => updateSettings({ ritualEveningHour: Number(h) })}
                            />
                        </label>
                        <label className="zenith-ritual-settings__check">
                            <input
                                type="checkbox"
                                checked={settings.ritualReminders}
                                onChange={(e) => updateSettings({ ritualReminders: e.target.checked })}
                            />
                            {t('settings.ritual.reminders')}
                        </label>
                    </div>
                    <span className="zenith-settings__item-name">{t('settings.ritual.steps')}</span>
                    <div className="zenith-ritual-settings">
                        {RITUAL_STEPS.map((step) => (
                            <label key={step} className="zenith-ritual-settings__check">
                                <input
                                    type="checkbox"
                                    checked={!settings.ritualSkip.includes(step)}
                                    onChange={() => toggleStep(step)}
                                />
                                {t(`ritual.step.${step}`)}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Week start ── */}
            <div className="zenith-settings__item">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">
                        {t('settings.journalWeekStart')}
                    </span>
                    <span className="zenith-settings__item-desc">
                        {t('settings.journalWeekStart.desc')}
                    </span>
                </div>
                <div className="zenith-settings__item-control">
                    <Dropdown
                        className="zenith-settings__picker"
                        value={settings.journalWeekStart}
                        options={[
                            { value: 'mon', label: t('settings.journalWeekStart.mon') },
                            { value: 'sun', label: t('settings.journalWeekStart.sun') },
                        ]}
                        onChange={(v) => updateSettings({ journalWeekStart: v as JournalWeekStart })}
                    />
                </div>
            </div>

            </div>

            {/* ── Trackers ── */}
            <div className="zenith-settings__section-label">{t('settings.journalTrackers')}</div>
            <div className="zenith-settings__item-desc zenith-settings__item-desc--block">
                {t('settings.journalTrackers.desc')}
            </div>

            {trackers.length === 0 ? (
                <div className="zenith-settings__empty-note">{t('settings.journalTrackers.empty')}</div>
            ) : (
                trackers.map(renderTracker)
            )}

            <div className="zenith-settings__color-control">
                {TRACKER_KINDS.map((kind) => (
                    <button key={kind} className="zenith-settings__inline-btn" onClick={() => add(kind)}>
                        <Plus size={14} /> {t(`journal.kind.${kind}`)}
                    </button>
                ))}
                <button
                    className="zenith-settings__inline-btn"
                    onClick={() => commit(DEFAULT_TRACKERS.map((tr) => ({ ...tr })))}
                >
                    {t('settings.journalTrackers.reset')}
                </button>
            </div>
        </div>
    );
};
