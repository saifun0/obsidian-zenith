import React, { useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Check, Plus, X } from 'lucide-react';
import { Modal } from '../../../components/shared/Modal';
import { DateField, TimeField } from '../../../components/ui/fields';
import { Segmented } from '../../../settings/controls';
import { useTranslation, type Translator } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useZenithStore } from '../../../store';
import { TIME_ICONS, type AsrMadhab } from '../prayerConfig';
import { prayerPlaceOf } from '../prayerOptions';
import {
    MATCH_TIMES,
    distinctMethods,
    localTimesFor,
    matchSetups,
    withMadhab,
    type MatchResult,
    type MatchSample,
    type MatchSetup,
    type MatchTimeId,
} from '../prayerMatch';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';

interface DayDraft {
    key: number;
    date: string;
    times: Record<MatchTimeId, string>;
}

const blankTimes = (): Record<MatchTimeId, string> =>
    Object.fromEntries(MATCH_TIMES.map((id) => [id, ''])) as Record<MatchTimeId, string>;

const toMinutes = (hhmm: string): number | undefined => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

/** An hour out per typed time on average is no match at all — a wrong place, or a typo. */
const HOPELESS = 60;

/** The method as a person would name it. */
export function setupLabel(setup: MatchSetup, t: Translator): string {
    return setup.method === 'custom'
        ? t('prayer.match.custom', {
              fajr: String(setup.fajrAngle ?? ''),
              isha: String(setup.ishaAngle ?? ''),
          })
        : t(`prayer.method.${setup.method}`);
}

/**
 * "Match my app" — type the times you trust, get the calculation that gives
 * them, and apply it in one step.
 *
 * The result is a proposal with its evidence beside it: per prayer, whether it
 * now matches and what correction it took. The madhab is shown as a choice
 * rather than as a fitted parameter, with both figures a tap apart, because it
 * is a matter of religious practice and not of arithmetic.
 */
