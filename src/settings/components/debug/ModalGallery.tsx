import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice, SuggestModal, type Modal as ObsidianModal } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { localizeModule } from '../../../core/moduleLabels';
import { Badge } from '../../../components/shared';
import { DialogInlineContext } from '../../../components/shared/Modal';
import { ActionButton } from '../../controls';
import {
    MODAL_CATALOG,
    type CatalogContext,
    type ModalEntry,
    type NativeModalEntry,
    type ReactModalEntry,
} from './modalCatalog';

/**
 * Every dialog, as a list: each one can be looked at in place, or opened for
 * real.
 *
 * The two buttons do deliberately different things. The preview is a picture —
 * drawn inside the settings pane and made `inert`, so nothing in it can be
 * clicked or focused. That is what makes it safe to show the vault scaffold's
 * "archive everything" button here at all, and it is also why a preview never
 * steals focus from the page it sits on. "Open" is the real dialog, built the
 * way its own caller builds it, whether or not its module is switched on; there
 * every button does what it says, and the answer comes back as a notice.
 *
 * Previews mount one at a time, on request. Several of these dialogs do real
 * work as they open — the media picker lists every image in the vault, the
 * device check writes a probe file — and a tab that did all of that on arrival
 * would be the slowest page in settings.
 */

const describe = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** Keeps a dialog that throws while it renders from taking the page with it. */
class Contained extends Component<
    { children: React.ReactNode; onError?: (error: Error) => void },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error) {
        this.props.onError?.(error);
    }

    render() {
        if (this.state.error) {
            return <div className="zenith-debug__stage-error">{this.state.error.message}</div>;
        }
        return this.props.children;
    }
}

/**
 * `inert` goes on through the DOM because React 18 has no prop for it and warns
 * about the attribute. A ref rather than an effect: refs attach before any
 * effect runs, and a specimen's `onOpen` — which runs in one — may focus a
 * button the moment it exists.
 */
const makeInert = (el: HTMLDivElement | null) => {
    el?.setAttribute('inert', '');
};

/** The specimen frame: a scrim-coloured box that scrolls, around a dialog that cannot be touched. */
const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="zenith-debug__stage">
        <div ref={makeInert} className="zenith-debug__stage-inner">
            {children}
        </div>
    </div>
);

/**
 * An Obsidian `Modal`, built but never opened: its panel is lifted out of the
 * full-screen container it was made in, and `onOpen` fills it where it stands.
 * `open()` is never called, so nothing is pushed onto Obsidian's keymap and
 * there is no scrim to dismiss.
 */
const NativeSpecimen: React.FC<{ entry: NativeModalEntry; ctx: CatalogContext }> = ({
    entry,
    ctx,
}) => {
    const host = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const el = host.current;
        if (!el) return;
        const fail = (err: unknown) => setError(describe(err));

        let modal: ObsidianModal;
        try {
            modal = entry.create(ctx);
            el.appendChild(modal.modalEl);
            void Promise.resolve(modal.onOpen()).catch(fail);
            // A suggester fills its list in answer to its input, and nothing
            // types into a specimen.
            if (modal instanceof SuggestModal) {
                modal.inputEl.dispatchEvent(new Event('input'));
            }
        } catch (err) {
            fail(err);
            return;
        }

        return () => {
            // After the commit rather than during it: three of these mount a
            // React root of their own and unmount it in `onClose`, which React
            // refuses to do while it is still committing this tree.
            window.setTimeout(() => {
                try {
                    modal.onClose();
                } catch {
                    // Already half torn down; the panel goes either way.
                }
                modal.modalEl.remove();
            }, 0);
        };
    }, [entry, ctx]);

    if (error) return <div className="zenith-debug__stage-error">{error}</div>;
    return <div ref={host} className="zenith-debug__stage-host" />;
};

const ReactSpecimen: React.FC<{ entry: ReactModalEntry; ctx: CatalogContext }> = ({
    entry,
    ctx,
}) => (
    <Contained>
        <DialogInlineContext.Provider value={true}>
            {entry.render(ctx, () => undefined)}
        </DialogInlineContext.Provider>
    </Contained>
);

