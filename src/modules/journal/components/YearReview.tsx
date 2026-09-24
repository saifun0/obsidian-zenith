import React, { useMemo, useState, type FC } from 'react';
import { ChevronLeft, ChevronRight, ImageDown } from 'lucide-react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { trackerColor } from '../../../core/journalConfig';
import { useZenithStore } from '../../../store';
import { challengeProgress } from '../../content/services/challenge';
import { usableTrackers } from '../services/usableTrackers';
import {
    IMAGE_DEFAULTS,
    IMAGE_SECTIONS,
    reviewAvailable,
    yearCardSvg,
    yearReview,
    type ImageLine,
    type ImageSection,
} from '../services/yearReview';
import { availableSections, summaryLabels } from './SummaryBlock';

/** An SVG string as PNG bytes, through a canvas — nothing leaves the device. */
async function svgToPng(svg: string): Promise<ArrayBuffer> {
    const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1080);
    const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 1080);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Zenith: the year card could not be drawn'));
            img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
        );
        return await blob.arrayBuffer();
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** The theme's colours, so the card looks like the vault it came from. */
function themeColors() {
    const css = getComputedStyle(document.body);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
        bg: read('--background-primary', '#ffffff'),
        fg: read('--text-normal', '#222222'),
        muted: read('--text-muted', '#6b6b6b'),
        accent: read('--interactive-accent', '#7b6cd9'),
    };
}

/**
 * The year in review: a figure per module that has something to say, the
 * habits' best runs, and the mood across the twelve months. Nothing to fill
 * in — it is the year's notes, read back.
 */
