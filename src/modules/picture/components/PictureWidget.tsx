import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useWidgetConfig } from '../../dashboard/widgetConfig';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { normalizePictureSettings, pictureState } from '../pictureSource';

/**
 * A photograph or a GIF, and nothing else.
 *
 * The card is the frame — it already has the header band every widget wears —
 * so the widget itself draws one picture across the whole body and adds no
 * chrome of its own. There is nothing here to make a caption of: the picture
 * was chosen by the person looking at it.
 *
 * The three things that can go wrong each say so rather than leaving a blank
 * card, because a blank card is indistinguishable from one that was never set
 * up: nothing chosen, something chosen that cannot be shown, and a picture
 * that failed to load — which is only knowable once the browser has tried.
 *
 * Which picture it shows is this copy's own setting, not the module's: a board
 * may hold several, and each is configured on the back of its own card.
 */
export const PictureWidget: React.FC<DashboardWidgetProps> = ({ instanceId = 'picture.frame' }) => {
    const { app } = useApp();
    const t = useTranslation();

    // Keyed by the card rather than by the widget, and subscribed to only that
    // one bucket: three pictures on a board each show their own, and arranging
    // one of them does not repaint the other two.
    const [config] = useWidgetConfig(instanceId, normalizePictureSettings);

    // Remembered by address, not as a flag: choosing a different picture has to
    // clear the last one's failure, and a bare boolean would keep reporting the
    // old link as broken for ever.
    const [failedSrc, setFailedSrc] = useState('');

    const state = pictureState(config, (path) => app.vault.adapter.getResourcePath(path));

    if (state.kind !== 'ready') {
        return (
            <p className="zenith-picture__note">
                {state.kind === 'unusable' && <ImageOff size={13} />}
                {t(state.kind === 'empty' ? 'picture.empty' : 'picture.unusable')}
            </p>
        );
    }

    if (failedSrc === state.src) {
        return (
            <p className="zenith-picture__note">
                <ImageOff size={13} />
                {t('picture.failed')}
            </p>
        );
    }

    return (
        <div className="zenith-picture">
            <img
                className="zenith-picture__img"
                src={state.src}
                alt=""
                style={{ objectFit: config.pictureFit }}
                onError={() => setFailedSrc(state.src)}
                // The board's own drag is a pointer gesture; a picture that can
                // also be dragged out of the card competes with it.
                draggable={false}
            />
        </div>
    );
};