const ModalRow: React.FC<{
    entry: ModalEntry;
    ctx: CatalogContext;
    moduleOff: boolean;
    onOpen: (entry: ModalEntry) => void;
}> = ({ entry, ctx, moduleOff, onOpen }) => {
    const t = useTranslation();
    const [previewing, setPreviewing] = useState(false);
    const sample = entry.sample?.(ctx) ?? false;

    return (
        <div className="zenith-debug__row">
            <div className="zenith-debug__row-main">
                <span className="zenith-debug__row-title">{entry.name}</span>
                <div className="zenith-debug__row-actions">
                    <ActionButton
                        label={previewing ? t('debug.modals.hide') : t('debug.modals.preview')}
                        onClick={() => setPreviewing((v) => !v)}
                    />
                    <ActionButton
                        label={t('debug.modals.open')}
                        cta
                        onClick={() => onOpen(entry)}
                    />
                </div>
            </div>
            <div className="zenith-debug__row-problem">{t(`debug.modals.desc.${entry.id}`)}</div>
            <div className="zenith-debug__row-tags">
                {/* Which kind it is decides how it opens, so it is named the
                    way the code names it. */}
                <Badge text={entry.kind} />
                {entry.writes && <Badge text={t('debug.modals.writes')} variant="warning" />}
                {sample && <Badge text={t('debug.modals.sample')} variant="info" />}
                {moduleOff && <Badge text={t('debug.modals.moduleOff')} variant="danger" dot />}
            </div>
            {previewing && (
                <Stage>
                    {entry.kind === 'obsidian' ? (
                        <NativeSpecimen entry={entry} ctx={ctx} />
                    ) : (
                        <ReactSpecimen entry={entry} ctx={ctx} />
                    )}
                </Stage>
            )}
        </div>
    );
};

export const ModalGallery: React.FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const activeIds = useZenithStore((s) => s.settings.activeModuleIds);
    const modules = useZenithStore((s) => s.availableModules);

    // The one React dialog open for real, with the context it was opened with.
    const [live, setLive] = useState<{ entry: ReactModalEntry; ctx: CatalogContext } | null>(null);
    // Stable, because the shared shell re-runs its focus grab whenever
    // `onClose` changes identity — a new one per render would pull focus back
    // to the first field on every keystroke.
    const closeLive = useCallback(() => setLive(null), []);

    const specimenCtx = useMemo<CatalogContext>(
        () => ({ app, plugin, report: () => undefined }),
        [app, plugin]
    );

    const liveCtx = (entry: ModalEntry): CatalogContext => ({
        app,
        plugin,
        report: (value) =>
            new Notice(
                t('debug.modals.result', {
                    name: entry.name,
                    value: typeof value === 'string' ? value : JSON.stringify(value),
                })
            ),
    });

    const open = (entry: ModalEntry) => {
        if (entry.kind === 'react') {
            setLive({ entry, ctx: liveCtx(entry) });
            return;
        }
        try {
            const ctx = liveCtx(entry);
            if (entry.open) entry.open(ctx);
            else entry.create(ctx).open();
        } catch (err) {
            new Notice(t('debug.modals.failed', { error: describe(err) }));
        }
    };

    // Grouped by owner, in catalogue order: Zenith's own first.
    const groups: Array<{ owner: string; entries: ModalEntry[] }> = [];
    for (const entry of MODAL_CATALOG) {
        const group = groups.find((g) => g.owner === entry.owner);
        if (group) group.entries.push(entry);
        else groups.push({ owner: entry.owner, entries: [entry] });
    }

    const ownerLabel = (owner: string): string => {
        if (owner === 'core') return t('debug.modals.core');
        const manifest = modules.find((m) => m.id === owner);
        return manifest ? localizeModule(t, manifest).name : owner;
    };

    return (
        <div className="zenith-debug__pane">
            <div className="zenith-debug__note">{t('debug.modals.intro')}</div>

            {groups.map(({ owner, entries }) => (
                <section className="zenith-debug__section" key={owner}>
                    <div className="zenith-settings__section-label">{ownerLabel(owner)}</div>
                    <div className="zenith-debug__table">
                        {entries.map((entry) => (
                            <ModalRow
                                key={entry.id}
                                entry={entry}
                                ctx={specimenCtx}
                                moduleOff={owner !== 'core' && !activeIds.includes(owner)}
                                onOpen={open}
                            />
                        ))}
                    </div>
                </section>
            ))}

            {live && (
                <Contained
                    key={live.entry.id}
                    onError={(error) => {
                        new Notice(t('debug.modals.failed', { error: error.message }));
                        closeLive();
                    }}
                >
                    {live.entry.render(live.ctx, closeLive)}
                </Contained>
            )}
        </div>
    );
};
