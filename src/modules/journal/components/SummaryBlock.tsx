import React, { useMemo, useState, type FC } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { TFile } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { featureEnabled } from '../../../core/features';
import { useFeature } from '../../../core/useFeature';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { getTodayString } from '../../../core/dateUtils';
import { isoToDate } from '../../../core/calendarDates';
import { useZenithStore } from '../../../store';
import type { ZenithSettings } from '../../../store/settingsSlice';
import { usableTrackers } from '../services/usableTrackers';
import {
    SUMMARY_SECTIONS,
    formatPeriodName,
    parseSummaryParams,
    weekOfRange,
    type PeriodRange,
    type ReviewPeriod,
    type SummarySection,
} from '../services/reviewPeriods';
import {
    sectionHasData,
    summarize,
    summaryMarkdown,
    type SnapshotLabels,
    type Summary,
} from '../services/summary';
import type { FastKind } from '../../prayer/fasting';
import { REVIEW_KEY, appendSnapshot, reviewRange, setReviewed } from '../services/reviewNotes';
import { YearReviewModal } from '../YearReviewModal';

/** The sections that can say something with the modules and features switched on. */
export function availableSections(settings: ZenithSettings): SummarySection[] {
    const on = (id: string) => settings.activeModuleIds.includes(id);
    return SUMMARY_SECTIONS.filter((section) => {
        switch (section) {
            case 'tasks':
                return on('tasks');
            case 'habits':
                return true;
            case 'content':
                return on('content');
            case 'prayer':
                return on('prayer');
            case 'fasting':
                return featureEnabled(settings, 'prayer.fasting');
            case 'words':
                return featureEnabled(settings, 'journal.wordCount');
        }
    });
}

/** "Week 39 · 21–27 Sep", "September 2026", "Q3 2026", "2026". */
export function periodTitle(range: PeriodRange, t: Translator): string {
    const start = isoToDate(range.start);
    switch (range.period) {
        case 'week': {
            const fmt = (iso: string) =>
                isoToDate(iso).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' });
            return t('review.title.week', {
                week: weekOfRange(range.start).week,
                from: fmt(range.start),
                to: fmt(range.end),
            });
        }
        case 'month': {
            const name = start.toLocaleDateString(t.locale, { month: 'long', year: 'numeric' });
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        case 'quarter':
            return formatPeriodName(`[${t('review.quarterShort')}]Q YYYY`, range);
        case 'year':
            return String(start.getFullYear());
    }
}

/** Everything a section says, in words — shared by the block and its snapshot. */
export function summaryLabels(
    t: Translator,
    settings: ZenithSettings,
    heading: string
): SnapshotLabels {
    const types = effectiveContentTypes(settings.contentTypes);
    return {
        heading,
        section: (s) => t(`review.section.${s}`),
        tasks: (x) =>
            [
                t.plural('review.tasks.done', x.done),
                x.cancelled ? t.plural('review.tasks.cancelled', x.cancelled) : '',
                x.open ? t.plural('review.tasks.open', x.open) : '',
            ]
                .filter(Boolean)
                .join(' · ') +
            (x.tags.length
                ? ` · ${x.tags.map((tag) => `${tag.tag} ${tag.count}`).join(', ')}`
                : ''),
        habit: (h) =>
            t('review.habit', { name: h.name, kept: h.kept, days: h.days }) +
            (h.bestRun > 1 ? ` · ${t.plural('review.habit.run', h.bestRun)}` : ''),
        content: (c) =>
            [
                c.finished.length ? t.plural('review.content.finished', c.finished.length) : '',
                c.started ? t.plural('review.content.started', c.started) : '',
            ]
                .filter(Boolean)
                .join(' · '),
        contentType: (id) => resolveContentType(types, id).label,
        prayer: (p) => {
            const total = p.ontime + p.late + p.missed;
            const percent = total ? Math.round((p.ontime / total) * 100) : 0;
            return t('review.prayer', { percent, late: p.late, missed: p.missed });
        },
        fast: (kind, count) => `${t(`fast.kind.${kind}`)} — ${count}`,
        words: (w) =>
            t('review.words', {
                words: w.total.toLocaleString(t.locale),
                days: t.plural('review.days', w.days),
            }),
        frozen: t('review.frozen', {
            date: new Date().toLocaleDateString(t.locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            }),
        }),
    };
}

interface SummaryBlockProps {
    source: string;
    sourcePath: string;
    /** The line the block's closing fence is on, when Obsidian can say. */
    lineEnd: () => number | null;
}

/**
 * A `zenith-summary` block: a period's numbers, counted live from the notes
 * every time it is drawn. **Freeze** writes them into the note as Markdown
 * underneath, so what the week looked like survives edits made after it —
 * and reads without the plugin.
 */
export const SummaryBlock: FC<SummaryBlockProps> = ({ source, sourcePath, lineEnd }) => {
    const t = useTranslation();
    const on = useFeature('journal.reviews');
    if (!on) return <div className="zenith-summary__off">{t('review.off')}</div>;
    return <SummaryBody source={source} sourcePath={sourcePath} lineEnd={lineEnd} />;
};

