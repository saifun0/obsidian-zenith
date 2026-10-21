import React, { useDeferredValue, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Platform } from 'obsidian';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { ObsidianIcon } from '../../../components/shared/ObsidianIcon';
import { useSearchSources, type SearchSource, type Snippet } from '../searchSources';
import { flatRows, rankResults, type ReadSource, type ResultRow } from '../rank';
import { recordPick } from '../recents';

/**
 * The Search panel: one line, and what it finds or would make.
 *
 * Drawn with Obsidian's own prompt classes — `.prompt`, `.prompt-input`,
 * `.suggestion-item` — so it looks like the command palette in every theme,
 * and on a phone sits where the palette does, with the line at the bottom by
 * the keyboard. What is Zenith's own is small: the group headings, the chips a
 * new task was read into, the ✓, and a note's folder.
 */

/** A source's call, kept from taking the panel down with it. */
function safely<T>(source: SearchSource, what: string, read: () => T, fallback: T): T {
    try {
        return read();
    } catch (err) {
        console.error(`Zenith: search source "${source.id}" failed in ${what}`, err);
        return fallback;
    }
}

function heading(source: SearchSource, t: Translator): string {
    if (source.labelKey && t.has(source.labelKey)) return t(source.labelKey);
    return source.label ?? source.id;
}

/** A found line, its words in the quick switcher's highlight. */
const Marked: FC<{ snippet: Snippet }> = ({ snippet }) => {
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const [start, end] of snippet.marks) {
        if (start > at) parts.push(snippet.text.slice(at, start));
        parts.push(
            <span key={start} className="suggestion-highlight">
                {snippet.text.slice(start, end)}
            </span>
        );
        at = end;
    }
    if (at < snippet.text.length) parts.push(snippet.text.slice(at));
    return <>{parts}</>;
};

/** Obsidian's icon, or a Zenith pack's for a `zi:` id — `ObsidianIcon` takes both. */
const Icon: FC<{ name?: string }> = ({ name }) => <ObsidianIcon name={name ?? 'dot'} />;

const MOD = Platform.isMacOS ? '⌘' : 'Ctrl';
const ALT = Platform.isMacOS ? '⌥' : 'Alt';

