import React, { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { reportExtensionFailure } from './health';
import {
    extensions,
    useExtensions,
    type ReplaceableId,
    type Renderer,
    type SlotId,
} from './registry';

interface BoundaryProps {
    moduleId: string;
    where: string;
    /** Drawn instead once the module's part has failed — nothing, unless replacing. */
    fallback?: ReactNode;
    children: ReactNode;
}

/**
 * One module's piece of a built-in view, fenced off: if it throws while
 * drawing, it is reported against its module and the view carries on without
 * it (or with Zenith's own piece, for a replacement).
 */
export class ExtensionBoundary extends Component<BoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        reportExtensionFailure(this.props.moduleId, this.props.where, error);
        if (info.componentStack) console.debug(info.componentStack);
    }

    render(): ReactNode {
        return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
    }
}

/**
 * The same props object for as long as its values are the same ones. A view
 * builds `{ task }` afresh on every render; a DOM renderer would otherwise be
 * torn down and mounted again each time.
 */
function useShallowStable(props: Record<string, unknown>): Record<string, unknown> {
    const ref = useRef(props);
    const prev = ref.current;
    const keys = Object.keys(props);
    const same =
        keys.length === Object.keys(prev).length && keys.every((k) => Object.is(prev[k], props[k]));
    if (!same) ref.current = props;
    return ref.current;
}

/** A DOM-callback renderer, mounted into its own element and cleaned up after. */
const DomMount: React.FC<{
    moduleId: string;
    where: string;
    mount: NonNullable<Renderer<Record<string, unknown>>['mount']>;
    props: Record<string, unknown>;
}> = ({ moduleId, where, mount, props }) => {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let cleanup: void | (() => void);
        try {
            cleanup = mount(el, props);
        } catch (error) {
            reportExtensionFailure(moduleId, where, error);
        }
        return () => {
            try {
                if (typeof cleanup === 'function') cleanup();
            } catch (error) {
                reportExtensionFailure(moduleId, where, error);
            }
            el.replaceChildren();
        };
    }, [moduleId, where, mount, props]);
    return <span ref={ref} className="zenith-ext" data-zenith-module={moduleId} />;
};

function draw(
    renderer: Renderer<Record<string, unknown>>,
    moduleId: string,
    where: string,
    props: Record<string, unknown>
): ReactNode {
    if (renderer.component) {
        const Part = renderer.component;
        return <Part {...props} />;
    }
    if (renderer.mount) {
        return <DomMount moduleId={moduleId} where={where} mount={renderer.mount} props={props} />;
    }
    return null;
}

/**
 * A named place in a built-in view. Draws whatever modules registered for it,
 * in order — and nothing at all when none did, so a view without modules is
 * exactly the view it was.
 */
export const ExtensionSlot: React.FC<{ id: SlotId; props: Record<string, unknown> }> = ({
    id,
    props,
}) => {
    const stable = useShallowStable(props);
    const entries = useExtensions(extensions.slots).filter((e) => e.slot === id);
    if (!entries.length) return null;
    return (
        <>
            {entries.map((entry) => (
                <ExtensionBoundary
                    key={`${entry.moduleId}:${entry.id}`}
                    moduleId={entry.moduleId}
                    where={id}
                >
                    {draw(entry, entry.moduleId, id, stable)}
                </ExtensionBoundary>
            ))}
        </>
    );
};

/**
 * A built-in piece a module may draw instead. The first registration wins;
 * if it fails, Zenith's own is drawn in its place, so a broken module costs
 * the user a customisation rather than the view.
 */
export const Replaceable: React.FC<{
    id: ReplaceableId;
    props: Record<string, unknown>;
    children: ReactNode;
}> = ({ id, props, children }) => {
    const stable = useShallowStable(props);
    const entry = useExtensions(extensions.replacements).find((e) => e.target === id);
    if (!entry) return <>{children}</>;
    return (
        <ExtensionBoundary moduleId={entry.moduleId} where={id} fallback={children}>
            {draw(entry, entry.moduleId, id, stable)}
        </ExtensionBoundary>
    );
};
