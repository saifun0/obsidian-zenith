import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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

    useEffect(() => {
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
            const active = document.activeElement as HTMLElement | null;
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
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus the first meaningful control, skipping the close button.
        const timer = window.setTimeout(() => {
            const target = panelRef.current?.querySelector<HTMLElement>(
                'input:not([type="hidden"]), textarea, select, [data-autofocus]'
            );
            target?.focus();
        }, 0);

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            window.clearTimeout(timer);
        };
    }, [onClose]);

    return createPortal(
        <div className="zenith-root zenith-dialog" role="presentation" onMouseDown={onClose}>
            <div
                ref={panelRef}
                className={`zenith-dialog__panel zenith-dialog__panel--${size} ${className}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {header === null ? (
                    <button
                        type="button"
                        className="zenith-dialog__close zenith-dialog__close--floating"
                        onClick={onClose}
                        aria-label="Close"
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
                            aria-label="Close"
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
        </div>,
        document.body
    );
};
