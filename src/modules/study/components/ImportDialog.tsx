import React, { useMemo, useState, type FC } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Sparkles } from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { ConfirmModal } from '../../../core/ConfirmModal';
import { Modal } from '../../../components/shared/Modal';
import { useZenithStore } from '../../../store';
import { exportSchedule, importSchedule, type ImportProblem } from '../studyImport';
import { dayName, useStudySchedule } from '../useStudy';
import { copyPrompt } from './parts';

function problemText(p: ImportProblem, t: ReturnType<typeof useTranslation>): string {
    if (p.kind === 'not-json') return t('study.problem.not-json', { detail: p.detail });
    if (p.kind === 'no-lessons') return t('study.problem.no-lessons');
    return t(`study.problem.${p.reason}`, { n: p.index + 1 });
}

/**
 * The paste box. The timetable goes in as text — most often an AI chat's
 * answer to a photo — and what Zenith understood of it is shown underneath
 * as it is typed: how many bells and classes, per day, and each line it had
 * to skip and why. Nothing is saved until "Replace", and replacing a
 * timetable that exists is asked about first.
 */
export const ImportDialog: FC<{ onClose: () => void }> = ({ onClose }) => {
    const t = useTranslation();
    const { app } = useApp();
    const current = useStudySchedule();
    const twoWeeks = useZenithStore((s) => s.settings.studyTwoWeeks);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const [text, setText] = useState('');

    const result = useMemo(() => (text.trim() ? importSchedule(text) : null), [text]);
    const ok = !!result && result.schedule.lessons.length > 0;
    const fatal = result?.problems.find((p) => p.kind === 'not-json' || p.kind === 'no-lessons');

    const perDay = useMemo(() => {
        const counts = new Map<number, number>();
        for (const l of result?.schedule.lessons ?? [])
            counts.set(l.day, (counts.get(l.day) ?? 0) + 1);
        return [...counts].sort((a, b) => a[0] - b[0]);
    }, [result]);

    const save = async () => {
        if (!result || !ok) return;
        if (current.lessons.length) {
            const yes = await new ConfirmModal(app, {
                title: t('study.importReplace'),
                body: t('study.importConfirm', { count: current.lessons.length }),
                confirmText: t('study.importReplace'),
                cancelText: t('study.cancel'),
            }).ask();
            if (!yes) return;
        }
        updateSettings({ studySchedule: result.schedule, studyTwoWeeks: result.twoWeeks });
        new Notice(t('study.importDone', { count: result.schedule.lessons.length }));
        onClose();
    };

    const copyCurrent = async () => {
        await navigator.clipboard.writeText(exportSchedule(current, twoWeeks));
        new Notice(t('study.copied'));
    };

    const footer = (
        <>
            <button className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('study.cancel')}
            </button>
            <button
                className="zenith-btn zenith-btn--primary"
                onClick={() => void save()}
                disabled={!ok}
            >
                {t('study.importReplace')}
            </button>
        </>
    );

    return (
        <Modal
            title={t('study.importTitle')}
            onClose={onClose}
            size="lg"
            footer={footer}
            className="zenith-study-import"
        >
            <p className="zenith-study-import__help">{t('study.importHelp')}</p>
            <div className="zenith-study-import__actions">
                <button
                    type="button"
                    className="zenith-btn zenith-btn--primary"
                    onClick={() => void copyPrompt(t)}
                >
                    <Sparkles size={14} />
                    {t('study.copyPrompt')}
                </button>
                {current.lessons.length > 0 && (
                    <button
                        type="button"
                        className="zenith-btn zenith-btn--ghost"
                        onClick={() => void copyCurrent()}
                    >
                        <Copy size={14} />
                        {t('study.exportCurrent')}
                    </button>
                )}
            </div>
            <textarea
                className="zenith-input zenith-study-import__text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('study.importPlaceholder')}
                spellCheck={false}
                autoFocus
            />
            {result && (
                <div
                    className={`zenith-study-import__preview${fatal ? ' is-bad' : ''}`}
                    aria-live="polite"
                >
                    {!fatal && (
                        <span className="zenith-study-import__summary">
                            <CheckCircle2 size={14} />
                            {t('study.preview', {
                                bells: result.schedule.bells.length,
                                lessons: result.schedule.lessons.length,
                            })}
                            {result.twoWeeks && ` · ${t('study.preview.twoWeeks')}`}
                        </span>
                    )}
                    {!fatal && perDay.length > 0 && (
                        <span className="zenith-study-import__days">
                            {perDay.map(([day, count]) => (
                                <span key={day}>
                                    {dayName(day, t.locale, 'short')} <b>{count}</b>
                                </span>
                            ))}
                        </span>
                    )}
                    {result.problems.slice(0, 6).map((p, i) => (
                        <span key={i} className="zenith-study-import__problem">
                            <AlertTriangle size={13} />
                            {problemText(p, t)}
                        </span>
                    ))}
                    {result.problems.length > 6 && (
                        <span className="zenith-study-import__problem">…</span>
                    )}
                </div>
            )}
        </Modal>
    );
};
