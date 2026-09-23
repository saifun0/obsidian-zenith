import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { translateNow } from '../../core/i18n';

interface ModalProps {
    /** Accessible name; rendered as the header title unless `header` is given. */
    title?: string;
    /**
     * Custom header content, replacing the plain title. Pass `null` to drop the
     * header row entirely — the close button then floats over the panel (used by
     * edge-to-edge layouts like the poster detail view).
     */
    header?: React.ReactNode | null;
    /** Sticky footer (actions). */
    footer?: React.ReactNode;
    onClose: () => void;
    /** Width preset. `full` lets the panel use the whole viewport width budget. */
    size?: 'sm' | 'md' | 'lg';
    /** Extra class on the panel, for per-modal layout. */
    className?: string;
    /** Drop the default padded body wrapper (for edge-to-edge layouts). */
    bare?: boolean;
    children: React.ReactNode;
}

/**
 * When true, a dialog draws where it stands instead of portalling over the app.
 *
 * Only the debug page's modal catalogue sets it, to show a dialog as a specimen
 * inside the settings pane. In place, the shell drops everything that belongs
 * to being on top of the app: the portal, the fixed scrim, Escape, the body
 * scroll lock, the focus grab. A specimen that locked the page it is shown on
 * would be a bug in the page, not a picture of the dialog.
 */
export const DialogInlineContext = createContext(false);

/**
 * Modal — the shared portal dialog shell.
 *
 * Portals to `<body>`, so the root carries `zenith-root` to re-declare the
 * design tokens and the lucide icon-size guard (portal token-scope gotcha).
 * Handles Escape, scrim clicks, background scroll locking, initial focus and a
 * Tab focus trap. On narrow screens the panel becomes a bottom sheet that can
 * grow to full height — the same markup adapts to phone, tablet and desktop.
 */
export const Modal: React.FC<ModalProps> = ({
    title,
    header,
    footer,
    onClose,
    size = 'md',
    className = '',
    bare = false,
    children,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const inline = useContext(DialogInlineContext);
    // The window the user is working in, fixed for the dialog's life. Not the
    // global `document`, which is always the main window's: a dialog opened
    // from the settings window would otherwise open behind it.
    const [host] = useState(() => activeDocument);

    useEffect(() => {
        if (inline) return;
        const win = host.defaultView ?? window;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;

            const focusable = panelRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = host.activeElement as HTMLElement | null;
            if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        // Bubble phase, not capture: a control inside the dialog (the metadata
        // dropdown) can then take Escape for itself via stopPropagation. In
        // capture phase the dialog would always win and close out from under it.
        win.addEventListener('keydown', onKey);
        const prevOverflow = host.body.style.overflow;
        host.body.style.overflow = 'hidden';

        // Focus the first meaningful control, skipping the close button.
        const timer = win.setTimeout(() => {
            const target = panelRef.current?.querySelector<HTMLElement>(
                'input:not([type="hidden"]), textarea, select, [data-autofocus]'
            );
            target?.focus();
        }, 0);

        return () => {
            win.removeEventListener('keydown', onKey);
            host.body.style.overflow = prevOverflow;
            win.clearTimeout(timer);
        };
    }, [onClose, inline, host]);

    const dialog = (
        <div
            className={`zenith-root zenith-dialog${inline ? ' zenith-dialog--inline' : ''}`}
            role="presentation"
            onMouseDown={inline ? undefined : onClose}
        >
            <div
                ref={panelRef}
                className={`zenith-dialog__panel zenith-dialog__panel--${size} ${className}`}
                role="dialog"
                aria-modal={!inline}
                aria-label={title}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {header === null ? (
                    <button
                        type="button"
                        className="zenith-dialog__close zenith-dialog__close--floating"
                        onClick={onClose}
                        aria-label={translateNow('a11y.close')}
                    >
                        <X size={18} />
                    </button>
                ) : (
                    <div className="zenith-dialog__header">
                        {header ?? <h2 className="zenith-dialog__title">{title}</h2>}
                        <button
                            type="button"
                            className="zenith-dialog__close"
                            onClick={onClose}
                            aria-label={translateNow('a11y.close')}
                        >
                            <X size={18} />
                        </button>
                    </div>
                )}

                <div className={bare ? 'zenith-dialog__body zenith-dialog__body--bare' : 'zenith-dialog__body'}>
                    {children}
                </div>

                {footer && <div className="zenith-dialog__footer">{footer}</div>}
            </div>
        </div>
    );

    return inline ? dialog : createPortal(dialog, host.body);
};
