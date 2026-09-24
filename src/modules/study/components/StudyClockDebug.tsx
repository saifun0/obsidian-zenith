import React, { useState, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { isoToDate } from '../../../core/calendarDates';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import { DateField, TimeField } from '../../../components/ui/fields';
import { ActionButton, SettingRow } from '../../../settings/controls';
import { minutesOf, timeOf } from '../studyModel';
import { dayState, isoDay, lessonsOn, weekOfCycle } from '../studyTime';
import {
    clearStudyPreview,
    previewPresets,
    setStudyPreview,
    type PreviewPreset,
} from '../previewClock';
import { dayName, useStudyNow, useStudyOptions, useStudySchedule, weekName } from '../useStudy';

const Fact: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="zenith-debug__fact">
        <span className="zenith-debug__fact-key">{label}</span>
        <span className="zenith-debug__fact-val">{value}</span>
    </div>
);

/**
 * The Study card and view at any moment, without waiting for it.
 *
 * A date and a time, or one of the moments the chosen day actually has —
 * before the first class, in one, in a break, after the last, a day off. The
 * facts below say what Study now believes: the time, what the day is doing and
 * which week of the cycle it is. Only Study's card and view move; see
 * `previewClock.ts`.
 */
export const StudyClockDebug: FC = () => {
    const t = useTranslation();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const { today, now, preview } = useStudyNow();
    const [date, setDate] = useState(today);
    const [time, setTime] = useState(() => timeOf(now));

    const apply = (at: Pick<PreviewPreset, 'date' | 'minute'>) => {
        setStudyPreview(at.date, at.minute);
        setDate(at.date);
        setTime(timeOf(at.minute));
    };

    const reset = () => {
        clearStudyPreview();
        const real = new Date();
        setDate(toLocalIsoDate(real));
        setTime(timeOf(real.getHours() * 60 + real.getMinutes()));
    };

    const day = date || today;
    const presets = previewPresets(schedule, day, opts);
    const state = dayState(lessonsOn(schedule, today, opts), now).kind;
    const shortDay = (iso: string) =>
        `${dayName(isoDay(iso), t.locale, 'short')}, ${isoToDate(iso).toLocaleDateString(t.locale, {
            day: 'numeric',
            month: 'short',
        })}`;
    const presetLabel = (p: PreviewPreset) =>
        `${t(`debug.study.preset.${p.id}`)} · ${p.id === 'free' ? shortDay(p.date) : timeOf(p.minute)}`;

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-settings__section-label">{t('debug.study.clock')}</div>
            <div className="zenith-settings__card">
                <SettingRow label={t('debug.study.date')}>
                    <DateField value={date} onChange={setDate} clearable={false} />
                </SettingRow>
                <SettingRow label={t('debug.study.time')}>
                    <TimeField value={time} onChange={setTime} />
                </SettingRow>
            </div>

            <div className="zenith-debug__toolbar">
                <ActionButton
                    label={t('debug.study.apply')}
                    cta
                    disabled={!time}
                    onClick={() => apply({ date: day, minute: minutesOf(time) })}
                />
                <ActionButton
                    label={t('study.preview.reset')}
                    disabled={!preview}
                    onClick={reset}
                />
            </div>

            <div className="zenith-settings__section-label">{t('debug.study.moments')}</div>
            {schedule.lessons.length ? (
                <div className="zenith-debug__toolbar">
                    {presets.map((p) => (
                        <ActionButton key={p.id} label={presetLabel(p)} onClick={() => apply(p)} />
                    ))}
                </div>
            ) : (
                <p className="zenith-debug__note">{t('debug.study.empty')}</p>
            )}
            <p className="zenith-debug__note">{t('debug.study.hint')}</p>

            <div className="zenith-settings__section-label">{t('debug.study.state')}</div>
            <div className="zenith-debug__facts">
                <Fact
                    label={t('debug.study.now')}
                    value={`${shortDay(today)} ${timeOf(now)} · ${t(
                        preview ? 'debug.study.preview' : 'debug.study.real'
                    )}`}
                />
                <Fact label={t('debug.study.day')} value={t(`debug.study.dayState.${state}`)} />
                {opts.twoWeeks && (
                    <Fact
                        label={t('debug.study.week')}
                        value={weekName(t, weekOfCycle(today, opts), weekStyle)}
                    />
                )}
            </div>
        </div>
    );
};
