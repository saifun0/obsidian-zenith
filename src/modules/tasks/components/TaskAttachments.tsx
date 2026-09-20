import React, { useState, type FC } from 'react';
import { TFile } from 'obsidian';
import { CheckSquare, FileText, ImageOff, Link2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { ImageLightbox } from './ImageLightbox';
import { useTranslation } from '../../../core/i18n';
import type { TaskAttachment } from '../services/taskDetails';

/**
 * A task's attachments, as shown in the list.
 *
 * Pictures are shown, everything else is named — a thumbnail of a note is a
 * grey rectangle, and a row of them would say less than the note's title does.
 * The pictures are small on purpose: this is a task list, and an attachment is
 * a reminder that something is attached, not the thing itself.
 */

const isUrl = (target: string): boolean => /^https?:\/\//i.test(target);

/**
 * Resolve an attachment to something the browser can load.
 *
 * `getFirstLinkpathDest` is the fallback that makes a bare "photo.png" work the
 * way it does everywhere else in Obsidian — without it only a full vault path
 * would render.
 */
function useResolvedSrc(target: string): string {
    const { app } = useApp();
    if (isUrl(target)) return target;
    const file =
        app.vault.getAbstractFileByPath(target) ??
        app.metadataCache.getFirstLinkpathDest(target, '');
    return file instanceof TFile ? app.vault.getResourcePath(file) : '';
}

const Thumb: FC<{ attachment: TaskAttachment; onOpen: (src: string) => void }> = ({
    attachment,
    onOpen,
}) => {
    const src = useResolvedSrc(attachment.target);
    const [failed, setFailed] = useState(false);

    if (!src || failed) {
        return (
            <span className="zenith-attachments__missing" title={attachment.target}>
                <ImageOff size={13} />
            </span>
        );
    }

    return (
        <img
            className="zenith-attachments__thumb"
            src={src}
            alt={attachment.label ?? attachment.target}
            title={attachment.label ?? attachment.target}
            loading="lazy"
            onError={() => setFailed(true)}
            onClick={() => onOpen(src)}
        />
    );
};

export const TaskAttachments: FC<{ attachments: TaskAttachment[] }> = ({ attachments }) => {
    const t = useTranslation();
    const { app } = useApp();
    const align = useZenithStore((s) => s.settings.taskImageAlign);
    const size = useZenithStore((s) => s.settings.taskImageSize);
    const [viewing, setViewing] = useState<{ attachment: TaskAttachment; src: string } | null>(
        null
    );

    const images = attachments.filter((a) => a.kind === 'image');
    const rest = attachments.filter((a) => a.kind !== 'image');

    const open = (attachment: TaskAttachment) => {
        if (isUrl(attachment.target)) {
            window.open(attachment.target, '_blank');
            return;
        }
        // `openLinkText` resolves the same way a click in a note would, so a
        // heading link lands on the heading rather than the top of the file.
        void app.workspace.openLinkText(attachment.target, '', false);
    };

    return (
        <div className="zenith-attachments">
            {images.length > 0 && (
                /* The size travels as a custom property, not as `width`. An
                   inline width would outrank every stylesheet rule, including
                   the one that caps thumbnails on a narrow pane — the cap would
                   silently never apply. */
                <div
                    className={`zenith-attachments__images is-${align}`}
                    style={{ '--zenith-thumb': `${size}px` } as React.CSSProperties}
                >
                    {images.map((attachment, i) => (
                        <button
                            key={`${attachment.target}:${i}`}
                            type="button"
                            className="zenith-attachments__image"
                            aria-label={attachment.label ?? attachment.target}
                        >
                            <Thumb
                                attachment={attachment}
                                onOpen={(src) => setViewing({ attachment, src })}
                            />
                        </button>
                    ))}
                </div>
            )}

            {viewing && (
                <ImageLightbox
                    attachment={viewing.attachment}
                    src={viewing.src}
                    onClose={() => setViewing(null)}
                />
            )}

            {rest.length > 0 && (
                <div className="zenith-attachments__links">
                    {rest.map((attachment, i) => (
                        <button
                            key={`${attachment.target}:${i}`}
                            type="button"
                            className={`zenith-attachments__link is-${attachment.kind}`}
                            onClick={() => open(attachment)}
                            title={`${t(`tasks.attach.kind.${attachment.kind}`)} · ${attachment.target}`}
                        >
                            {attachment.kind === 'task' ? (
                                <CheckSquare size={12} />
                            ) : attachment.kind === 'link' ? (
                                <Link2 size={12} />
                            ) : (
                                <FileText size={12} />
                            )}
                            <span className="zenith-attachments__label">
                                {attachment.label ?? attachment.target}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