export const SearchPanel: FC<{ close: () => void }> = ({ close }) => {
    const t = useTranslation();
    const sources = useSearchSources();
    const recents = useZenithStore((s) => s.settings.searchRecents);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    // Bumped after a tick, so the ticked task is read out of the list.
    const [revision, setRevision] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

    // What each source has, read once per opening rather than per keystroke.
    const read = useMemo(() => {
        void revision; // not read: a new value is what asks for the re-read
        return sources.map((source) => ({
            source,
            items: safely(source, 'items', () => source.items?.() ?? [], []),
            creators: safely(source, 'creators', () => source.creators?.() ?? [], []),
        }));
    }, [sources, revision]);

    // A source's rows changed under the open panel: the notes have been read.
    useEffect(() => {
        const offs = sources.map((source) => source.changes?.(() => setRevision((r) => r + 1)));
        return () => offs.forEach((off) => off?.());
    }, [sources]);

    // What the notes say is searched a beat behind the typing, so a large
    // vault never holds up a keystroke.
    const textQuery = useDeferredValue(query.trim());
    const found = useMemo(
        () =>
            new Map(
                read.map(({ source }) => [
                    source.id,
                    textQuery
                        ? safely(source, 'inText', () => source.inText?.(textQuery) ?? [], [])
                        : [],
                ])
            ),
        [read, textQuery]
    );

    const groups = useMemo(() => {
        const ready: ReadSource[] = read.map(({ source, items, creators }) => ({
            id: source.id,
            label: heading(source, t),
            icon: source.icon,
            items,
            suggested: query.trim()
                ? safely(source, 'suggest', () => source.suggest?.(query) ?? [], [])
                : [],
            creators,
            found: query.trim() ? found.get(source.id) : [],
            trailing: source.trailing,
        }));
        return rankResults({
            query,
            sources: ready,
            recents,
            now: Date.now(),
            recentLabel: t('search.recent'),
        });
    }, [read, found, query, recents, t]);

    const rows = useMemo(() => flatRows(groups), [groups]);
    const current = rows[Math.min(selected, rows.length - 1)] as ResultRow | undefined;

    useEffect(() => setSelected(0), [query]);
    useEffect(() => inputRef.current?.focus(), []);
    useEffect(() => {
        rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const choose = (row: ResultRow, how: 'run' | 'complete' | 'reveal' | 'tab' = 'run') => {
        if (row.kind === 'create') {
            close();
            void row.row.run();
            return;
        }
        const { item } = row;
        if (how === 'complete') {
            if (!item.complete) return;
            // Read again at once, for the row to leave with the tick, and when
            // the write is over, for it to come back if the write failed.
            void Promise.resolve(item.complete()).finally(() => setRevision((r) => r + 1));
            setRevision((r) => r + 1);
            return;
        }
        if (!item.transient) {
            const saved = useZenithStore.getState().settings.searchRecents;
            updateSettings({ searchRecents: recordPick(saved, item.id, Date.now()) });
        }
        close();
        if (how === 'reveal' && item.reveal) void item.reveal();
        else if (how === 'tab' && item.openInTab) void item.openInTab();
        else void item.run();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!rows.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setSelected((i) => (Math.min(i, rows.length - 1) + step + rows.length) % rows.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!current) return;
            // Ctrl/Cmd+Enter ticks a task off; a note has nothing to tick, and opens in a tab.
            const tab = current.kind === 'item' && !current.item.complete && current.item.openInTab;
            const how =
                e.ctrlKey || e.metaKey ? (tab ? 'tab' : 'complete') : e.altKey ? 'reveal' : 'run';
            choose(current, how);
        }
    };

    let index = -1;
    const renderRow = (row: ResultRow) => {
        index += 1;
        const i = index;
        const isSelected = current === row;
        const common = {
            ref: (el: HTMLDivElement | null) => {
                rowRefs.current[i] = el;
            },
            className: `suggestion-item mod-complex zenith-search__row${isSelected ? ' is-selected' : ''}`,
            onMouseMove: () => i !== selected && setSelected(i),
            onClick: () => choose(row),
        };

        if (row.kind === 'create') {
            const { row: create } = row;
            return (
                <div key={`create:${create.label}`} {...common}>
                    <div className="suggestion-icon">
                        <span className="suggestion-flair">
                            <Icon name={create.icon ?? 'plus'} />
                        </span>
                    </div>
                    <div className="suggestion-content">
                        <div className="suggestion-title">
                            <span className="zenith-search__kind">{create.label}</span>
                            {create.title}
                        </div>
                    </div>
                    {!!create.chips?.length && (
                        <div className="suggestion-aux zenith-search__chips">
                            {create.chips.map((chip) => (
                                <span key={chip} className="zenith-search__chip">
                                    {chip}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        const { item } = row;
        return (
            <div key={item.id} {...common}>
                <div className="suggestion-icon">
                    <span className="suggestion-flair">
                        <Icon name={row.icon} />
                    </span>
                </div>
                <div className="suggestion-content">
                    <div className="suggestion-title">{item.title}</div>
                    {item.snippet && (
                        <div className="suggestion-note zenith-search__snippet">
                            <Marked snippet={item.snippet} />
                        </div>
                    )}
                </div>
                <div className="suggestion-aux">
                    {item.folder && !Platform.isPhone && (
                        <span className="zenith-search__folder">{item.folder}</span>
                    )}
                    {item.detail && <span className="zenith-search__detail">{item.detail}</span>}
                    {item.hotkey && <kbd className="suggestion-hotkey">{item.hotkey}</kbd>}
                    {/* What Alt+Enter does, for where there is no Alt: the note a
                        task or a library item is written in. */}
                    {item.reveal && (
                        <button
                            type="button"
                            className="clickable-icon zenith-search__done"
                            aria-label={t('search.reveal')}
                            title={t('search.reveal')}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                                e.stopPropagation();
                                choose(row, 'reveal');
                            }}
                        >
                            <ObsidianIcon name="file-text" />
                        </button>
                    )}
                    {item.complete && (
                        <button
                            type="button"
                            className="clickable-icon zenith-search__done"
                            aria-label={t('search.done')}
                            title={t('search.done')}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                                e.stopPropagation();
                                choose(row, 'complete');
                            }}
                        >
                            <ObsidianIcon name="check" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const hints: Array<[string, string]> = [['↑↓', t('search.hint.move')]];
    if (current?.kind === 'create') hints.push(['↵', t('search.hint.create')]);
    else if (current) hints.push(['↵', t('search.hint.open')]);
    if (current?.kind === 'item' && current.item.complete) {
        hints.push([`${MOD} ↵`, t('search.hint.done')]);
    } else if (current?.kind === 'item' && current.item.openInTab) {
        hints.push([`${MOD} ↵`, t('search.hint.tab')]);
    }
    if (current?.kind === 'item' && current.item.reveal) {
        hints.push([`${ALT} ↵`, t('search.hint.note')]);
    }
    hints.push(['esc', t('search.hint.close')]);

    return (
        <>
            <div className={`prompt-input-container${Platform.isPhone ? ' mod-raised' : ''}`}>
                <input
                    ref={inputRef}
                    className="prompt-input"
                    type="text"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    placeholder={t('search.placeholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                <div
                    className="search-input-clear-button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (query ? setQuery('') : close())}
                />
            </div>
            <div className="prompt-results zenith-search__results">
                {groups.map((group) => (
                    <div key={group.id} className="zenith-search__group">
                        {group.label && <div className="zenith-search__heading">{group.label}</div>}
                        {group.rows.map(renderRow)}
                    </div>
                ))}
                {query.trim() && !rows.length && (
                    <div className="suggestion-empty">{t('search.empty')}</div>
                )}
            </div>
            {!Platform.isPhone && (
                <div className="prompt-instructions">
                    {hints.map(([keys, what]) => (
                        <div key={keys} className="prompt-instruction">
                            <span className="prompt-instruction-command">{keys}</span>
                            <span>{what}</span>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};
