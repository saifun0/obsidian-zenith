import React, { useMemo, useState, type FC } from 'react';
import { AlertTriangle, ChevronDown, Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { Notice } from 'obsidian';
import { useTranslation } from '../../../core/i18n';
import { Modal } from '../../../components/shared/Modal';
import { TimeField } from '../../../components/ui/fields';
import { useZenithStore } from '../../../store';
import {
    conflicts,
    generateBells,
    lessonTimes,
    minutesOf,
    newLessonId,
    normalizeSchedule,
    timeOf,
    type StudyBell,
    type StudyLesson,
    type StudySchedule,
} from '../studyModel';
import { anchorFor, isoDay, weekOfCycle } from '../studyTime';
import { dayName, useStudyNow, useStudyOptions, useStudySchedule, weekName } from '../useStudy';
import { LessonForm, Segmented, Switch } from './LessonForm';
import { RoomPill, lessonMeta } from './parts';

type Tab = 'lessons' | 'bells';

const sortKey = (l: StudyLesson, bells: readonly StudyBell[]) =>
    lessonTimes(l, bells)?.start ?? 24 * 60 + (l.n ?? 0);

/**
 * The timetable by hand: a day at a time, a class at a time.
 *
 * Everything happens on a copy — the timetable in use changes only on Save,
 * so a half-typed class never shows up on the dashboard, and Cancel means
 * cancel. What would make the timetable wrong rather than incomplete — two
 * classes in one slot, a class with no time — is counted at the bottom
 * before saving, not refused.
 */
export const EditorDialog: FC<{ onClose: () => void; focusLessonId?: string }> = ({
    onClose,
    focusLessonId,
}) => {
    const t = useTranslation();
    const saved = useStudySchedule();
    const opts = useStudyOptions();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const { today } = useStudyNow();

    const focused = saved.lessons.find((l) => l.id === focusLessonId);
    const [draft, setDraft] = useState<StudySchedule>(() => structuredClone(saved));
    const [twoWeeks, setTwoWeeks] = useState(opts.twoWeeks);
    const [thisWeek, setThisWeek] = useState<1 | 2>(() =>
        weekOfCycle(today, { ...opts, twoWeeks: true })
    );
    const [tab, setTab] = useState<Tab>(
        saved.bells.length || saved.lessons.length ? 'lessons' : 'bells'
    );
    const [day, setDay] = useState(focused?.day ?? Math.min(isoDay(today), 7));
    const [weekFilter, setWeekFilter] = useState<'all' | '1' | '2'>('all');
    const [open, setOpen] = useState<string | null>(focusLessonId ?? null);

    const subjects = useMemo(
        () => [...new Set(draft.lessons.map((l) => l.subject).filter(Boolean))].sort(),
        [draft]
    );
    const teachers = useMemo(
        () => [...new Set(draft.lessons.map((l) => l.teacher ?? '').filter(Boolean))].sort(),
        [draft]
    );
    const clashes = useMemo(() => conflicts(normalizeSchedule(draft)), [draft]);
    const untimed = draft.lessons.filter(
        (l) => l.subject.trim() && !lessonTimes(l, draft.bells)
    ).length;

    const patchLesson = (id: string, patch: Partial<StudyLesson>) =>
        setDraft((d) => ({
            ...d,
            lessons: d.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
    const removeLesson = (id: string) =>
        setDraft((d) => ({ ...d, lessons: d.lessons.filter((l) => l.id !== id) }));

    const dayLessons = draft.lessons
        .filter(
            (l) =>
                l.day === day &&
                (weekFilter === 'all' || !twoWeeks || l.week === 0 || String(l.week) === weekFilter)
        )
        .sort((a, b) => sortKey(a, draft.bells) - sortKey(b, draft.bells) || a.week - b.week);

    const addLesson = () => {
        const taken = new Set(draft.lessons.filter((l) => l.day === day).map((l) => l.n));
        const n =
            draft.bells.find((b) => !taken.has(b.n))?.n ?? draft.bells[draft.bells.length - 1]?.n;
        const lesson: StudyLesson = {
            id: newLessonId(),
            day,
            n,
            start: n === undefined ? '09:00' : undefined,
            end: n === undefined ? '10:30' : undefined,
            week: twoWeeks && weekFilter !== 'all' ? (Number(weekFilter) as 1 | 2) : 0,
            subject: '',
            kind: 'lecture',
        };
        setDraft((d) => ({ ...d, lessons: [...d.lessons, lesson] }));
        setOpen(lesson.id);
    };

    const duplicateToOther = (l: StudyLesson) => {
        const copy: StudyLesson = { ...l, id: newLessonId(), week: l.week === 1 ? 2 : 1 };
        setDraft((d) => ({ ...d, lessons: [...d.lessons, copy] }));
        setOpen(copy.id);
    };

    const save = () => {
        const clean = normalizeSchedule(draft);
        updateSettings({
            studySchedule: clean,
            studyTwoWeeks: twoWeeks,
            ...(twoWeeks ? { studyWeekAnchor: anchorFor(today, thisWeek) } : {}),
        });
        new Notice(t('study.importDone', { count: clean.lessons.length }));
        onClose();
    };

    const footer = (
        <>
            <span className="zenith-study-editor__warnings">
                {clashes.length > 0 && (
                    <span>
                        <AlertTriangle size={13} />
                        {t.plural('study.conflicts', clashes.length)}
                    </span>
                )}
                {untimed > 0 && (
                    <span>
                        <AlertTriangle size={13} />
                        {t.plural('study.untimed', untimed)}
                    </span>
                )}
            </span>
            <button className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('study.cancel')}
            </button>
            <button className="zenith-btn zenith-btn--primary" onClick={save}>
                {t('study.save')}
            </button>
        </>
    );

    return (
        <Modal
            title={t('study.editorTitle')}
            onClose={onClose}
            size="lg"
            footer={footer}
            className="zenith-study-editor"
        >
            <div className="zenith-study-editor__weeks">
                <span className="zenith-study-editor__weeks-label">
                    <b>{t('study.twoWeeks')}</b>
                    <span>{t('study.twoWeeks.desc')}</span>
                </span>
                <Switch checked={twoWeeks} onChange={setTwoWeeks} label={t('study.twoWeeks')} />
                {twoWeeks && (
                    <span className="zenith-study-editor__this-week">
                        <span>{t('study.thisWeekIs')}</span>
                        <Segmented
                            value={String(thisWeek)}
                            label={t('study.thisWeekIs')}
                            options={[
                                { value: '1', label: weekName(t, 1, weekStyle) },
                                { value: '2', label: weekName(t, 2, weekStyle) },
                            ]}
                            onChange={(v) => setThisWeek(v === '2' ? 2 : 1)}
                        />
                    </span>
                )}
            </div>

            <Segmented
                value={tab}
                options={[
                    {
                        value: 'lessons',
                        label: `${t('study.tab.lessons')} · ${draft.lessons.length}`,
                    },
                    { value: 'bells', label: `${t('study.tab.bells')} · ${draft.bells.length}` },
                ]}
                onChange={(v) => setTab(v as Tab)}
            />

            {tab === 'lessons' ? (
                <div className="zenith-study-editor__lessons">
                    <div className="zenith-study-editor__days" role="tablist">
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                            const count = draft.lessons.filter((l) => l.day === d).length;
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    role="tab"
                                    aria-selected={d === day}
                                    className={`${d === day ? 'is-active' : ''}${count ? '' : ' is-empty'}`}
                                    onClick={() => {
                                        setDay(d);
                                        setOpen(null);
                                    }}
                                >
                                    <span>{dayName(d, t.locale, 'short')}</span>
                                    <b>{count || '·'}</b>
                                </button>
                            );
                        })}
                    </div>
                    {twoWeeks && (
                        <Segmented
                            value={weekFilter}
                            label={t('study.field.week')}
                            options={[
                                { value: 'all', label: t('study.week.every') },
                                { value: '1', label: weekName(t, 1, weekStyle) },
                                { value: '2', label: weekName(t, 2, weekStyle) },
                            ]}
                            onChange={(v) => setWeekFilter(v as 'all' | '1' | '2')}
                        />
                    )}

                    {dayLessons.length === 0 && (
                        <p className="zenith-study-editor__empty">{t('study.noLessonsDay')}</p>
                    )}
                    {dayLessons.map((l) => {
                        const times = lessonTimes(l, draft.bells);
                        const expanded = open === l.id;
                        return (
                            <div
                                key={l.id}
                                className={`zenith-study-editor__lesson is-kind-${l.kind}${expanded ? ' is-open' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="zenith-study-editor__summary"
                                    aria-expanded={expanded}
                                    onClick={() => setOpen(expanded ? null : l.id)}
                                >
                                    <span className="zenith-study-editor__time">
                                        {l.n !== undefined && !l.start ? <b>{l.n}</b> : null}
                                        {times
                                            ? `${timeOf(times.start)}–${timeOf(times.end)}`
                                            : '—'}
                                    </span>
                                    <span className="zenith-study-editor__what">
                                        <span className="zenith-study-editor__subject">
                                            {l.subject || '…'}
                                        </span>
                                        <span className="zenith-study-editor__meta">
                                            {lessonMeta(l, t)}
                                        </span>
                                    </span>
                                    <RoomPill room={l.room} />
                                    {twoWeeks && l.week !== 0 && (
                                        <span className="zenith-study-editor__week">
                                            {weekName(t, l.week, weekStyle)}
                                        </span>
                                    )}
                                    <ChevronDown
                                        size={14}
                                        className="zenith-study-editor__chevron"
                                    />
                                </button>
                                {expanded && (
                                    <div className="zenith-study-editor__body">
                                        <LessonForm
                                            lesson={l}
                                            bells={draft.bells}
                                            twoWeeks={twoWeeks}
                                            subjects={subjects}
                                            teachers={teachers}
                                            onChange={(patch) => patchLesson(l.id, patch)}
                                        />
                                        <div className="zenith-study-editor__row-actions">
                                            {twoWeeks && l.week !== 0 && (
                                                <button
                                                    type="button"
                                                    className="zenith-btn zenith-btn--ghost"
                                                    onClick={() => duplicateToOther(l)}
                                                >
                                                    <Copy size={13} />
                                                    {t('study.duplicateToOther')}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="zenith-btn zenith-btn--ghost is-danger"
                                                onClick={() => removeLesson(l.id)}
                                            >
                                                <Trash2 size={13} />
                                                {t('study.deleteLesson')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <button type="button" className="zenith-study-editor__add" onClick={addLesson}>
                        <Plus size={14} />
                        {t('study.addLesson')}
                    </button>
                </div>
            ) : (
                <BellsEditor
                    bells={draft.bells}
                    onChange={(bells) => setDraft((d) => ({ ...d, bells }))}
                />
            )}
        </Modal>
    );
};

/**
 * The bells: a row each, and a way to lay them all out at once — most
 * timetables are "90 minutes, 10 between, a long break after the second",
 * and typing that is quicker than typing six pairs of times.
 */
const BellsEditor: FC<{ bells: StudyBell[]; onChange: (bells: StudyBell[]) => void }> = ({
    bells,
    onChange,
}) => {
    const t = useTranslation();
    const [gen, setGen] = useState({
        first: '08:30',
        length: 90,
        gap: 10,
        count: 6,
        longAfter: 2,
        longGap: 40,
    });

    const patch = (index: number, change: Partial<StudyBell>) =>
        onChange(bells.map((b, i) => (i === index ? { ...b, ...change } : b)));

    const add = () => {
        const last = bells[bells.length - 1];
        if (!last) {
            onChange([{ n: 1, start: '08:30', end: '10:00' }]);
            return;
        }
        const length = Math.max(15, minutesOf(last.end) - minutesOf(last.start));
        const start = Math.min(minutesOf(last.end) + 10, 23 * 60);
        onChange([
            ...bells,
            {
                n: last.n + 1,
                start: timeOf(start),
                end: timeOf(Math.min(start + length, 23 * 60 + 59)),
            },
        ]);
    };

    const num = (key: keyof typeof gen, min: number, max: number) => (
        <input
            type="number"
            className="zenith-input zenith-study-bells__num"
            min={min}
            max={max}
            value={gen[key]}
            onChange={(e) =>
                setGen({
                    ...gen,
                    [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)),
                })
            }
        />
    );

    return (
        <div className="zenith-study-bells">
            {bells.length === 0 && (
                <p className="zenith-study-editor__empty">{t('study.noBells')}</p>
            )}
            {bells.map((b, i) => (
                <div key={i} className="zenith-study-bells__row">
                    <span className="zenith-study-bells__n">{t('study.pair', { n: b.n })}</span>
                    <TimeField
                        value={b.start}
                        onChange={(v) => v && patch(i, { start: v })}
                        step={5}
                        size="sm"
                    />
                    <span aria-hidden="true">–</span>
                    <TimeField
                        value={b.end}
                        onChange={(v) => v && patch(i, { end: v })}
                        step={5}
                        size="sm"
                    />
                    <button
                        type="button"
                        className="zenith-study-bells__remove"
                        onClick={() => onChange(bells.filter((_, j) => j !== i))}
                        aria-label={t('study.deleteLesson')}
                        title={t('study.deleteLesson')}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
            <button type="button" className="zenith-study-editor__add" onClick={add}>
                <Plus size={14} />
                {t('study.addBell')}
            </button>

            <div className="zenith-study-bells__gen">
                <span className="zenith-study-bells__gen-title">
                    <Wand2 size={14} />
                    {t('study.generate')}
                </span>
                <label>
                    <span>{t('study.generate.first')}</span>
                    <TimeField
                        value={gen.first}
                        onChange={(v) => v && setGen({ ...gen, first: v })}
                        step={5}
                        size="sm"
                    />
                </label>
                <label>
                    <span>{t('study.generate.length')}</span>
                    {num('length', 15, 240)}
                </label>
                <label>
                    <span>{t('study.generate.gap')}</span>
                    {num('gap', 0, 120)}
                </label>
                <label>
                    <span>{t('study.generate.count')}</span>
                    {num('count', 1, 12)}
                </label>
                <label>
                    <span>{t('study.generate.long')}</span>
                    {num('longAfter', 0, 12)}
                </label>
                <label>
                    <span>{t('study.generate.longGap')}</span>
                    {num('longGap', 0, 180)}
                </label>
                <button
                    type="button"
                    className="zenith-btn zenith-btn--primary"
                    onClick={() => onChange(generateBells(gen))}
                >
                    {t('study.generate.apply')}
                </button>
            </div>
        </div>
    );
};