const SummaryBody: FC<SummaryBlockProps> = ({ source, sourcePath, lineEnd }) => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const tasks = useZenithStore((s) => s.tasks);
    const entries = useZenithStore((s) => s.journalEntries);
    const content = useZenithStore((s) => s.contentItems);
    const yearOn = useFeature('journal.yearInReview');
    const [frozen, setFrozen] = useState(false);
    // The frontmatter is read at render and the metadata cache does not
    // re-render this block, so the click remembers what it wrote.
    const [reviewedNow, setReviewedNow] = useState<boolean | null>(null);

    const file = app.vault.getAbstractFileByPath(sourcePath);
    const frontmatter =
        file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
    const reviewed = reviewedNow ?? frontmatter?.reviewed === true;
    const isReviewNote = typeof frontmatter?.[REVIEW_KEY] === 'string';

    const params = parseSummaryParams(source);
    const period: ReviewPeriod =
        params.period ??
        (['week', 'month', 'quarter', 'year'].includes(String(frontmatter?.[REVIEW_KEY]))
            ? (frontmatter?.[REVIEW_KEY] as ReviewPeriod)
            : 'week');
    const today = getTodayString();
    const date =
        params.date ??
        (typeof frontmatter?.start === 'string' ? frontmatter.start : undefined) ??
        entries.find((e) => e.filePath === sourcePath)?.date ??
        today;
    const range = reviewRange(settings, period, date);
    // Keyed by its contents: the list is rebuilt from the source on every render.
    const sectionsKey = (params.show ?? availableSections(settings)).join(',');
    const sections = useMemo(
        () => sectionsKey.split(',').filter(Boolean) as SummarySection[],
        [sectionsKey]
    );

    const summary: Summary = useMemo(
        () =>
            summarize(
                { tasks, entries, trackers: usableTrackers(settings), content },
                range.start,
                range.end,
                today,
                sections
            ),
        [tasks, entries, content, settings, range.start, range.end, today, sections]
    );

    const title = periodTitle(range, t);
    const labels = summaryLabels(t, settings, title);
    const shown = sections.filter((s) => sectionHasData(summary, s));

    const freeze = async () => {
        const line = lineEnd();
        if (!(file instanceof TFile) || line === null) return;
        await appendSnapshot(app, file, line, summaryMarkdown(summary, sections, labels));
        setFrozen(true);
    };

    const openLink = (path: string) => void app.workspace.openLinkText(path, sourcePath, false);

    return (
        <div className="zenith-summary">
            <div className="zenith-summary__head">
                <span className="zenith-summary__title">{title}</span>
                {period === 'year' && yearOn && (
                    <button
                        type="button"
                        className="zenith-summary__action"
                        onClick={() =>
                            new YearReviewModal(
                                app,
                                plugin,
                                isoToDate(range.start).getFullYear()
                            ).open()
                        }
                    >
                        <Sparkles size={13} />
                        {t('review.year.open')}
                    </button>
                )}
                {isReviewNote && file instanceof TFile && (
                    <button
                        type="button"
                        className={`zenith-summary__action${reviewed ? ' is-done' : ''}`}
                        aria-pressed={reviewed}
                        onClick={() => {
                            setReviewedNow(!reviewed);
                            void setReviewed(app, file, !reviewed);
                        }}
                    >
                        <Check size={13} />
                        {t(reviewed ? 'review.reviewed' : 'review.markReviewed')}
                    </button>
                )}
                <button
                    type="button"
                    className="zenith-summary__action"
                    onClick={() => void freeze()}
                    disabled={frozen}
                    title={t('review.freeze.hint')}
                >
                    <Lock size={13} />
                    {t(frozen ? 'review.frozenShort' : 'review.freeze')}
                </button>
            </div>

            {shown.length === 0 && <p className="zenith-summary__empty">{t('review.empty')}</p>}

            {shown.map((section) => (
                <div key={section} className="zenith-summary__section">
                    <span className="zenith-summary__label">{labels.section(section)}</span>
                    {section === 'tasks' && summary.tasks && <p>{labels.tasks(summary.tasks)}</p>}
                    {section === 'habits' &&
                        summary.habits?.map((h) => (
                            <div key={h.id} className="zenith-summary__habit">
                                <span className="zenith-summary__habit-name">{h.name}</span>
                                <span className="zenith-summary__bar" aria-hidden="true">
                                    <span
                                        style={{
                                            width: `${h.days ? (h.kept / h.days) * 100 : 0}%`,
                                        }}
                                    />
                                </span>
                                <span className="zenith-summary__figure">
                                    {h.kept}/{h.days}
                                </span>
                            </div>
                        ))}
                    {section === 'content' && summary.content && (
                        <p>
                            {labels.content(summary.content)}
                            {summary.content.finished.map((item, i) => (
                                <React.Fragment key={`${item.filePath}-${i}`}>
                                    {i === 0 ? ': ' : ', '}
                                    <a
                                        className="internal-link"
                                        onClick={() => openLink(item.filePath)}
                                    >
                                        {item.title}
                                    </a>
                                </React.Fragment>
                            ))}
                        </p>
                    )}
                    {section === 'prayer' && summary.prayer && (
                        <p>{labels.prayer(summary.prayer)}</p>
                    )}
                    {section === 'fasting' && summary.fasting && (
                        <p>
                            {Object.entries(summary.fasting)
                                .map(([kind, n]) => labels.fast(kind as FastKind, n))
                                .join(' · ')}
                        </p>
                    )}
                    {section === 'words' && summary.words && <p>{labels.words(summary.words)}</p>}
                </div>
            ))}
        </div>
    );
};