export const YearReview: FC<{ initialYear: number }> = ({ initialYear }) => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const tasks = useZenithStore((s) => s.tasks);
    const entries = useZenithStore((s) => s.journalEntries);
    const content = useZenithStore((s) => s.contentItems);
    const today = getTodayString();
    const [year, setYear] = useState(initialYear);
    const [picture, setPicture] = useState<ImageSection[]>([...IMAGE_DEFAULTS]);
    const [saving, setSaving] = useState(false);

    const sections = useMemo(() => availableSections(settings), [settings]);
    const review = useMemo(
        () =>
            yearReview(
                { tasks, entries, trackers: usableTrackers(settings), content },
                year,
                today,
                sections
            ),
        [tasks, entries, content, settings, year, today, sections]
    );
    const labels = summaryLabels(t, settings, String(year));
    const { summary } = review;
    const challenge = settings.activeModuleIds.includes('content')
        ? challengeProgress(
              content,
              settings.contentChallenges,
              year === Number(today.slice(0, 4)) ? today : `${year}-12-31`,
              settings.contentChallengeRereads
          )
        : [];

    if (!reviewAvailable(year, today)) {
        return <p className="zenith-yreview__empty">{t('review.year.notYet')}</p>;
    }

    const prayerTotal = summary.prayer
        ? summary.prayer.ontime + summary.prayer.late + summary.prayer.missed
        : 0;

    /** Each section as one figure and what it counts — the page and the picture share them. */
    const figures: ImageLine[] = [];
    if (summary.tasks && summary.tasks.done > 0) {
        figures.push({
            section: 'tasks',
            value: String(summary.tasks.done),
            label: t('review.year.tasks'),
        });
    }
    if (summary.words && summary.words.total > 0) {
        figures.push({
            section: 'words',
            value: summary.words.total.toLocaleString(t.locale),
            label: t('review.year.words', { days: t.plural('review.days', summary.words.days) }),
        });
    }
    if (summary.content && summary.content.finished.length > 0) {
        figures.push({
            section: 'content',
            value: String(summary.content.finished.length),
            label: t('review.year.content'),
        });
    }
    const best = review.bestRuns[0];
    if (best) {
        figures.push({
            section: 'habits',
            value: String(best.bestRun),
            label: t('review.year.bestRun', { name: best.name }),
        });
    }
    if (prayerTotal > 0 && summary.prayer) {
        figures.push({
            section: 'prayer',
            value: `${Math.round((summary.prayer.ontime / prayerTotal) * 100)}%`,
            label: t('review.year.prayer'),
        });
    }
    if (summary.fasting?.ramadan) {
        figures.push({
            section: 'fasting',
            value: String(summary.fasting.ramadan),
            label: t('review.year.fasting'),
        });
    }

    const moodMonths = review.mood ? review.moodByMonth : [];
    const monthName = (i: number) =>
        new Date(year, i, 1).toLocaleDateString(t.locale, { month: 'narrow' });

    const savePicture = async () => {
        setSaving(true);
        try {
            const lines = figures.filter((f) => picture.includes(f.section));
            const svg = yearCardSvg(year, t('review.year.title'), lines, themeColors());
            const path = await app.fileManager.getAvailablePathForAttachment(
                `${t('review.year.title')} ${year}.png`,
                ''
            );
            const file = await app.vault.createBinary(path, await svgToPng(svg));
            await app.workspace.getLeaf(true).openFile(file);
        } catch (err) {
            console.error('Zenith: could not save the year card:', err);
            new Notice(t('review.year.imageFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="zenith-yreview">
            <div className="zenith-yreview__head">
                <button
                    type="button"
                    className="zenith-yreview__step"
                    onClick={() => setYear(year - 1)}
                    aria-label={t('review.year.prev')}
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="zenith-yreview__year">{year}</span>
                <button
                    type="button"
                    className="zenith-yreview__step"
                    onClick={() => setYear(year + 1)}
                    disabled={!reviewAvailable(year + 1, today)}
                    aria-label={t('review.year.next')}
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {figures.length === 0 && moodMonths.length === 0 && (
                <p className="zenith-yreview__empty">{t('review.empty')}</p>
            )}

            <div className="zenith-yreview__figures">
                {figures.map((f) => (
                    <div key={f.section} className="zenith-yreview__figure">
                        <b>{f.value}</b>
                        <span>{f.label}</span>
                    </div>
                ))}
            </div>

            {summary.tasks && summary.tasks.tags.length > 0 && (
                <p className="zenith-yreview__line">{labels.tasks(summary.tasks)}</p>
            )}
            {challenge.map((c) => (
                <p key={c.typeId} className="zenith-yreview__line">
                    {t('review.year.challenge', {
                        type: labels.contentType(c.typeId),
                        done: c.done,
                        target: c.target,
                    })}
                </p>
            ))}
            {review.bestRuns.slice(1, 3).map((h) => (
                <p key={h.id} className="zenith-yreview__line">
                    {t('review.year.bestRun', { name: h.name })} —{' '}
                    {t.plural('review.habit.run', h.bestRun)}
                </p>
            ))}
            {summary.fasting && Object.keys(summary.fasting).length > 0 && (
                <p className="zenith-yreview__line">
                    {Object.entries(summary.fasting)
                        .map(([kind, n]) => `${t(`fast.kind.${kind}`)} — ${n}`)
                        .join(' · ')}
                </p>
            )}

            {review.mood && moodMonths.some((m) => m !== null) && (
                <div className="zenith-yreview__mood" aria-label={t('review.year.mood')}>
                    <span className="zenith-yreview__label">{t('review.year.mood')}</span>
                    <div className="zenith-yreview__months">
                        {moodMonths.map((avg, i) => (
                            <span
                                key={i}
                                className="zenith-yreview__month"
                                title={avg === null ? '' : avg.toFixed(1)}
                                style={
                                    avg === null || !review.mood
                                        ? undefined
                                        : { background: trackerColor(review.mood, avg) }
                                }
                            >
                                {monthName(i)}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {figures.length > 0 && (
                <div className="zenith-yreview__picture">
                    <span className="zenith-yreview__label">{t('review.year.image')}</span>
                    <div className="zenith-yreview__choices">
                        {IMAGE_SECTIONS.filter((s) => figures.some((f) => f.section === s)).map(
                            (s) => (
                                <label key={s} className="zenith-yreview__choice">
                                    <input
                                        type="checkbox"
                                        checked={picture.includes(s)}
                                        onChange={() =>
                                            setPicture(
                                                picture.includes(s)
                                                    ? picture.filter((p) => p !== s)
                                                    : [...picture, s]
                                            )
                                        }
                                    />
                                    {t(`review.section.${s === 'mood' ? 'habits' : s}`)}
                                </label>
                            )
                        )}
                    </div>
                    <button
                        type="button"
                        className="mod-cta"
                        disabled={saving || !figures.some((f) => picture.includes(f.section))}
                        onClick={() => void savePicture()}
                    >
                        <ImageDown size={14} />
                        {t('review.year.saveImage')}
                    </button>
                </div>
            )}
        </div>
    );
};
