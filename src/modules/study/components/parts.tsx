import React, { type FC } from 'react';
import { ClipboardPaste, Clock, Copy, GraduationCap, MapPin, PencilLine, X } from 'lucide-react';
import { Notice } from 'obsidian';
import { useTranslation, type Translator } from '../../../core/i18n';
import { timeOf, type StudyLesson } from '../studyModel';
import { dayLine, type DayLesson } from '../studyTime';
import { aiPrompt } from '../studyPrompt';
import { clearStudyPreview } from '../previewClock';

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
 * The day as one line. Each class is a stretch of it in its kind's colour, each
 * break the thread between two, and a bead stands at now. The line fills as
 * the day goes: what is behind the bead is inked in, what is ahead is a tint —
 * so the class that is on is its own progress bar, and no second bar is needed
 * to say how far into it you are.
 */
export const DayBand: FC<{ lessons: readonly DayLesson[]; now: number | null }> = ({
    lessons,
    now,
}) => {
    const t = useTranslation();
    const line = dayLine(lessons, now);
    if (!line) return null;
    return (
        <div className="zenith-study-band" aria-hidden="true">
            <div className="zenith-study-band__track">
                {line.parts.map((part) => {
                    const place = { left: `${part.left}%`, width: `${part.width}%` };
                    // What has gone by of the stretch now is in. The rest need
                    // no fill: behind and ahead are each one colour.
                    const fill = part.state === 'now' && (
                        <span className="zenith-study-band__fill" style={{ width: `${part.done}%` }} />
                    );
                    if (!part.lessons.length) {
                        return (
                            <span
                                key={`break-${part.start}`}
                                className={`zenith-study-band__gap is-${part.state}`}
                                style={place}
                            >
                                {fill}
                            </span>
                        );
                    }
                    return (
                        <span
                            key={`${part.start}-${part.end}`}
                            className={`zenith-study-band__seg is-kind-${part.lessons[0].lesson.kind} is-${part.state}`}
                            style={place}
                            title={`${timeOf(part.start)}–${timeOf(part.end)} · ${[
                                ...new Set(part.lessons.map((l) => l.lesson.subject)),
                            ].join(' / ')}`}
                        >
                            {fill}
                        </span>
                    );
                })}
                {line.now !== null && (
                    <span
                        className={`zenith-study-band__now${
                            line.current ? ` is-kind-${line.current.lessons[0].lesson.kind}` : ''
                        }`}
                        style={{ left: `${line.now}%` }}
                    />
                )}
            </div>
            <div className="zenith-study-band__ends">
                <span>{timeOf(line.from)}</span>
                {/* During the last class the card has just said when it ends,
                    and that is when the day does: once is enough. */}
                {line.current?.end !== line.to && (
                    <span>{t('study.todayUntil', { time: timeOf(line.to) })}</span>
                )}
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

/**
 * On the card and in the view while the debug tools' preview time is on: a
 * timetable at a made-up hour must not pass for the real one. A tap goes back
 * to the real time.
 */
export const PreviewBadge: FC<{ now: number }> = ({ now }) => {
    const t = useTranslation();
    const time = timeOf(now);
    return (
        <button
            type="button"
            className="zenith-study__preview"
            onClick={clearStudyPreview}
            title={`${t('study.preview.badge')} · ${t('study.preview.reset')}`}
            aria-label={`${t('study.preview.badge')} ${time}. ${t('study.preview.reset')}`}
        >
            <Clock size={11} aria-hidden />
            {time}
            <X size={11} aria-hidden />
        </button>
    );
};
