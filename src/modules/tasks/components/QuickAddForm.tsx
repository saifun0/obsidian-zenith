import React, { useId, useMemo, useRef, useState, type FC } from 'react';
import { X } from 'lucide-react';
import { PRIORITIES, type Priority } from '../../../core/constants';
import { useTranslation, type Translator } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { useFeature } from '../../../core/useFeature';
import { useZenithStore } from '../../../store';
import { DateField, Dropdown } from '../../../components/ui/fields';
import { PRIORITY_EMOJI } from '../services/taskFormat';
import { pieceKey, quickParse, type QuickParse, type QuickPiece } from '../services/quickParse';

export interface QuickAddDraft {
    title: string;
    priority: Priority;
    dueDate: string;
    /** `HH:MM`; only with a date. */
    dueTime?: string;
    dueEndTime?: string;
    /** In the recurrence engine's words. */
    recurrence?: string;
    tags: string[];
}

const PRIORITY_KEY: Record<Priority, string> = {
    none: 'priority.none',
    low: 'priority.low',
    medium: 'priority.medium',
    high: 'priority.high',
    urgent: 'priority.urgent',
};

/** Tag suggestions shown at once — more would push the form off a phone screen. */
const MAX_TAG_SUGGESTIONS = 6;

/** Refusals whose words are still in the title; the rest are forgotten, so retyped words are read again. */
function stillTyped(ignored: ReadonlySet<string>, title: string): ReadonlySet<string> {
    const text = title.toLowerCase().replace(/\s+/g, ' ');
    const kept = [...ignored].filter((key) => text.includes(key.slice(key.indexOf(':') + 1)));
    return kept.length === ignored.size ? ignored : new Set(kept);
}

/** What a chip says: the value understood, not the words typed — those are in the field. */
export function chipLabel(
    piece: QuickPiece,
    parsed: QuickParse,
    date: string,
    t: Translator
): string {
    switch (piece.kind) {
        case 'date':
            return `📅 ${new Date(`${date}T00:00:00`).toLocaleDateString(t.locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
            })}`;
        case 'time': {
            const range = parsed.dueEndTime
                ? `${parsed.dueTime}–${parsed.dueEndTime}`
                : (parsed.dueTime ?? '');
            return `⏰ ${range}${parsed.impliedDate && date === getTodayString() ? ` · ${t('tasks.quickAdd.today')}` : ''}`;
        }
        case 'priority':
            return `${PRIORITY_EMOJI[parsed.priority ?? 'medium']} ${t(PRIORITY_KEY[parsed.priority ?? 'medium'])}`;
        case 'recurrence':
            // In the user's own words: "каждые 3 дня" reads better than any
            // translation of `every 3 days` would.
            return `🔁 ${piece.text}`;
    }
}

/**
 * The questions quick capture asks.
 *
 * It was built from Obsidian's `Setting` rows, which meant a native select for
 * the priority and a native date box for the due date — the two most
 * platform-shaped controls there are, in the one dialog most likely to be
 * opened on a phone. The same fields as everywhere else now.
 *
 * With natural input on, the title field also reads the phrase: each piece it
 * understood becomes a chip under the field, and taking a chip away puts the
 * words back into the title. The date and priority fields show what the
 * phrase said; setting one by hand takes the matching chip away, so there is
 * never a question of which one wins.
 */
