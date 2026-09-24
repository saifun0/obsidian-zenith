import React, { type FC } from 'react';
import {
    CalendarClock,
    ListPlus,
    MapPin,
    Pencil,
    StickyNote,
    Trash2,
    User,
    Users,
} from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { ConfirmModal } from '../../../core/ConfirmModal';
import { PromptModal } from '../../../core/PromptModal';
import { isoToDate } from '../../../core/calendarDates';
import { Modal } from '../../../components/shared/Modal';
import { useZenithStore } from '../../../store';
import { TaskWriter } from '../../tasks/services/taskWriter';
import { resolveTaskTarget } from '../../tasks/services/taskTarget';
import { lessonTimes, timeOf } from '../studyModel';
import { nextOccurrence } from '../studyTime';
import { dayName, useStudyOptions, useStudySchedule, weekName } from '../useStudy';
import { kindLabel } from './parts';

/**
 * One class, opened from the timetable: everything about it, when it is
 * next, and the three things to do with it — note what is due for it,
 * change it, or take it off the timetable.
 */
export const LessonDialog: FC<{
    lessonId: string;
    /** The day it was opened from, so "next class" counts from there. */
    date: string;
    onClose: () => void;
    onEdit: (lessonId: string) => void;
}> = ({ lessonId, date, onClose, onEdit }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const homeworkOn = useFeature('study.homework');

    const lesson = schedule.lessons.find((l) => l.id === lessonId);
    if (!lesson) return null;
    const times = lessonTimes(lesson, schedule.bells);
    const next = nextOccurrence(schedule, lesson.subject, date, opts);
    const fmt = (iso: string) =>
        isoToDate(iso).toLocaleDateString(t.locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
        });

    const addHomework = async () => {
        if (!next) {
            new Notice(t('study.lesson.homeworkNone'));
            return;
        }
        const text = await new PromptModal(app, {
            title: t('study.lesson.homeworkPrompt', { subject: lesson.subject }),
            confirmText: t('study.save'),
            cancelText: t('study.cancel'),
        }).ask();
        if (!text?.trim()) return;
        const target = await resolveTaskTarget(app, settings);
        await new TaskWriter(app).addTask(
            settings.tasksFolderPath,
            {
                title: `${lesson.subject}: ${text.trim()}`,
                priority: 'none',
                tags: ['study'],
                dueDate: next,
            },
            target
        );
        void plugin.dataService.reloadTasks();
        new Notice(t('study.lesson.homeworkAdded', { date: fmt(next) }));
    };

    const remove = async () => {
        const yes = await new ConfirmModal(app, {
            title: t('study.lesson.delete'),
            body: t('study.lesson.deleteConfirm', { subject: lesson.subject }),
            confirmText: t('study.deleteLesson'),
            cancelText: t('study.cancel'),
        }).ask();
        if (!yes) return;
        updateSettings({
            studySchedule: {
                ...schedule,
                lessons: schedule.lessons.filter((l) => l.id !== lesson.id),
            },
        });
        onClose();
    };

    const row = (icon: React.ReactNode, value: React.ReactNode) => (
        <div className="zenith-study-lesson__row">
            {icon}
            <span>{value}</span>
        </div>
    );

    const footer = (
        <>
            {/* An icon only: the least-used action should not take the width the
                two others need on a phone. */}
            <button
                className="zenith-btn zenith-btn--ghost is-danger zenith-study-lesson__delete"
                onClick={() => void remove()}
                aria-label={t('study.lesson.delete')}
                title={t('study.lesson.delete')}
            >
                <Trash2 size={15} />
            </button>
            <button className="zenith-btn zenith-btn--ghost" onClick={() => onEdit(lesson.id)}>
                <Pencil size={14} />
                {t('study.lesson.edit')}
            </button>
            {homeworkOn && (
                <button
                    className="zenith-btn zenith-btn--primary"
                    onClick={() => void addHomework()}
                >
                    <ListPlus size={14} />
                    {t('study.lesson.homework')}
                </button>
            )}
        </>
    );

    return (
        <Modal
            onClose={onClose}
            size="md"
            footer={footer}
            className={`zenith-study-lesson is-kind-${lesson.kind}`}
            header={
                <div className="zenith-study-lesson__head">
                    <span className="zenith-study-lesson__kind">{kindLabel(t, lesson.kind)}</span>
                    <h3>{lesson.subject}</h3>
                </div>
            }
            title={lesson.subject}
        >
            {row(
                <CalendarClock size={15} />,
                <>
                    {dayName(lesson.day, t.locale)}
                    {times && ` · ${timeOf(times.start)}–${timeOf(times.end)}`}
                    {lesson.n !== undefined && ` · ${t('study.pair', { n: lesson.n })}`}
                    {opts.twoWeeks &&
                        ` · ${lesson.week ? weekName(t, lesson.week, settings.studyWeekNames) : t('study.week.every')}`}
                </>
            )}
            {lesson.room && row(<MapPin size={15} />, <b>{lesson.room}</b>)}
            {lesson.teacher && row(<User size={15} />, lesson.teacher)}
            {lesson.subgroup
                ? row(<Users size={15} />, t('study.subgroup', { n: lesson.subgroup }))
                : null}
            {lesson.note && row(<StickyNote size={15} />, lesson.note)}
            <p className="zenith-study-lesson__next">
                {next
                    ? t('study.lesson.next', { date: fmt(next) })
                    : t('study.lesson.homeworkNone')}
            </p>
        </Modal>
    );
};