export const PrayerMatchDialog: FC<{ onClose: () => void }> = ({ onClose }) => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const place = prayerPlaceOf(settings);

    const [days, setDays] = useState<DayDraft[]>(() => [
        { key: 0, date: getTodayString(), times: blankTimes() },
    ]);
    const [ranking, setRanking] = useState<MatchResult[] | null>(null);
    const [picked, setPicked] = useState(0);
    const [madhab, setMadhab] = useState<AsrMadhab | null>(null);

    const samples: MatchSample[] = useMemo(
        () =>
            days.map((d) => {
                const times: MatchSample['times'] = {};
                for (const id of MATCH_TIMES) {
                    const minutes = toMinutes(d.times[id]);
                    if (minutes !== undefined) times[id] = minutes;
                }
                return { date: d.date, times };
            }),
        [days]
    );
    const typed = samples.reduce((n, s) => n + Object.keys(s.times).length, 0);

    // Any edit makes the last answer stale; showing it beside new input would
    // pass off an old result as the new one.
    const edit = (next: DayDraft[]) => {
        setDays(next);
        setRanking(null);
    };
    const setTime = (key: number, id: MatchTimeId, value: string) =>
        edit(days.map((d) => (d.key === key ? { ...d, times: { ...d.times, [id]: value } } : d)));

    const current: MatchSetup = {
        method: settings.prayerMethod,
        fajrAngle: settings.prayerFajrAngle,
        ishaAngle: settings.prayerIshaAngle,
        asrMadhab: settings.prayerAsrMadhab,
        highLatRule: settings.prayerHighLatRule,
        rounding: settings.prayerRounding,
    };

    const find = () => {
        if (!place) return;
        const timesFor = localTimesFor(place, { hijriOffset: settings.prayerHijriOffset });
        setRanking(
            matchSetups(samples, { current, hijriOffset: settings.prayerHijriOffset }, timesFor)
        );
        setPicked(0);
        setMadhab(null);
    };

    const options = ranking ? distinctMethods(ranking, 3) : [];
    const base = options[picked];
    const shown = base && ranking && madhab ? (withMadhab(ranking, base, madhab) ?? base) : base;

    const apply = () => {
        if (!shown) return;
        const s = shown.setup;
        // Only the corrections for times that were typed are replaced; one the
        // user set for sunrise by hand, and did not type, is theirs to keep.
        const typedIds = new Set(samples.flatMap((x) => Object.keys(x.times)));
        const adjustments: Record<string, number> = {};
        for (const [id, value] of Object.entries(settings.prayerAdjustments)) {
            if (!typedIds.has(id)) adjustments[id] = value;
        }
        Object.assign(adjustments, shown.adjustments);

        updateSettings({
            prayerMethod: s.method,
            ...(s.method === 'custom' && s.fajrAngle !== undefined && s.ishaAngle !== undefined
                ? { prayerFajrAngle: s.fajrAngle, prayerIshaAngle: s.ishaAngle }
                : {}),
            prayerAsrMadhab: s.asrMadhab,
            prayerHighLatRule: s.highLatRule,
            prayerRounding: s.rounding,
            prayerAdjustments: adjustments,
            prayerMethodChosen: true,
        });
        new Notice(t('prayer.match.applied', { method: setupLabel(s, t) }));
        onClose();
    };

    const footer = (
        <>
            <button type="button" className="zenith-btn zenith-btn--ghost" onClick={onClose}>
                {t('common.cancel')}
            </button>
            {ranking && shown && shown.error < HOPELESS * typed ? (
                <button type="button" className="zenith-btn zenith-btn--primary" onClick={apply}>
                    <Check size={14} />
                    {t('prayer.match.apply')}
                </button>
            ) : (
                <button
                    type="button"
                    className="zenith-btn zenith-btn--primary"
                    disabled={!place || typed < 2}
                    onClick={find}
                >
                    {t('prayer.match.find')}
                </button>
            )}
        </>
    );

    return (
        <Modal title={t('prayer.match.title')} onClose={onClose} size="md" footer={footer}>
            <div className="zenith-prayer-match">
                <p className="zenith-prayer-match__lead">{t('prayer.match.lead')}</p>
                {!place && <p className="zenith-prayer-match__warn">{t('prayer.match.noPlace')}</p>}

                {days.map((day) => (
                    <fieldset key={day.key} className="zenith-prayer-match__day">
                        <div className="zenith-prayer-match__day-head">
                            <DateField
                                size="sm"
                                clearable={false}
                                value={day.date}
                                aria-label={t('prayer.match.day')}
                                onChange={(date) =>
                                    edit(days.map((d) => (d.key === day.key ? { ...d, date } : d)))
                                }
                            />
                            {days.length > 1 && (
                                <button
                                    type="button"
                                    className="zenith-prayer-match__remove"
                                    aria-label={t('prayer.match.removeDay')}
                                    title={t('prayer.match.removeDay')}
                                    onClick={() => edit(days.filter((d) => d.key !== day.key))}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="zenith-prayer-match__times">
                            {MATCH_TIMES.map((id) => (
                                <label key={id} className="zenith-prayer-match__time">
                                    <span className="zenith-prayer-match__name">
                                        <DynamicIcon name={TIME_ICONS[id]} size={13} />
                                        {t(`prayer.${id}`)}
                                    </span>
                                    <TimeField
                                        size="sm"
                                        value={day.times[id]}
                                        aria-label={t(`prayer.${id}`)}
                                        onChange={(v) => setTime(day.key, id, v)}
                                    />
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}

                {days.length < 3 && (
                    <button
                        type="button"
                        className="zenith-prayer-match__add"
                        title={t('prayer.match.addDayHint')}
                        onClick={() =>
                            edit([
                                ...days,
                                {
                                    key: Math.max(...days.map((d) => d.key)) + 1,
                                    date: getTodayString(),
                                    times: blankTimes(),
                                },
                            ])
                        }
                    >
                        <Plus size={14} />
                        {t('prayer.match.addDay')}
                    </button>
                )}

                {!ranking && typed < 2 && place && (
                    <p className="zenith-prayer-match__hint">{t('prayer.match.needTimes')}</p>
                )}

                {ranking && shown && (
                    <MatchOutcome
                        result={shown}
                        samples={samples}
                        hopeless={shown.error >= HOPELESS * typed}
                        onMadhab={(m) => setMadhab(m)}
                        apiNote={settings.prayerSource === 'api'}
                    />
                )}

                {ranking && options.length > 1 && (
                    <div className="zenith-prayer-match__others">
                        <span className="zenith-prayer-match__kicker">
                            {t('prayer.match.others')}
                        </span>
                        {options.map((o, i) =>
                            i === picked ? null : (
                                <button
                                    key={i}
                                    type="button"
                                    className="zenith-prayer-match__other"
                                    onClick={() => {
                                        setPicked(i);
                                        setMadhab(null);
                                    }}
                                >
                                    <span>{setupLabel(o.setup, t)}</span>
                                    <span className="zenith-prayer-match__muted">
                                        {t('prayer.match.errorOther', { value: String(o.error) })}
                                    </span>
                                </button>
                            )
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

/** The proposal and its evidence. */
const MatchOutcome: FC<{
    result: MatchResult;
    samples: MatchSample[];
    hopeless: boolean;
    apiNote: boolean;
    onMadhab: (m: AsrMadhab) => void;
}> = ({ result, samples, hopeless, apiNote, onMadhab }) => {
    const t = useTranslation();
    const s = result.setup;
    if (hopeless) return <p className="zenith-prayer-match__warn">{t('prayer.match.none')}</p>;

    const given = MATCH_TIMES.filter((id) => samples.some((x) => x.times[id] !== undefined));
    const worstAfter = (id: MatchTimeId) =>
        Math.max(0, ...result.after.map((r) => Math.abs(r[id] ?? 0)));
    const worst = Math.max(0, ...given.map(worstAfter));
    const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

    return (
        <section className="zenith-prayer-match__result">
            <span className="zenith-prayer-match__kicker">{t('prayer.match.best')}</span>
            <strong className="zenith-prayer-match__method">{setupLabel(s, t)}</strong>
            <span className="zenith-prayer-match__muted">
                {t(`prayer.rounding.${s.rounding}`)} · {t(`prayer.highLat.${s.highLatRule}`)}
            </span>

            <div className="zenith-prayer-match__madhab">
                <span className="zenith-prayer-match__name">{t('prayer.match.asr')}</span>
                <Segmented
                    value={s.asrMadhab}
                    options={[
                        { value: 'standard', label: t('prayer.madhab.standard') },
                        { value: 'hanafi', label: t('prayer.madhab.hanafi') },
                    ]}
                    onChange={(v) => onMadhab(v as AsrMadhab)}
                />
            </div>
            <p className="zenith-prayer-match__hint">{t('prayer.match.madhabHint')}</p>

            <ul className="zenith-prayer-match__rows">
                {given.map((id) => {
                    const left = worstAfter(id);
                    const correction = result.adjustments[id];
                    return (
                        <li key={id} className={`zenith-prayer-match__row${left ? ' is-off' : ''}`}>
                            <span className="zenith-prayer-match__name">
                                <DynamicIcon name={TIME_ICONS[id]} size={13} />
                                {t(`prayer.${id}`)}
                            </span>
                            <span className="zenith-prayer-match__muted">
                                {correction
                                    ? t('prayer.match.correction', { value: signed(correction) })
                                    : ''}
                            </span>
                            <span>
                                {left
                                    ? t('prayer.match.off', { value: String(left) })
                                    : t('prayer.match.exact')}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="zenith-prayer-match__hint">
                {worst
                    ? t('prayer.match.worst', { value: String(worst) })
                    : t('prayer.match.allMatch')}
                {apiNote ? ` ${t('prayer.match.apiNote')}` : ''}
            </p>
        </section>
    );
};