export const QuickAddForm: FC<{
    onSubmit: (draft: QuickAddDraft) => Promise<void>;
    /** Off where the form is a specimen on a page, not the dialog itself. */
    autoFocus?: boolean;
}> = ({ onSubmit, autoFocus = true }) => {
    const t = useTranslation();
    const natural = useFeature('tasks.naturalInput');
    const allTasks = useZenithStore((s) => s.tasks);
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState<Priority>('medium');
    const [dueDate, setDueDate] = useState('');
    const [tags, setTags] = useState('');
    const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
    const [busy, setBusy] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);
    const titleId = useId();

    const today = getTodayString();
    const parsed = useMemo(
        () => (natural ? quickParse(title, today, ignored) : null),
        [natural, title, today, ignored]
    );
    const pieceOf = (kind: QuickPiece['kind']) => parsed?.pieces.find((p) => p.kind === kind);

    const ignore = (piece: QuickPiece | undefined) => {
        if (!piece) return;
        setIgnored((prev) => new Set(prev).add(piece.key));
    };

    // `#par` being typed at the end of the title → the tags in use that start so.
    const tagPrefix = natural ? /(?:^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(title)?.[1] : undefined;
    const tagSuggestions = useMemo(() => {
        if (tagPrefix === undefined) return [];
        const counts = new Map<string, number>();
        for (const task of allTasks) {
            for (const tag of task.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        const prefix = tagPrefix.toLowerCase();
        return [...counts.entries()]
            .filter(([tag]) => tag.toLowerCase().startsWith(prefix) && tag.toLowerCase() !== prefix)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, MAX_TAG_SUGGESTIONS)
            .map(([tag]) => tag);
    }, [allTasks, tagPrefix]);

    const completeTag = (tag: string) => {
        setTitle((prev) => `${prev.replace(/#[\p{L}\p{N}_/-]*$/u, `#${tag}`)} `);
        titleRef.current?.focus();
    };

    // A date the phrase said wins over the field; one it only implied (a time
    // with no day) gives way to a date set by hand.
    const shownDate =
        (parsed?.impliedDate ? dueDate || parsed.dueDate : (parsed?.dueDate ?? dueDate)) ?? '';
    const shownPriority = parsed?.priority ?? priority;

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await onSubmit({
                title: (parsed ? parsed.title : title).trim(),
                priority: shownPriority,
                dueDate: shownDate,
                dueTime: parsed?.dueTime,
                dueEndTime: parsed?.dueEndTime,
                recurrence: parsed?.recurrence,
                tags: tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter((tag) => tag.length > 0),
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className="zenith-quick-add__form"
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
        >
            <div className="zenith-quick-add__field">
                <label className="zenith-quick-add__label" htmlFor={titleId}>
                    {t('tasks.editor.description')}
                </label>
                <input
                    id={titleId}
                    ref={titleRef}
                    className="zenith-input"
                    placeholder={t(
                        natural
                            ? 'tasks.quickAdd.placeholderNatural'
                            : 'tasks.editor.descriptionPlaceholder'
                    )}
                    value={title}
                    autoFocus={autoFocus}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setIgnored((prev) => stillTyped(prev, e.target.value));
                    }}
                />

                {tagSuggestions.length > 0 && (
                    <div
                        className="zenith-quick-add__chips"
                        role="group"
                        aria-label={t('tasks.quickAdd.tagSuggestions')}
                    >
                        {tagSuggestions.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className="zenith-quick-add__suggestion"
                                onClick={() => completeTag(tag)}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}

                {parsed && parsed.pieces.length > 0 && (
                    <div
                        className="zenith-quick-add__chips"
                        role="group"
                        aria-label={t('tasks.quickAdd.understood')}
                    >
                        {parsed.pieces.map((piece) => (
                            <span
                                key={piece.key}
                                className="zenith-quick-add__chip"
                                title={piece.text}
                            >
                                {chipLabel(piece, parsed, shownDate, t)}
                                <button
                                    type="button"
                                    className="zenith-quick-add__chip-remove"
                                    aria-label={t('tasks.quickAdd.keepWords', { text: piece.text })}
                                    title={t('tasks.quickAdd.keepWords', { text: piece.text })}
                                    onClick={() =>
                                        setIgnored((prev) =>
                                            new Set(prev).add(pieceKey(piece.kind, piece.text))
                                        )
                                    }
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="zenith-quick-add__row">
                <label className="zenith-quick-add__field">
                    <span className="zenith-quick-add__label">{t('tasks.editor.priority')}</span>
                    <Dropdown
                        value={shownPriority}
                        options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_KEY[p]) }))}
                        onChange={(v) => {
                            ignore(pieceOf('priority'));
                            setPriority(v as Priority);
                        }}
                    />
                </label>
                <label className="zenith-quick-add__field">
                    <span className="zenith-quick-add__label">{t('tasks.editor.due')}</span>
                    <DateField
                        value={shownDate}
                        onChange={(v) => {
                            ignore(pieceOf('date'));
                            setDueDate(v);
                        }}
                    />
                </label>
            </div>

            <label className="zenith-quick-add__field">
                <span className="zenith-quick-add__label">{t('tasks.editor.tags')}</span>
                <input
                    className="zenith-input"
                    placeholder={t('tasks.quickAdd.tagsPlaceholder')}
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />
            </label>

            <div className="zenith-quick-add__actions">
                <button type="submit" className="mod-cta" disabled={busy}>
                    {t('tasks.addTask')}
                </button>
            </div>
        </form>
    );
};
