import React, { useId, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { Dropdown, TimeField } from '../../../components/ui/fields';
import { useZenithStore } from '../../../store';
import {
    LESSON_KINDS,
    type LessonKind,
    type StudyBell,
    type StudyLesson,
    type WeekTag,
} from '../studyModel';
import { dayName, weekName } from '../useStudy';
import { kindLabel } from './parts';

/** A row of choices where every option fits on screen — what a dropdown hides for no reason. */
export const Segmented: FC<{
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    label?: string;
}> = ({ value, options, onChange, label }) => (
    <span className="zenith-study-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={o.value === value}
                className={o.value === value ? 'is-active' : ''}
                onClick={() => onChange(o.value)}
            >
                {o.label}
            </button>
        ))}
    </span>
);

/** The same switch everywhere in the module: a button that says what it is. */
export const Switch: FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
    checked,
    onChange,
    label,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`zenith-study-switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
    >
        <span className="zenith-study-switch__knob" />
    </button>
);

const CUSTOM = 'custom';

/**
 * One class, every field. Subject and teacher offer what is already in the
 * timetable, because the same six subjects are typed forty times a term.
 * The time is a bell by default — change the bell, and every class in it
 * moves — or a time of its own.
 */
export const LessonForm: FC<{
    lesson: StudyLesson;
    bells: readonly StudyBell[];
    twoWeeks: boolean;
    subjects: readonly string[];
    teachers: readonly string[];
    onChange: (patch: Partial<StudyLesson>) => void;
}> = ({ lesson, bells, twoWeeks, subjects, teachers, onChange }) => {
    const t = useTranslation();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const id = useId();
    const custom = lesson.n === undefined || !bells.some((b) => b.n === lesson.n) || !!lesson.start;
    const timeValue = custom ? CUSTOM : String(lesson.n);

    const field = (key: string, label: string, control: React.ReactNode, wide = false) => (
        <label className={`zenith-study-form__field${wide ? ' is-wide' : ''}`} key={key}>
            <span>{label}</span>
            {control}
        </label>
    );

    return (
        <div className="zenith-study-form">
            {field(
                'subject',
                t('study.field.subject'),
                <>
                    <input
                        className="zenith-input"
                        value={lesson.subject}
                        list={`${id}-subjects`}
                        onChange={(e) => onChange({ subject: e.target.value })}
                        autoFocus={!lesson.subject}
                    />
                    <datalist id={`${id}-subjects`}>
                        {subjects.map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                </>,
                true
            )}
            {field(
                'kind',
                t('study.field.kind'),
                <Dropdown
                    value={lesson.kind}
                    options={LESSON_KINDS.map((k) => ({ value: k, label: kindLabel(t, k) }))}
                    onChange={(v) => onChange({ kind: v as LessonKind })}
                />
            )}
            {field(
                'day',
                t('study.field.day'),
                <Dropdown
                    value={String(lesson.day)}
                    options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
                        value: String(d),
                        label: dayName(d, t.locale),
                    }))}
                    onChange={(v) => onChange({ day: Number(v) })}
                />
            )}
            {field(
                'time',
                t('study.field.time'),
                <Dropdown
                    value={timeValue}
                    options={[
                        ...bells.map((b) => ({
                            value: String(b.n),
                            label: `${t('study.pair', { n: b.n })} · ${b.start}–${b.end}`,
                        })),
                        { value: CUSTOM, label: t('study.field.customTime') },
                    ]}
                    onChange={(v) =>
                        v === CUSTOM
                            ? onChange({
                                  start:
                                      lesson.start ??
                                      bells.find((b) => b.n === lesson.n)?.start ??
                                      '09:00',
                                  end:
                                      lesson.end ??
                                      bells.find((b) => b.n === lesson.n)?.end ??
                                      '10:30',
                              })
                            : onChange({ n: Number(v), start: undefined, end: undefined })
                    }
                />
            )}
            {custom && (
                <>
                    {field(
                        'start',
                        t('study.field.start'),
                        <TimeField
                            value={lesson.start ?? ''}
                            onChange={(v) => onChange({ start: v || undefined })}
                            step={5}
                        />
                    )}
                    {field(
                        'end',
                        t('study.field.end'),
                        <TimeField
                            value={lesson.end ?? ''}
                            onChange={(v) => onChange({ end: v || undefined })}
                            step={5}
                        />
                    )}
                </>
            )}
            {twoWeeks &&
                field(
                    'week',
                    t('study.field.week'),
                    <Segmented
                        value={String(lesson.week)}
                        label={t('study.field.week')}
                        options={[
                            { value: '0', label: t('study.week.every') },
                            { value: '1', label: weekName(t, 1, weekStyle) },
                            { value: '2', label: weekName(t, 2, weekStyle) },
                        ]}
                        onChange={(v) => onChange({ week: Number(v) as WeekTag })}
                    />,
                    true
                )}
            {field(
                'subgroup',
                t('study.field.subgroup'),
                <Segmented
                    value={String(lesson.subgroup ?? 0)}
                    label={t('study.field.subgroup')}
                    options={[
                        { value: '0', label: t('study.subgroup.all') },
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                    ]}
                    onChange={(v) => onChange({ subgroup: Number(v) || undefined })}
                />
            )}
            {field(
                'room',
                t('study.field.room'),
                <input
                    className="zenith-input"
                    value={lesson.room ?? ''}
                    onChange={(e) => onChange({ room: e.target.value })}
                />
            )}
            {field(
                'teacher',
                t('study.field.teacher'),
                <>
                    <input
                        className="zenith-input"
                        value={lesson.teacher ?? ''}
                        list={`${id}-teachers`}
                        onChange={(e) => onChange({ teacher: e.target.value })}
                    />
                    <datalist id={`${id}-teachers`}>
                        {teachers.map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                </>
            )}
            {field(
                'note',
                t('study.field.note'),
                <input
                    className="zenith-input"
                    value={lesson.note ?? ''}
                    onChange={(e) => onChange({ note: e.target.value })}
                />,
                true
            )}
        </div>
    );
};
