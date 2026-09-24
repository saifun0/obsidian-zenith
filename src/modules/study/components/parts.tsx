import React, { type FC } from 'react';
import { ClipboardPaste, Copy, GraduationCap, MapPin, PencilLine } from 'lucide-react';
import { Notice } from 'obsidian';
import { useTranslation, type Translator } from '../../../core/i18n';
import { timeOf, type StudyLesson } from '../studyModel';
import type { DayLesson } from '../studyTime';
import { aiPrompt } from '../studyPrompt';

/** A kind of class, in words. */
export function kindLabel(t: Translator, kind: StudyLesson['kind']): string {
    // Not `study.kind.other`: a key ending in `.other` reads as a plural form.
    return kind === 'other' ? t('study.kindOther') : t(`study.kind.${kind}`);
}

/** The prompt on the clipboard, and a line saying what to do with it. */
export async function copyPrompt(t: Translator): Promise<void> {
    await navigator.clipboard.writeText(aiPrompt(t.locale));
    new Notice(t('study.promptCopied'), 8000);
}

/** "Lab · Group 1 · Ivanov" — what a lesson is, after its subject. */
export function lessonMeta(
    lesson: StudyLesson,
    t: Translator,
    opts: { teacher?: boolean; subgroups?: boolean } = {}
): string {
    return [
        kindLabel(t, lesson.kind),
        opts.subgroups !== false && lesson.subgroup
            ? t('study.subgroup', { n: lesson.subgroup })
            : '',
        opts.teacher && lesson.teacher ? lesson.teacher : '',
    ]
        .filter(Boolean)
        .join(' · ');
}

export const RoomPill: FC<{ room?: string; strong?: boolean }> = ({ room, strong }) =>
    room ? (
        <span className={`zenith-study-room${strong ? ' is-strong' : ''}`}>
            <MapPin size={strong ? 13 : 11} />
            {room}
        </span>
    ) : null;

type RowState = 'past' | 'now' | 'next' | 'later';

/**
 * One lesson as a line: times, the kind's colour, subject and what it is,
 * and the room at the end — where the eye looks when walking between
 * buildings.
 */
export const LessonRow: FC<{
    item: DayLesson;
    state?: RowState;
    showTeacher?: boolean;
    onClick?: () => void;
}> = ({ item, state = 'later', showTeacher, onClick }) => {
    const t = useTranslation();
    const { lesson } = item;
    const body = (
        <>
            <span className="zenith-study-row__time">
                <b>{timeOf(item.start)}</b>
                <span>{timeOf(item.end)}</span>
            </span>
            <span className="zenith-study-row__bar" aria-hidden="true" />
            <span className="zenith-study-row__main">
                <span className="zenith-study-row__subject">{lesson.subject}</span>
                <span className="zenith-study-row__meta">
                    {lessonMeta(lesson, t, { teacher: showTeacher })}
                </span>
            </span>
            <RoomPill room={lesson.room} />
        </>
    );
    const cls = `zenith-study-row is-kind-${lesson.kind} is-${state}`;
    return onClick ? (
        <button type="button" className={cls} onClick={onClick} data-lesson={lesson.id}>
            {body}
        </button>
    ) : (
        <div className={cls} data-lesson={lesson.id}>
            {body}
        </div>
    );
};

/** Where a lesson stands against `now`. */
export function rowState(item: DayLesson, now: number | null, nextStart: number | null): RowState {
    if (now === null) return 'later';
    if (item.end <= now) return 'past';
    if (item.start <= now) return 'now';
    return item.start === nextStart ? 'next' : 'later';
}

/**
 * The day as one strip: each class a segment in its kind's colour, the
 * breaks the gaps between them, and a needle at now. The shape of the day —
 * how long, where the long break is, how much is left — in one glance.
 */
export const DayBand: FC<{ lessons: readonly DayLesson[]; now: number | null }> = ({
    lessons,
    now,
}) => {
    const t = useTranslation();
    if (!lessons.length) return null;
    const from = lessons[0].start;
    const to = Math.max(...lessons.map((l) => l.end));
    const span = Math.max(1, to - from);
    const pos = (m: number) => `${((m - from) / span) * 100}%`;
    // One segment per slot: two subgroups at once are one stretch of the day.
    const slots = lessons.filter(
        (l, i) => lessons.findIndex((x) => x.start === l.start && x.end === l.end) === i
    );
    const needle = now !== null && now >= from && now <= to;
    return (
        <div className="zenith-study-band" aria-hidden="true">
            <div className="zenith-study-band__track">
                {slots.map((l) => (
                    <span
                        key={`${l.start}-${l.end}`}
                        className={`zenith-study-band__seg is-kind-${l.lesson.kind}${
                            now !== null && l.end <= now ? ' is-past' : ''
                        }${now !== null && l.start <= now && now < l.end ? ' is-now' : ''}`}
                        style={{
                            left: pos(l.start),
                            width: `${((l.end - l.start) / span) * 100}%`,
                        }}
                        title={`${timeOf(l.start)}–${timeOf(l.end)} · ${lessons
                            .filter((x) => x.start === l.start)
                            .map((x) => x.lesson.subject)
                            .join(' / ')}`}
                    />
                ))}
                {needle && (
                    <span className="zenith-study-band__needle" style={{ left: pos(now) }} />
                )}
            </div>
            <div className="zenith-study-band__ends">
                <span>{timeOf(from)}</span>
                <span>{t('study.todayUntil', { time: timeOf(to) })}</span>
            </div>
        </div>
    );
};

/**
 * No timetable yet: the three ways to get one, the easiest first. Nothing
 * else is drawn — there is nothing else to say.
 */
export const StudySetup: FC<{
    onImport: () => void;
    onEdit: () => void;
    compact?: boolean;
}> = ({ onImport, onEdit, compact }) => {
    const t = useTranslation();
    return (
        <div className={`zenith-study-setup${compact ? ' is-compact' : ''}`}>
            <GraduationCap size={compact ? 22 : 30} className="zenith-study-setup__icon" />
            <b>{t('study.empty.title')}</b>
            <p>{t('study.empty.body')}</p>
            <div className="zenith-study-setup__actions">
                <button type="button" className="mod-cta" onClick={onImport}>
                    <ClipboardPaste size={14} />
                    {t('study.import')}
                </button>
                <button type="button" onClick={onEdit}>
                    <PencilLine size={14} />
                    {t('settings.studyEdit')}
                </button>
                <button
                    type="button"
                    className="zenith-study-setup__prompt"
                    onClick={() => void copyPrompt(t)}
                >
                    <Copy size={14} />
                    {t('study.copyPrompt')}
                </button>
            </div>
        </div>
    );
};
