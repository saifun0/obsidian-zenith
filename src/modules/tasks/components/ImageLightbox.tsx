import React, { useContext, useEffect, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileSymlink, X } from 'lucide-react';
import { TFile } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { DialogInlineContext } from '../../../components/shared/Modal';
import type { TaskAttachment } from '../services/taskDetails';

/**
 * One attachment, full size.
 *
 * Deliberately bare: a backdrop, the picture, and two ways out of it — close,
 * or go to where the picture actually lives. A viewer with a toolbar would be
 * competing with Obsidian's own image handling, which is one click away through
 * the second button.
 *
 * Rendered through a portal to `document.body`, so no ancestor's `overflow:
 * hidden` can clip it — every task row has one.
 */

interface ImageLightboxProps {
    attachment: TaskAttachment;
    /** Resolved `src` — already worked out by the thumbnail that opened this. */
    src: string;
    onClose: () => void;
}

export const ImageLightbox: FC<ImageLightboxProps> = ({ attachment, src, onClose }) => {
    const t = useTranslation();
    const { app } = useApp();
    const isUrl = /^https?:\/\//i.test(attachment.target);
    // Drawn in place on the debug page's modal catalogue; see DialogInlineContext.
    const inline = useContext(DialogInlineContext);
    // The window the user is in, as for the shared Modal: `document` is always
    // the main window's.
    const [host] = useState(() => activeDocument);

    // Escape closes, and the page behind it stops scrolling under the backdrop.
    useEffect(() => {
        if (inline) return;
        const win = host.defaultView ?? window;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        win.addEventListener('keydown', onKey);
        const previous = host.body.style.overflow;
        host.body.setCssStyles({ overflow: 'hidden' });
        return () => {
            win.removeEventListener('keydown', onKey);
            host.body.setCssStyles({ overflow: previous });
        };
    }, [onClose, inline, host]);

    const openSource = () => {
        onClose();
        if (isUrl) {
            window.open(attachment.target, '_blank');
            return;
        }
        const file =
            app.vault.getAbstractFileByPath(attachment.target) ??
            app.metadataCache.getFirstLinkpathDest(attachment.target, '');
        if (file instanceof TFile) void app.workspace.getLeaf(true).openFile(file);
        else void app.workspace.openLinkText(attachment.target, '', true);
    };

    const lightbox = (
        <div
            className={`zenith-lightbox${inline ? ' zenith-lightbox--inline' : ''}`}
            role="dialog"
            aria-modal={!inline}
            aria-label={attachment.label ?? attachment.target}
            // Only a click on the backdrop itself closes — one that started on
            // the picture and drifted off it is not a click on the backdrop.
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <img
                className="zenith-lightbox__img"
                src={src}
                alt={attachment.label ?? attachment.target}
            />

            <div className="zenith-lightbox__bar">
                <span className="zenith-lightbox__name" title={attachment.target}>
                    {attachment.label ?? attachment.target}
                </span>
                <button
                    type="button"
                    className="zenith-lightbox__btn"
                    onClick={openSource}
                    title={t(isUrl ? 'tasks.image.openLink' : 'tasks.image.openInVault')}
                    aria-label={t(isUrl ? 'tasks.image.openLink' : 'tasks.image.openInVault')}
                >
                    {isUrl ? <ExternalLink size={16} /> : <FileSymlink size={16} />}
                </button>
                <button
                    type="button"
                    className="zenith-lightbox__btn"
                    onClick={onClose}
                    title={t('common.close')}
                    aria-label={t('common.close')}
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );

    return inline ? lightbox : createPortal(lightbox, host.body);
};
